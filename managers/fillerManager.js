/**
 * FillerManager
 * 
 * High-performance conversational backchanneling engine for VRM avatar.
 * Implements low-latency visual turn-taking cues:
 * 1. Immediate visual attentive backchannel (<10ms): Avatar acknowledges user speech pause
 *    with a subtle, smooth procedural head nod/tilt (pure local Three.js, zero network requests).
 * 2. Instant cancellation: Terminates immediately (0ms) upon user speech detection or model audio arrival.
 * 3. Zero synthetic oscillator audio: Avoids unnatural robotic tones, hums, or buzzes.
 */

export class FillerManager {
  constructor(options = {}) {
    this.audioManager = options.audioManager || null
    this.animationManager = options.animationManager || null
    this.enabled = options.enabled !== false

    // State tracking
    this.isUserSpeaking = false
    this.isGeminiStreaming = false
    this.lastReactionTime = 0
    this.reactionCooldownMs = 1200
  }

  setAudioManager(audioManager) {
    this.audioManager = audioManager
  }

  setAnimationManager(animationManager) {
    this.animationManager = animationManager
  }

  /**
   * Called when client VAD detects user speech completion (turn handoff).
   * Triggers a subtle, purely local procedural listening reaction.
   */
  onUserSpeechEnd() {
    if (!this.enabled) return
    this.isUserSpeaking = false
    this.isGeminiStreaming = false

    const now = Date.now()
    if (now - this.lastReactionTime < this.reactionCooldownMs) return
    this.lastReactionTime = now

    // Purely local procedural listening nod (<10ms, 0 network requests)
    if (this.animationManager && typeof this.animationManager.triggerListeningReaction === 'function') {
      this.animationManager.triggerListeningReaction()
    }
  }

  /**
   * Called when user starts speaking (barge-in).
   */
  onUserSpeechStart() {
    this.isUserSpeaking = true
    if (this.animationManager && typeof this.animationManager.cancelListeningReaction === 'function') {
      this.animationManager.cancelListeningReaction()
    }
  }

  /**
   * Called when the first chunk of Gemini Live response audio arrives.
   */
  onGeminiAudioArrival() {
    this.isGeminiStreaming = true
    if (this.animationManager && typeof this.animationManager.cancelListeningReaction === 'function') {
      this.animationManager.cancelListeningReaction()
    }
  }

  /**
   * Called when Gemini Live finishes its turn.
   */
  onGeminiTurnComplete() {
    this.isGeminiStreaming = false
  }

  cleanup() {
    if (this.animationManager && typeof this.animationManager.cancelListeningReaction === 'function') {
      this.animationManager.cancelListeningReaction()
    }
  }
}
