/**
 * FillerManager
 * 
 * High-performance conversational filler & backchanneling engine for VRM avatar.
 * Implements low-latency turn-taking cues inspired by human conversational acoustics:
 * 1. Immediate visual attentive backchannel (<20ms): Avatar acknowledges user speech end with an attentive micro-nod/tilt.
 * 2. Pre-buffered synthesized vocal fillers: Zero-latency Web Audio generated backchannel sounds ("Mm-hmm", "Hmm", "Ah").
 * 3. Delayed acoustic filler trigger: Plays only if Gemini Live first-packet latency exceeds 360ms.
 * 4. Seamless cross-fade handoff: Immediately yields to Gemini Live voice when streaming audio arrives.
 * 5. Instant barge-in cancellation: Terminates immediately (0ms) upon user speech detection.
 */

export class FillerManager {
  constructor(options = {}) {
    this.audioManager = options.audioManager || null
    this.animationManager = options.animationManager || null
    this.enabled = options.enabled !== false

    // Timing configuration (ms)
    this.fillerDelayMs = 360        // Wait 360ms before emitting acoustic filler
    this.cooldownMs = 5000          // Minimum interval between acoustic fillers
    this.lastFillerTime = 0
    this.pendingTimer = null

    // State tracking
    this.isUserSpeaking = false
    this.isGeminiStreaming = false
    this.activeFillerSource = null
    this.activeGainNode = null

    // Pre-rendered Web Audio buffers
    this.cachedBuffers = new Map()
    this.isInitialized = false
  }

  setAudioManager(audioManager) {
    this.audioManager = audioManager
    if (!this.isInitialized && this.audioManager?.audioCtx) {
      this.initializeBuffers(this.audioManager.audioCtx)
    }
  }

  setAnimationManager(animationManager) {
    this.animationManager = animationManager
  }

  /**
   * Pre-synthesize natural vocal backchannel buffers directly in Web Audio (0ms runtime latency).
   */
  initializeBuffers(audioCtx) {
    if (!audioCtx || this.isInitialized) return
    try {
      const sampleRate = audioCtx.sampleRate || 24000
      this.cachedBuffers.set('mm_hmm', this._synthesizeMmHmm(audioCtx, sampleRate))
      this.cachedBuffers.set('hmm', this._synthesizeHmm(audioCtx, sampleRate))
      this.cachedBuffers.set('ah', this._synthesizeAh(audioCtx, sampleRate))
      this.isInitialized = true
      console.log('✨ FillerManager: Acoustic conversational backchannels pre-buffered online')
    } catch (e) {
      console.warn('FillerManager buffer initialization failed:', e)
    }
  }

