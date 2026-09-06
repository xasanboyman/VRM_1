import * as THREE from 'three'
import { decodeAudio2FaceResponse, encodeAudio2FaceRequest, float32FromBytes } from './protobuf.js'

/**
 * Audio2FaceManager
 * 
 * Provides real-time, AI-driven facial expression and lip-sync animation
 * using the Audio2Face microservice (running UniTalker ONNX on port 18083).
 * 
 * Features:
 * - Direct 24kHz PCM audio batching from Gemini Live.
 * - Sub-50ms neural inference returning full ARKit + MMD blendshapes.
 * - Frame-accurate time synchronization with Web Audio currentTime.
 * - Hermite/linear interpolation between 30fps neural frames at 60fps display rate.
 * - Automatic resolution to Ani.vrm morph targets and VRM standard expressions.
 * - Non-blocking asynchronous queue with seamless fallback.
 */
export class Audio2FaceManager {
  constructor(vrm, options = {}) {
    this.vrm = vrm
    // Official persistent JSON WebSocket endpoint on port 18083.
    // Maintains a single long-lived connection for sub-50ms neural inference across all utterances.
    const DEFAULT_AUDIO2FACE_WS_URL = 'wss://xn--dr8haa.uz/oracle/audio2face/api/v1/audio2face/ws'
    const DEFAULT_AUDIO2FACE_API_URL = 'https://xn--dr8haa.uz/oracle/audio2face/api/v1/audio2face/generate'
    const envWsUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_AUDIO2FACE_WS_URL
    const envApiUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_AUDIO2FACE_URL

    this.apiEndpoint = options.apiEndpoint || (envApiUrl ? `${envApiUrl.replace(/\/+$/, '')}/api/v1/audio2face/generate` : DEFAULT_AUDIO2FACE_API_URL)
    this.wsEndpoint = options.wsEndpoint || (envWsUrl && !envWsUrl.includes('streaming_audio2face') ? envWsUrl : DEFAULT_AUDIO2FACE_WS_URL)
    this.profileName = options.profileName || 'Ani-default'
    this.enabled = options.enabled !== false
    this.isAvailable = true
    this.failureCount = 0
    // Gemini Live supplies 24 kHz PCM, while the upstream UniTalker model is
    // trained for 16 kHz input. Keep both rates explicit so audio playback is
    // untouched and only the inference copy is resampled.
    this.inputSampleRate = options.inputSampleRate || 24000
    this.sampleRate = options.sampleRate || 16000
    this.smoothingFactor = options.smoothingFactor || 0.65
    this.blendshapeMultiplier = options.blendshapeMultiplier || 1.15

    // Single persistent WebSocket connection
    this.ws = null
    this.wsPendingRequests = new Map()
    this.wsReconnectTimer = null
    if (this.wsEndpoint) {
      this._initWebSocket()
    }

    // Playback state
    this.currentTimeline = null
    this.playbackStartTime = 0
    this.isPlaying = false
    this.resolvedExpressionMap = new Map()

    // Audio batch accumulation
    this.pendingAudioChunks = []
    this.pendingAudioSamples = 0
    this.minBatchSamples = Math.floor(this.inputSampleRate * 0.4) // 400ms min batch
    this.isDispatching = false

    // Fallback callback if needed
    this.onBlendshapesTick = options.onBlendshapesTick || null

    // Cache active blendshape names to quickly zero them on stop
    this.activeAppliedMorphs = new Set()
  }

  setVRM(vrm) {
    this.vrm = vrm
    this.resolvedExpressionMap.clear()
    this.activeAppliedMorphs.clear()
  }

