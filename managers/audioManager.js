import { Audio2FaceManager } from './audio2faceManager.js'

export class AudioManager {
  audioCtx = null
  analyser = null
  nextStartTime = 0
  mouthRaf = null
  mouthReleaseRaf = null
  activeSources = []
  onSpeechStart = null
  onSpeechEnd = null
  onAudioProgress = null
  onMouthOpenChange = null
  onVisemeTick = null
  isPlaying = false
  isUserSpeaking = false
  currentVrm = null
  audio2face = null

  speechStartTime = 0
  totalScheduledDuration = 0

  // Multi-viseme current values
  visemeValues = {
    aa: 0,
    ee: 0,
    ih: 0,
    oh: 0,
    ou: 0,
  }
  mouthOpenValue = 0 // Aggregate mouth opening for backwards compatibility

  timeDomainDataArray = null
  frequencyDataArray = null

  // Smoothing parameters (asymmetric attack/decay)
  attackSmoothing = 0.48
  decaySmoothing = 0.18
  noiseFloor = 0.012
  maxTotalAperture = 0.42 // Human conversational speech aperture (prevents vertical gaping)

  async initialize() {
    if (this.audioCtx) return
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.35
    this.analyser.connect(this.audioCtx.destination)
    this.timeDomainDataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.frequencyDataArray = new Uint8Array(this.analyser.frequencyBinCount)
    if (!this.audio2face) {
      this.audio2face = new Audio2FaceManager(this.currentVrm || window.currentVrm)
    }
    console.log('Audio System Ready with Audio2Face Neural Lip-Sync & Formant Fallback')
  }

  async queueAudio(int16Data) {
    const vrm = window.currentVrm
    if (vrm) {
      this.currentVrm = vrm
      if (this.audio2face && this.audio2face.vrm !== vrm) {
        this.audio2face.setVRM(vrm)
      }
    }
    if (!this.audio2face) {
      this.audio2face = new Audio2FaceManager(this.currentVrm || vrm)
    }
    if (this.isUserSpeaking) return
    if (this.audio2face && this.audio2face.enabled) {
      this.audio2face.pushAudio(int16Data, this.speechStartTime)
    }
    await this.playChunk(int16Data, vrm || this.currentVrm)
  }

  /**
   * Play a complete buffered speech utterance synchronized with Speech2Motion.
   */
  async playBufferedUtterance(int16Data, vrm = null, motionTrack = null, onStart = null) {
    if (!int16Data || int16Data.length === 0) return null
    this.isUserSpeaking = false
    if (!this.audioCtx) await this.initialize()
    if (!this.audioCtx) return null
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume()

    const targetVrm = vrm || this.currentVrm || (typeof window !== 'undefined' ? window.currentVrm : null)
    if (targetVrm) {
      this.currentVrm = targetVrm
      if (this.audio2face && this.audio2face.vrm !== targetVrm) {
        this.audio2face.setVRM(targetVrm)
      }
    }

    if (this.mouthReleaseRaf) {
      cancelAnimationFrame(this.mouthReleaseRaf)
      this.mouthReleaseRaf = null
    }

    this.setPlaybackState(true)

    const float32Data = new Float32Array(int16Data.length)
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768.0
    }

    const audioBuffer = this.audioCtx.createBuffer(1, float32Data.length, 24000)
    audioBuffer.getChannelData(0).set(float32Data)

