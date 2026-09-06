export class Utils {
  static delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
  static createErrorHandler(context) {
    return (error) => {
      console.error(`Error in ${context}:`, error)
      return { message: error.message }
    }
  }
  // Simplified check for demo purposes
  static getFeatureSupport() {
    return {
      webgl: !!window.WebGLRenderingContext,
      webaudio: !!(window.AudioContext || window.webkitAudioContext),
      speechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      worklet: !!(window.AudioContext && window.AudioContext.prototype.audioWorklet),
    }
  }
}