  /**
   * Resolve an Audio2Face / MMD / ARKit blendshape name to a valid VRM expression.
   */
  _resolveExpressionName(rawName) {
    if (!this.vrm?.expressionManager) return null
    if (this.resolvedExpressionMap.has(rawName)) {
      return this.resolvedExpressionMap.get(rawName)
    }

    const em = this.vrm.expressionManager
    const lower = rawName.toLowerCase()

    // Strictly suppress mouth-closing / smirk / narrow / non-speech emotion expressions so they never fight lip-sync
    const SUPPRESS_DURING_SPEECH = new Set([
      'にやり', 'にやり２', '口横狭め', 'ん', 'mouth_close', 'てへぺろ', 'ぺろっ', 'ω', 'smirk',
      'smile', 'にっこり', 'cat_mouth', 'tongue', 'tehepero', 'serious', '真面目', 'laugh', '笑い',
      '喜び', 'にこり', '怒り', '困る', 'びっくり', 'じと目'
    ])
    if (SUPPRESS_DURING_SPEECH.has(rawName) || SUPPRESS_DURING_SPEECH.has(lower)) {
      this.resolvedExpressionMap.set(rawName, null)
      return null
    }

    // Japanese MMD Vowels & Eye Blinks -> VRM Standard
    const PHONEME_MAP = {
      'あ': 'aa',
      'ワ': 'aa',
      'あ２': 'aa',
      'い': 'ih',
      'い１': 'ih',
      'い２': 'ih',
      'う': 'ou',
      'え': 'ee',
      'お': 'oh',
      '口横広げ': '口横広げ',
      '口角上げ': '口角上げ',
      'まばたき': 'blink',
      'ウィンク２': 'blinkLeft',
      'ウィンク２右': 'blinkRight',
    }

    const ARKIT_MAP = {
      jawopen: 'aa',
      mouthfunnel: 'oh',
      mouthpucker: 'ou',
      eyeblinkleft: 'blinkLeft',
      eyeblinkright: 'blinkRight',
    }

    let target = null
    if (PHONEME_MAP[rawName] && em.getExpression(PHONEME_MAP[rawName])) {
      target = PHONEME_MAP[rawName]
    } else if (ARKIT_MAP[lower] && em.getExpression(ARKIT_MAP[lower])) {
      target = ARKIT_MAP[lower]
    } else if (['aa', 'ih', 'ou', 'ee', 'oh', 'blink', 'blinkleft', 'blinkright'].includes(lower)) {
      const vrmPreset = lower === 'blinkleft' ? 'blinkLeft' : lower === 'blinkright' ? 'blinkRight' : lower
      if (em.getExpression(vrmPreset)) target = vrmPreset
    }

    if (target && !em.getExpression(target)) {
      if (target === 'blinkLeft' || target === 'blinkRight') {
        target = em.getExpression('blink') ? 'blink' : null
      } else {
        target = null
      }
    }

    this.resolvedExpressionMap.set(rawName, target)
    return target
  }

  /**
   * Push incoming 24kHz PCM audio chunk (Int16Array) from Gemini Live.
   */
  async pushAudio(int16Data, speechStartTime = null) {
    if (!this.enabled || !int16Data || int16Data.length === 0) return

    this.pendingAudioChunks.push(int16Data)
    this.pendingAudioSamples += int16Data.length

    // Dispatch when batch threshold is met or explicitly flushed
    if (this.pendingAudioSamples >= this.minBatchSamples && !this.isDispatching) {
      await this.dispatchAudio(speechStartTime)
    }
  }

  async flushPendingAudio(speechStartTime = null) {
    return this.dispatchAudio(speechStartTime)
  }