  /**
   * Called when the client VAD detects user speech completion (turn handoff).
   */
  onUserSpeechEnd() {
    if (!this.enabled) return
    this.isUserSpeaking = false
    this.isGeminiStreaming = false

    // 1. Immediate visual attentive backchannel (<20ms)
    // A subtle nod or attentive tilt immediately reassures the user that they were heard.
    if (this.animationManager) {
      const animName = Math.random() > 0.4 ? 'Acknowledging' : 'Nod'
      this.animationManager.triggerNamedAnimation(animName).catch(() => {})
    }

    // 2. Clear any lingering timers
    this._clearTimer()

    // 3. Arm delayed acoustic filler trigger
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null
      this._attemptAcousticFiller()
    }, this.fillerDelayMs)
  }

  /**
   * Called when user starts speaking (barge-in).
   */
  onUserSpeechStart() {
    this.isUserSpeaking = true
    this._clearTimer()
    this._stopActiveFillerImmediate()
  }

  /**
   * Called when the first chunk of Gemini Live response audio arrives.
   */
  onGeminiAudioArrival() {
    this.isGeminiStreaming = true
    this._clearTimer()
    this._crossFadeActiveFiller()
  }

  /**
   * Called when Gemini Live finishes its turn.
   */
  onGeminiTurnComplete() {
    this.isGeminiStreaming = false
  }

  _clearTimer() {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
  }

  _attemptAcousticFiller() {
    if (!this.enabled) return
    if (this.isUserSpeaking || this.isGeminiStreaming) return

    const now = Date.now()
    if (now - this.lastFillerTime < this.cooldownMs) {
      return // Respect cooldown
    }

    // Make sure AudioContext is ready
    const audioCtx = this.audioManager?.audioCtx
    if (!audioCtx) return

    if (!this.isInitialized) {
      this.initializeBuffers(audioCtx)
    }

    const fillerKeys = ['mm_hmm', 'hmm', 'ah']
    const selectedKey = fillerKeys[Math.floor(Math.random() * fillerKeys.length)]
    const buffer = this.cachedBuffers.get(selectedKey)
    if (!buffer) return

    this.lastFillerTime = now
    this._playFillerBuffer(audioCtx, buffer)
  }

  _playFillerBuffer(audioCtx, buffer) {
    try {
      this._stopActiveFillerImmediate()

      const source = audioCtx.createBufferSource()
      source.buffer = buffer

      const gainNode = audioCtx.createGain()
      // Soft, natural backchannel conversational level
      gainNode.gain.setValueAtTime(0.38, audioCtx.currentTime)

      // Connect to analyser for natural micro-lip movement and to output destination
      if (this.audioManager?.analyser) {
        source.connect(gainNode)
        gainNode.connect(this.audioManager.analyser)
      } else {
        source.connect(gainNode)
        gainNode.connect(audioCtx.destination)
      }

      this.activeFillerSource = source
      this.activeGainNode = gainNode

      source.onended = () => {
        if (this.activeFillerSource === source) {
          this.activeFillerSource = null
          this.activeGainNode = null
        }
      }

      source.start(audioCtx.currentTime)
    } catch (e) {
      console.warn('Failed to play acoustic filler:', e)
    }
  }

  _crossFadeActiveFiller() {
    if (!this.activeGainNode || !this.audioManager?.audioCtx) return
    try {
      const now = this.audioManager.audioCtx.currentTime
      // Seamlessly ramp down filler volume over 25ms so Gemini voice takes over cleanly
      this.activeGainNode.gain.cancelScheduledValues(now)
      this.activeGainNode.gain.setValueAtTime(this.activeGainNode.gain.value, now)
      this.activeGainNode.gain.linearRampToValueAtTime(0.001, now + 0.025)

      if (this.activeFillerSource) {
        this.activeFillerSource.stop(now + 0.028)
      }
    } catch {}
    this.activeFillerSource = null
    this.activeGainNode = null
  }

  _stopActiveFillerImmediate() {
    if (this.activeFillerSource) {
      try {
        this.activeFillerSource.stop()
        this.activeFillerSource.disconnect()
      } catch {}
      this.activeFillerSource = null
    }
    if (this.activeGainNode) {
      try {
        this.activeGainNode.disconnect()
      } catch {}
      this.activeGainNode = null
    }
  }

  // ==========================================
  // Web Audio Vocal Backchannel Synthesizers
  // ==========================================

  /**
   * Synthesize natural "Mm-hmm" (two melodic inflection pulses, 230Hz -> 275Hz).
   */
  _synthesizeMmHmm(audioCtx, sampleRate) {
    const duration = 0.34
    const totalSamples = Math.floor(sampleRate * duration)
    const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate
      let sample = 0

      // Pulse 1: 0.00s to 0.12s ("Mm")
      if (t < 0.12) {
        const env = Math.sin((t / 0.12) * Math.PI)
        const pitch = 230 + (t / 0.12) * 15
        const phase = 2 * Math.PI * pitch * t
        // Vocal harmonics with nasal/formant warmth
        sample = (Math.sin(phase) * 0.6 + Math.sin(phase * 2) * 0.25 + Math.sin(phase * 3) * 0.15) * env
      }
      // Pulse 2: 0.15s to 0.33s ("hmm", slightly higher pitch)
      else if (t >= 0.15 && t < 0.33) {
        const localT = (t - 0.15) / 0.18
        const env = Math.sin(localT * Math.PI)
        const pitch = 250 + localT * 28
        const phase = 2 * Math.PI * pitch * t
        sample = (Math.sin(phase) * 0.65 + Math.sin(phase * 2) * 0.28 + Math.sin(phase * 3) * 0.12) * env * 1.15
      }

      data[i] = sample * 0.55
    }
    return buffer
  }

  /**
   * Synthesize natural "Hmm" (thoughtful nasal glide, 255Hz -> 232Hz).
   */
  _synthesizeHmm(audioCtx, sampleRate) {
    const duration = 0.32
    const totalSamples = Math.floor(sampleRate * duration)
    const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate
      const env = Math.sin((t / duration) * Math.PI)
      // Gentle downward pitch inflection (thoughtful)
      const pitch = 255 - (t / duration) * 23
      const phase = 2 * Math.PI * pitch * t
      const sample = (Math.sin(phase) * 0.62 + Math.sin(phase * 2) * 0.24 + Math.sin(phase * 3) * 0.14) * env
      data[i] = sample * 0.52
    }
    return buffer
  }

  /**
   * Synthesize natural "Ah" (brief acknowledging vocal particle, 245Hz).
   */
  _synthesizeAh(audioCtx, sampleRate) {
    const duration = 0.25
    const totalSamples = Math.floor(sampleRate * duration)
    const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate
      const attack = Math.min(1.0, t / 0.04)
      const decay = Math.max(0, 1.0 - (t - 0.04) / 0.21)
      const env = attack * Math.pow(decay, 1.5)
      const pitch = 248 - (t / duration) * 12
      const phase = 2 * Math.PI * pitch * t
      const sample = (Math.sin(phase) * 0.7 + Math.sin(phase * 2) * 0.22 + Math.sin(phase * 3) * 0.08) * env
      data[i] = sample * 0.50
    }
    return buffer
  }

  cleanup() {
    this._clearTimer()
    this._stopActiveFillerImmediate()
    this.cachedBuffers.clear()
    this.isInitialized = false
  }
}