    const source = this.audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.analyser)

    const now = this.audioCtx.currentTime
    // Synchronized start time with small 40ms lookahead for frame-accurate start
    const startTime = Math.max(now + 0.04, this.nextStartTime)
    this.speechStartTime = startTime
    this.nextStartTime = startTime + audioBuffer.duration
    this.totalScheduledDuration = audioBuffer.duration

    // Push to Audio2Face for neural facial lip sync
    if (this.audio2face && this.audio2face.enabled) {
      this.audio2face.pushAudio(int16Data, startTime)
      this.audio2face.flushPendingAudio(startTime)
    }

    // Connect to Speech2Motion for full synchronized skeletal motion
    const speech2motion = this.speech2motion || (typeof window !== 'undefined' ? window.animationManager?.speech2motion : null)
    if (speech2motion && motionTrack) {
      speech2motion.startSynchronizedSpeech(motionTrack, startTime, audioBuffer.duration)
    }

    source.start(startTime)
    this.activeSources.push(source)
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source)
      const hasPendingScheduled = this.audioCtx && (this.nextStartTime > (this.audioCtx.currentTime + 0.05))
      if (this.activeSources.length === 0 && !hasPendingScheduled) {
        this.setPlaybackState(false)
      }
    }

    if (this.currentVrm && !this.mouthRaf) this.startMouthSync(this.currentVrm)

    if (typeof onStart === 'function') {
      const delayMs = Math.max(0, Math.round((startTime - now) * 1000))
      if (delayMs > 0) {
        setTimeout(onStart, delayMs)
      } else {
        onStart()
      }
    }

    return new Promise((resolve) => {
      const leadTime = 0.20 // 200ms lookahead so next streamed chunk queues seamlessly without gap
      const checkEnd = () => {
        const audioFinished = this.audioCtx && (this.audioCtx.currentTime >= (startTime + audioBuffer.duration - leadTime))
        if (!this.isPlaying || this.isUserSpeaking || audioFinished) {
          resolve({ startTime, duration: audioBuffer.duration })
        } else {
          setTimeout(checkEnd, 30)
        }
      }
      setTimeout(checkEnd, Math.max(50, Math.floor((audioBuffer.duration - leadTime) * 1000)))
    })
  }

  async playChunk(int16Data, vrm = null) {
    if (this.isUserSpeaking) return
    if (!this.audioCtx) await this.initialize()
    if (!this.audioCtx) return
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume()

    if (vrm) this.currentVrm = vrm
    if (this.mouthReleaseRaf) {
      cancelAnimationFrame(this.mouthReleaseRaf)
      this.mouthReleaseRaf = null
    }

    this.setPlaybackState(true)

    const float32Data = new Float32Array(int16Data.length)
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768.0
    }

    const audioBuffer = this.audioCtx.createBuffer(1, float32Data.length, 24000)
    audioBuffer.getChannelData(0).set(float32Data)

    const source = this.audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.analyser)

    const now = this.audioCtx.currentTime
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.05
      this.speechStartTime = this.nextStartTime
      this.totalScheduledDuration = 0
    }

    source.start(this.nextStartTime)
    this.nextStartTime += audioBuffer.duration
    this.totalScheduledDuration += audioBuffer.duration

    this.activeSources.push(source)
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source)
    }

    if (this.currentVrm && !this.mouthRaf) this.startMouthSync(this.currentVrm)
  }

  startMouthSync(vrm) {
    const tick = () => {
      if (!this.audioCtx || !this.analyser) return

      if (this.isUserSpeaking) {
        this.stopMouthSync(vrm)
        this.setPlaybackState(false)
        return
      }

      if (this.audioCtx.currentTime > this.nextStartTime + 0.1) {
        this.stopMouthSync(vrm)
        this.setPlaybackState(false)
        return
      }

      const elapsed = Math.max(0, this.audioCtx.currentTime - this.speechStartTime)
      const progress = this.totalScheduledDuration > 0
        ? Math.min(1.0, elapsed / this.totalScheduledDuration)
        : 0
      this.onAudioProgress?.({
        isPlaying: true,
        elapsed,
        totalDuration: this.totalScheduledDuration,
        progress,
        mouthOpen: this.mouthOpenValue,
      })

      // Audio2Face Neural Blendshape Override
      if (this.audio2face && this.audio2face.isPlaying) {
        this.audio2face.update(this.audioCtx.currentTime)
        this.mouthOpenValue = this.audio2face.mouthOpenValue || 0
        this.onMouthOpenChange?.(this.mouthOpenValue)
        this.onVisemeTick?.({
          volume: 0.1,
          mouthOpen: this.mouthOpenValue,
          visemes: { aa: this.mouthOpenValue },
        })

        // Audio2Face is the primary neural lip-sync model; let it drive the mouth exclusively
        this.mouthRaf = requestAnimationFrame(tick)
        return
      }

      const binCount = this.analyser.frequencyBinCount
      if (!this.timeDomainDataArray || this.timeDomainDataArray.length !== binCount) {
        this.timeDomainDataArray = new Uint8Array(binCount)
        this.frequencyDataArray = new Uint8Array(binCount)
      }

      this.analyser.getByteTimeDomainData(this.timeDomainDataArray)
      this.analyser.getByteFrequencyData(this.frequencyDataArray)

      // 1. RMS Volume Calculation
      let sum = 0
      for (let i = 0; i < this.timeDomainDataArray.length; i++) {
        const val = (this.timeDomainDataArray[i] - 128) / 128
        sum += val * val
      }
      const rawVolume = Math.sqrt(sum / this.timeDomainDataArray.length)
      const volume = Math.max(0, rawVolume - this.noiseFloor) / (1 - this.noiseFloor)

      // If audio is practically silent, smoothly decay to rest
      if (volume <= 0.001) {
        this._smoothDecayVisemes(vrm)
        this.mouthRaf = requestAnimationFrame(tick)
        return
      }

      // 2. Frequency Formant Energy Decomposition
      // Nyquist freq = 12000Hz (at 24kHz buffer) with 256 bins -> ~46.875 Hz per bin
      const sampleRate = this.audioCtx.sampleRate || 24000
      const hzPerBin = (sampleRate / 2) / binCount

      const getBandEnergy = (startHz, endHz) => {
        const startBin = Math.max(0, Math.floor(startHz / hzPerBin))
        const endBin = Math.min(binCount - 1, Math.ceil(endHz / hzPerBin))
        if (startBin >= endBin) return 0
        let total = 0
        for (let b = startBin; b <= endBin; b++) {
          total += this.frequencyDataArray[b]
        }
        return total / ((endBin - startBin + 1) * 255)
      }

      const fundamental = getBandEnergy(100, 420)   // F0 - vocal cord fundamental
      const formant1 = getBandEnergy(420, 1150)     // F1 - vowel openness (aa, oh)
      const formant2 = getBandEnergy(1150, 2400)    // F2 - dental / front vowel (ih)
      const formant3 = getBandEnergy(2400, 5200)    // F3 - high spread vowel / sibilant (ee)

      // 3. Synthesize Specific Viseme Formant Weights (Human conversational speech scale)
      const speechFactor = Math.min(1.0, volume * 5.5)

      // 'aa' (Open jaw): Primary F1 vowel energy, natural visible speech range (up to 0.85)
      let targetAa = Math.min(0.85, formant1 * 3.8 * speechFactor)

      // 'ee' (Wide smile/spread): High F3 formant relative to low frequencies
      let targetEe = Math.min(0.70, (formant3 * 2.8 + Math.max(0, formant3 - fundamental) * 2.0) * speechFactor)

      // 'ih' (Teeth parted / mid-spread): F2 formant
      let targetIh = Math.min(0.65, formant2 * 2.6 * speechFactor)

      // 'oh' (Rounded open): Subtle rounded vowel opening, strictly capped to prevent narrow fish mouth
      let targetOh = Math.min(0.28, ((formant1 * 0.7 + fundamental * 0.4) * 1.5) * speechFactor)

      // 'ou' (Puckered circular): Low fundamental, strictly capped
      let targetOu = Math.min(0.18, (fundamental * 1.2 * Math.max(0.2, 1.0 - formant3 * 1.6)) * speechFactor)

      // When open vowels ('aa') are active, keep rounding subtle so mouth never collapses into a small hole
      if (targetAa > 0.12) {
        targetOh = Math.min(targetOh, 0.22)
        targetOu = Math.min(targetOu, 0.14)
      }

      // 4. Coarticulation & Dynamic Soft-Limiting
      const totalRequested = targetAa + targetEe + targetIh + targetOh + targetOu
      const maxAperture = 0.95
      if (totalRequested > maxAperture && totalRequested > 0.001) {
        const compression = maxAperture / totalRequested
        targetAa *= compression
        targetEe *= compression
        targetIh *= compression
        targetOh *= compression
        targetOu *= compression
      }

      // 5. Asymmetric Attack / Decay Interpolation
      const updateViseme = (key, target) => {
        const current = this.visemeValues[key] || 0
        const smoothing = target > current ? this.attackSmoothing : this.decaySmoothing
        const next = current + (target - current) * smoothing
        this.visemeValues[key] = next < 0.005 ? 0 : next
        return this.visemeValues[key]
      }

      const aa = updateViseme('aa', targetAa)
      const ee = updateViseme('ee', targetEe)
      const ih = updateViseme('ih', targetIh)
      const oh = updateViseme('oh', targetOh)
      const ou = updateViseme('ou', targetOu)

      this.mouthOpenValue = Math.max(aa, oh, ih, ee * 0.7, ou * 0.8)

      // 6. Apply to VRM Expression Manager
      if (vrm?.expressionManager) {
        vrm.expressionManager.setValue('aa', aa)
        vrm.expressionManager.setValue('ee', ee)
        vrm.expressionManager.setValue('ih', ih)
        vrm.expressionManager.setValue('oh', oh)
        vrm.expressionManager.setValue('ou', ou)

        // Human mouth shaping: maintain generous natural horizontal width and corner pull whenever jaw opens
        const vertOpen = Math.max(aa, oh * 0.8, ee * 0.65, ih * 0.65)
        if (vertOpen > 0.02) {
          if (vrm.expressionManager.getExpression('口横広げ')) {
            const wideVal = Math.min(0.85, Math.max(0.30, vertOpen * 0.95))
            vrm.expressionManager.setValue('口横広げ', wideVal)
          }
          if (vrm.expressionManager.getExpression('口角上げ')) {
            const cornerVal = Math.min(0.35, Math.max(0.12, vertOpen * 0.45))
            vrm.expressionManager.setValue('口角上げ', cornerVal)
          }
        } else {
          if (vrm.expressionManager.getExpression('口横広げ')) {
            const curWide = vrm.expressionManager.getValue('口横広げ') || 0
            vrm.expressionManager.setValue('口横広げ', curWide * 0.4)
          }
          if (vrm.expressionManager.getExpression('口角上げ')) {
            const curCorners = vrm.expressionManager.getValue('口角上げ') || 0
            vrm.expressionManager.setValue('口角上げ', curCorners * 0.4)
          }
        }
        if (vrm.expressionManager.getExpression('口横狭め')) {
          vrm.expressionManager.setValue('口横狭め', 0)
        }
        vrm.expressionManager.update()
      }

      // Broadcast to any listeners (like animationManager)
      this.onMouthOpenChange?.(this.mouthOpenValue)
      this.onVisemeTick?.({
        volume,
        mouthOpen: this.mouthOpenValue,
        visemes: { ...this.visemeValues },
      })

      this.mouthRaf = requestAnimationFrame(tick)
    }

    this.mouthRaf = requestAnimationFrame(tick)
  }

  _smoothDecayVisemes(vrm) {
    let anyActive = false
    for (const key of ['aa', 'ee', 'ih', 'oh', 'ou']) {
      const current = this.visemeValues[key] || 0
      const next = current * (1 - this.decaySmoothing * 1.2)
      this.visemeValues[key] = next < 0.005 ? 0 : next
      if (this.visemeValues[key] > 0) anyActive = true
      if (vrm?.expressionManager) {
        vrm.expressionManager.setValue(key, this.visemeValues[key])
      }
    }
    if (vrm?.expressionManager?.getExpression('口横広げ')) {
      const curWide = vrm.expressionManager.getValue('口横広げ') || 0
      const nextWide = curWide * (1 - this.decaySmoothing * 1.2)
      vrm.expressionManager.setValue('口横広げ', nextWide < 0.005 ? 0 : nextWide)
    }
    if (vrm?.expressionManager?.getExpression('口角上げ')) {
      const curCorners = vrm.expressionManager.getValue('口角上げ') || 0
      const nextCorners = curCorners * (1 - this.decaySmoothing * 1.2)
      vrm.expressionManager.setValue('口角上げ', nextCorners < 0.005 ? 0 : nextCorners)
    }
    this.mouthOpenValue = anyActive ? this.mouthOpenValue * 0.8 : 0
    if (vrm?.expressionManager) {
      vrm.expressionManager.update()
    }
  }

  setUserSpeakingState(isSpeaking) {
    const next = Boolean(isSpeaking)
    if (this.isUserSpeaking === next) return
    this.isUserSpeaking = next

    if (this.isUserSpeaking) {
      this.interruptPlayback()
    }
  }

  interruptPlayback() {
    for (const source of this.activeSources) {
      try {
        source.onended = null
        source.stop(0)
      } catch (err) {
        void err
      }
    }
    this.activeSources = []

    if (this.audioCtx) {
      this.nextStartTime = this.audioCtx.currentTime
    } else {
      this.nextStartTime = 0
    }

    this.stopMouthSync(this.currentVrm || window.currentVrm || null)
    this.setPlaybackState(false)
  }

  stopMouthSync(vrm = null) {
    if (this.mouthRaf) {
      cancelAnimationFrame(this.mouthRaf)
      this.mouthRaf = null
    }

    if (this.audio2face) {
      this.audio2face.stop()
    }

    const targetVrm = vrm || this.currentVrm || window.currentVrm || null
    this.releaseMouth(targetVrm)
  }

  releaseMouth(vrm = null) {
    const targetVrm = vrm || this.currentVrm || window.currentVrm || null
    if (!targetVrm?.expressionManager) {
      this._resetVisemeValues()
      return
    }

    if (this.mouthReleaseRaf) {
      cancelAnimationFrame(this.mouthReleaseRaf)
      this.mouthReleaseRaf = null
    }

    const tick = () => {
      let anyRemaining = false
      for (const key of ['aa', 'ee', 'ih', 'oh', 'ou']) {
        const cur = this.visemeValues[key] || 0
        const next = cur * 0.82
        if (next <= 0.008) {
          this.visemeValues[key] = 0
          targetVrm.expressionManager.setValue(key, 0)
        } else {
          this.visemeValues[key] = next
          targetVrm.expressionManager.setValue(key, next)
          anyRemaining = true
        }
      }

      if (targetVrm.expressionManager.getExpression('口横広げ')) {
        const curWide = targetVrm.expressionManager.getValue('口横広げ') || 0
        const nextWide = curWide * 0.82
        targetVrm.expressionManager.setValue('口横広げ', nextWide <= 0.008 ? 0 : nextWide)
        if (nextWide > 0.008) anyRemaining = true
      }
      if (targetVrm.expressionManager.getExpression('口角上げ')) {
        const curCorners = targetVrm.expressionManager.getValue('口角上げ') || 0
        const nextCorners = curCorners * 0.82
        targetVrm.expressionManager.setValue('口角上げ', nextCorners <= 0.008 ? 0 : nextCorners)
        if (nextCorners > 0.008) anyRemaining = true
      }
      if (targetVrm.expressionManager.getExpression('口横狭め')) {
        targetVrm.expressionManager.setValue('口横狭め', 0)
      }

      this.mouthOpenValue = anyRemaining ? this.mouthOpenValue * 0.82 : 0
      targetVrm.expressionManager.update()

      if (!anyRemaining) {
        if (targetVrm.expressionManager.getExpression('口横広げ')) {
          targetVrm.expressionManager.setValue('口横広げ', 0)
        }
        if (targetVrm.expressionManager.getExpression('口角上げ')) {
          targetVrm.expressionManager.setValue('口角上げ', 0)
        }
        targetVrm.expressionManager.update()
        this._resetVisemeValues()
        this.mouthReleaseRaf = null
        return
      }

      this.mouthReleaseRaf = requestAnimationFrame(tick)
    }

    this.mouthReleaseRaf = requestAnimationFrame(tick)
  }

  _resetVisemeValues() {
    this.visemeValues = { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 }
    this.mouthOpenValue = 0
  }

  setPlaybackState(nextIsPlaying) {
    if (this.isPlaying === nextIsPlaying) return
    this.isPlaying = nextIsPlaying
    if (nextIsPlaying) {
      this.onSpeechStart?.()
    } else {
      this.totalScheduledDuration = 0
      this.speechStartTime = 0
      this.onAudioProgress?.({
        isPlaying: false,
        elapsed: 0,
        totalDuration: 0,
        progress: 1.0,
        mouthOpen: 0,
      })
      this.onSpeechEnd?.()
    }
  }

  getVisemeState() {
    return {
      isPlaying: this.isPlaying,
      mouthOpen: this.mouthOpenValue,
      visemes: { ...this.visemeValues },
    }
  }

  cleanup() {
    this.interruptPlayback()
    if (this.mouthReleaseRaf) {
      cancelAnimationFrame(this.mouthReleaseRaf)
      this.mouthReleaseRaf = null
    }
    if (this.audioCtx) this.audioCtx.close()
    this.audioCtx = null
  }
}