  _initWebSocket() {
    if (typeof window === 'undefined' || !this.enabled || !this.wsEndpoint) return
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return

    try {
      const ws = new WebSocket(this.wsEndpoint)
      this.ws = ws

      ws.onopen = () => {
        console.log('⚡ Audio2Face WebSocket connected:', this.wsEndpoint)
        this.isAvailable = true
        this.failureCount = 0
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const reqId = data.request_id
          if (reqId && this.wsPendingRequests.has(reqId)) {
            const pending = this.wsPendingRequests.get(reqId)
            this.wsPendingRequests.delete(reqId)
            clearTimeout(pending.timer)
            pending.resolve(data)
          }
        } catch (e) {
          console.warn('Audio2Face WS message parse error:', e)
        }
      }

      ws.onerror = () => {
        // Quietly wait for server
      }

      ws.onclose = () => {
        this.ws = null
        for (const [id, pending] of this.wsPendingRequests.entries()) {
          clearTimeout(pending.timer)
          pending.reject(new Error('Audio2Face WebSocket closed'))
        }
        this.wsPendingRequests.clear()

        // Reconnect every 5s so it stays online
        if (this.enabled && !this.wsReconnectTimer) {
          this.wsReconnectTimer = setTimeout(() => {
            this.wsReconnectTimer = null
            this._initWebSocket()
          }, 5000)
        }
      }
    } catch (_) {}
  }

  _sendWsRequest(payload, requestId, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.wsPendingRequests.delete(requestId)
        reject(new Error(`Audio2Face WS request timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.wsPendingRequests.set(requestId, { resolve, reject, timer })
      try {
        this.ws.send(JSON.stringify(payload))
      } catch (err) {
        clearTimeout(timer)
        this.wsPendingRequests.delete(requestId)
        reject(err)
      }
    })
  }

  _resamplePcm16(source, inputRate = this.inputSampleRate, outputRate = this.sampleRate) {
    if (inputRate === outputRate) return source
    const outputLength = Math.max(1, Math.round(source.length * outputRate / inputRate))
    const output = new Int16Array(outputLength)
    const ratio = inputRate / outputRate
    for (let index = 0; index < outputLength; index++) {
      const position = index * ratio
      const before = Math.floor(position)
      const after = Math.min(before + 1, source.length - 1)
      const amount = position - before
      output[index] = Math.round(source[before] * (1 - amount) + source[after] * amount)
    }
    return output
  }

  /**
   * Send one PCM utterance through the official Audio2Face protobuf protocol.
   * The response is deliberately collected before playback starts so its first
   * viseme frame shares the exact Web Audio start clock with the sound.
   */
  _generateOfficialTimeline(pcmBytes, requestId) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsEndpoint)
      ws.binaryType = 'arraybuffer'
      const names = []
      const frames = []
      let settled = false
      const finish = (value, error = null) => {
        if (settled) return
        settled = true
        try { ws.close() } catch (_) {}
        if (error) reject(error)
        else resolve(value)
      }
      const timer = setTimeout(() => finish(null, new Error('Audio2Face inference timed out')), 12000)
      const resolveOnce = (value, error = null) => {
        clearTimeout(timer)
        finish(value, error)
      }

      ws.onopen = () => {
        ws.send(encodeAudio2FaceRequest({
          className: 'StreamingAudio2FaceV1ChunkStart',
          requestId,
          sampleRate: this.sampleRate,
          sampleWidth: 2,
          channels: 1,
          profileName: this.profileName,
          responseChunkFrames: 10,
        }))
        ws.send(encodeAudio2FaceRequest({
          className: 'StreamingAudio2FaceV1ChunkBody',
          requestId,
          pcmBytes,
        }))
        ws.send(encodeAudio2FaceRequest({
          className: 'StreamingAudio2FaceV1ChunkEnd',
          requestId,
        }))
      }
      ws.onmessage = (event) => {
        try {
          const response = decodeAudio2FaceResponse(event.data)
          if (response.className === 'Audio2FaceV1ResponseChunkStart') {
            names.splice(0, names.length, ...response.blendshapeNames)
          } else if (response.className === 'Audio2FaceV1ResponseChunkBody') {
            const values = float32FromBytes(response.data)
            if (!names.length || values.length % names.length !== 0) {
              throw new Error('Audio2Face returned an invalid blendshape frame')
            }
            for (let i = 0; i < values.length; i += names.length) {
              frames.push(Array.from(values.slice(i, i + names.length)))
            }
          } else if (response.className === 'Audio2FaceV1ResponseChunkEnd') {
            resolveOnce({ fps: 30, blendshape_names: names, weights: frames })
          }
        } catch (error) {
          resolveOnce(null, error)
        }
      }
      ws.onerror = () => resolveOnce(null, new Error('Audio2Face WebSocket connection failed'))
      ws.onclose = () => {
        if (!settled) resolveOnce(null, new Error('Audio2Face closed before completing inference'))
      }
    })
  }

  /**
   * Flush all accumulated audio and trigger neural blendshape inference.
   */
  async dispatchAudio(speechStartTime = null) {
    if (!this.enabled || !this.isAvailable || this.pendingAudioChunks.length === 0 || this.isDispatching) return

    this.isDispatching = true
    const chunks = this.pendingAudioChunks
    const totalSamples = this.pendingAudioSamples
    this.pendingAudioChunks = []
    this.pendingAudioSamples = 0

    // Audio2Face requires at least ~67ms (1600 samples @ 24kHz) to generate at least 1 blendshape frame
    if (totalSamples < 1600) {
      this.isDispatching = false
      return
    }

    try {
      // Merge Int16 chunks
      const mergedPcm = new Int16Array(totalSamples)
      let offset = 0
      for (const chunk of chunks) {
        mergedPcm.set(chunk, offset)
        offset += chunk.length
      }

      const modelPcm = this._resamplePcm16(mergedPcm)
      const uint8 = new Uint8Array(modelPcm.buffer, modelPcm.byteOffset, modelPcm.byteLength)

      // Zero-copy / chunked Uint8 to base64
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize))
      }
      const b64 = btoa(binary)
      const requestId = 'a2f_' + Math.random().toString(36).substring(2) + Date.now()

      const payload = {
        request_id: requestId,
        audio_base64: b64,
        sample_rate: this.sampleRate,
        profile_name: this.profileName,
      }

      let res = null

      // 1. Send through persistent WebSocket (single long-lived connection)
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this._initWebSocket()
      }

      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 800)
          const onOpen = () => { clearTimeout(timer); resolve() }
          const onError = () => { clearTimeout(timer); resolve() }
          this.ws?.addEventListener('open', onOpen, { once: true })
          this.ws?.addEventListener('error', onError, { once: true })
        })
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          res = await this._sendWsRequest(payload, requestId, 6000)
        } catch (wsErr) {
          console.warn('Audio2Face persistent WS error, trying HTTP fallback:', wsErr)
        }
      }

      // 2. HTTP POST fallback (clean HTTP fetch, never opens throwaway WebSockets)
      if ((!res || !res.ok) && this.apiEndpoint) {
        try {
          const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (response.ok) {
            res = await response.json()
          }
        } catch (httpErr) {
          // Both paths quiet fallback
        }
      }

      if (res && res.ok && res.weights && res.weights.length > 0) {
        this.failureCount = 0
        this._appendTimeline(res, speechStartTime)
      }
    } catch (err) {
      // Waiting for Audio2Face backend
    } finally {
      this.isDispatching = false
    }
  }

  /**
   * Append blendshape frames into active playback timeline.
   */
  _appendTimeline(res, speechStartTime = null) {
    const fps = res.fps || 30
    const frameDuration = 1.0 / fps
    const names = res.blendshape_names || []
    const weights = res.weights || []

    // UniTalker ONNX raw outputs for Japanese vowels (あ, ワ, あ２) average 0.02 - 0.08.
    // Calibrated generous gains bring them into clearly visible, expressive 0.35 - 0.85 VRM conversational range.
    const VOWEL_GAINS = {
      aa: 11.5,
      oh: 3.2,
      ou: 2.2,
      ee: 7.5,
      ih: 7.0,
      口横広げ: 8.0,
      口角上げ: 6.0,
    }

    const newFrames = []
    for (let i = 0; i < weights.length; i++) {
      const frameWeights = weights[i]
      const frameMap = new Map()
      for (let j = 0; j < names.length; j++) {
        const val = frameWeights[j] || 0
        if (val > 0.003) {
          const resolved = this._resolveExpressionName(names[j])
          if (resolved) {
            const gain = VOWEL_GAINS[resolved] || this.blendshapeMultiplier
            const current = frameMap.get(resolved) || 0
            frameMap.set(resolved, Math.max(current, val * gain))
          }
        }
      }
      newFrames.push(frameMap)
    }

    if (!this.currentTimeline || !this.isPlaying) {
      this.currentTimeline = {
        fps,
        frameDuration,
        frames: newFrames,
        duration: newFrames.length * frameDuration
      }
      this.playbackStartTime = speechStartTime !== null ? speechStartTime : (performance.now() / 1000)
      this.isPlaying = true
    } else {
      // Append to ongoing timeline
      this.currentTimeline.frames.push(...newFrames)
      this.currentTimeline.duration = this.currentTimeline.frames.length * frameDuration
    }
  }

  /**
   * Per-frame update called by the render loop.
   * @param {number} currentTime Current audio or wall clock time in seconds
   */
  update(currentTime) {
    if (!this.isPlaying || !this.currentTimeline || !this.vrm?.expressionManager) return

    const em = this.vrm.expressionManager
    const elapsed = Math.max(0, currentTime - this.playbackStartTime)

    if (elapsed > this.currentTimeline.duration + 0.3) {
      this.stop()
      return
    }

    const { fps, frameDuration, frames } = this.currentTimeline
    const rawFrame = elapsed / frameDuration
    const indexA = Math.floor(rawFrame)
    const indexB = Math.min(indexA + 1, frames.length - 1)
    const alpha = rawFrame - indexA

    const frameA = frames[indexA] || null
    const frameB = frames[indexB] || null

    if (!frameA) return

    const keysToApply = new Set([...frameA.keys(), ...(frameB ? frameB.keys() : [])])

    // Decay any active morphs that are no longer referenced in the current frame
    for (const key of this.activeAppliedMorphs) {
      if (!keysToApply.has(key) && key !== '口横広げ' && key !== '口角上げ') {
        const cur = em.getValue(key) || 0
        if (cur > 0.01) {
          em.setValue(key, cur * 0.4)
        } else {
          em.setValue(key, 0)
          this.activeAppliedMorphs.delete(key)
        }
      }
    }

    for (const key of keysToApply) {
      const valA = frameA.get(key) || 0
      const valB = frameB ? (frameB.get(key) || 0) : valA
      const interpolated = THREE.MathUtils.lerp(valA, valB, Math.min(1.0, Math.max(0, alpha)))
      
      let clamped = Math.min(1.0, Math.max(0, interpolated))

      // Human conversational mouth shaping: wide, expressive, well-proportioned
      if (key === 'aa') {
        clamped = Math.min(0.85, clamped)
      } else if (key === 'oh') {
        clamped = Math.min(0.30, clamped)
      } else if (key === 'ou') {
        clamped = Math.min(0.20, clamped)
      } else if (key === 'ee') {
        clamped = Math.min(0.70, clamped)
      } else if (key === 'ih') {
        clamped = Math.min(0.65, clamped)
      } else if (key === '口横狭め' || key === 'にやり' || key === 'にやり２' || key === 'mouth_close' || key === 'ん') {
        clamped = 0.0
      }

      em.setValue(key, clamped)
      this.activeAppliedMorphs.add(key)
    }

    // Mutually balance vertical vowels: keep 'aa' broad and prevent 'oh'/'ou' from overpowering
    const curAa = em.getValue('aa') || 0
    const curOh = em.getValue('oh') || 0
    const curOu = em.getValue('ou') || 0
    if (curAa > 0.12) {
      if (curOh > 0.25) em.setValue('oh', 0.25)
      if (curOu > 0.15) em.setValue('ou', 0.15)
    }

    // Ensure natural human horizontal width and corner pull whenever mouth is open
    const finalAa = em.getValue('aa') || 0
    const finalOh = em.getValue('oh') || 0
    const finalEe = em.getValue('ee') || 0
    const finalIh = em.getValue('ih') || 0
    const verticalOpen = Math.max(finalAa, finalOh * 0.8, finalEe * 0.65, finalIh * 0.65)

    if (verticalOpen > 0.02) {
      if (em.getExpression('口横広げ')) {
        const wideVal = Math.min(0.85, Math.max(0.30, verticalOpen * 0.95))
        em.setValue('口横広げ', wideVal)
        this.activeAppliedMorphs.add('口横広げ')
      }
      if (em.getExpression('口角上げ')) {
        const cornerVal = Math.min(0.35, Math.max(0.12, verticalOpen * 0.45))
        em.setValue('口角上げ', cornerVal)
        this.activeAppliedMorphs.add('口角上げ')
      }
      if (em.getExpression('口横狭め')) {
        em.setValue('口横狭め', 0)
      }
    } else {
      if (em.getExpression('口横広げ') && this.activeAppliedMorphs.has('口横広げ')) {
        const curWide = em.getValue('口横広げ') || 0
        if (curWide > 0.01) {
          em.setValue('口横広げ', curWide * 0.4)
        } else {
          em.setValue('口横広げ', 0)
          this.activeAppliedMorphs.delete('口横広げ')
        }
      }
      if (em.getExpression('口角上げ') && this.activeAppliedMorphs.has('口角上げ')) {
        const curCorners = em.getValue('口角上げ') || 0
        if (curCorners > 0.01) {
          em.setValue('口角上げ', curCorners * 0.4)
        } else {
          em.setValue('口角上げ', 0)
          this.activeAppliedMorphs.delete('口角上げ')
        }
      }
    }

    // CRITICAL: Call em.update() so VRM transforms the mesh morph vertices on GPU!
    em.update()
    this.mouthOpenValue = Math.max(
      finalAa,
      finalOh,
      (em.getValue('ou') || 0) * 0.8,
      (em.getValue('ee') || 0) * 0.7,
      (em.getValue('ih') || 0) * 0.7
    )
    this.onBlendshapesTick?.(keysToApply)
  }

  /**
   * Stop playback and reset blendshapes.
   */
  stop() {
    this.isPlaying = false
    this.currentTimeline = null
    this.pendingAudioChunks = []
    this.pendingAudioSamples = 0
    this.mouthOpenValue = 0
    if (this.vrm?.expressionManager) {
      const em = this.vrm.expressionManager
      for (const morph of this.activeAppliedMorphs) {
        try {
          em.setValue(morph, 0)
        } catch (e) {}
      }
      this.activeAppliedMorphs.clear()
      em.update()
    }
  }
}
