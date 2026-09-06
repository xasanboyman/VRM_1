export class VisionManager {
  videoElement = null
  canvasElement = null
  stream = null
  isInitialized = false
  screenStream = null
  screenVideoElement = null
  isSharingScreen = false
  screenShareInterval = null
  cameraInterval = null
  onCameraFrame = null
  onScreenFrame = null
  onStateChange = null
  isRecordingClip = false
  cameraDenied = false

  async initialize() {
    if (this.isInitialized) return true

    this.videoElement = document.createElement('video')
    this.videoElement.style.display = 'none'
    this.videoElement.autoplay = true
    this.videoElement.muted = true
    this.videoElement.setAttribute('playsinline', 'true')
    document.body.appendChild(this.videoElement)

    this.canvasElement = document.createElement('canvas')
    this.canvasElement.style.display = 'none'

    this.isInitialized = true
    return true
  }

  isVideoTrackLive(stream) {
    if (!stream) return false
    const [track] = stream.getVideoTracks()
    return !!track && track.readyState === 'live' && !track.muted
  }

  async ensureVideoReady(video, timeoutMs = 1200) {
    if (!video) return false

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (video.paused) {
        await video.play().catch(() => {})
      }
      return true
    }

    await new Promise((resolve) => {
      let resolved = false
      const finish = () => {
        if (resolved) return
        resolved = true
        video.removeEventListener('loadedmetadata', finish)
        video.removeEventListener('playing', finish)
        resolve(true)
      }

      video.addEventListener('loadedmetadata', finish, { once: true })
      video.addEventListener('playing', finish, { once: true })

      setTimeout(() => {
        finish()
      }, timeoutMs)
    })

    if (video.paused) {
      await video.play().catch(() => {})
    }

    return video.videoWidth > 0 && video.videoHeight > 0
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
    }
    this.stream = null
    if (this.videoElement) {
      this.videoElement.srcObject = null
    }
  }

  async startCamera() {
    if (!this.isInitialized) await this.initialize()

    if (this.cameraDenied) {
      console.warn('VisionManager: camera access is blocked due to previous user denial.')
      return false
    }

    if (this.stream && this.isVideoTrackLive(this.stream)) {
      if (this.videoElement?.srcObject !== this.stream) {
        this.videoElement.srcObject = this.stream
      }
      await this.ensureVideoReady(this.videoElement)
      return true
    }

    this.stopCamera()

    try {
      console.log('VisionManager: requesting camera access...')
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })

      const [track] = this.stream.getVideoTracks()
      if (track) {
        track.onended = () => {
          this.stopCamera()
        }
      }

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream
        await this.ensureVideoReady(this.videoElement)
      }

      return true
    } catch (error) {
      console.error('VisionManager: camera failed', error)
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        this.cameraDenied = true
      }
      this.stopCamera()
      return false
    }
  }

  async captureFrame(retry = true) {
    if (!this.stream || !this.isVideoTrackLive(this.stream)) {
      const success = await this.startCamera()
      if (!success) return null
    } else {
      await this.ensureVideoReady(this.videoElement)
    }

    const video = this.videoElement
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      if (!retry) return null
      this.stopCamera()
      return this.captureFrame(false)
    }

    const scale = Math.min(1, 640 / video.videoWidth)
    const width = Math.floor(video.videoWidth * scale)
    const height = Math.floor(video.videoHeight * scale)

    if (this.canvasElement) {
      this.canvasElement.width = width
      this.canvasElement.height = height
      const ctx = this.canvasElement.getContext('2d')
      ctx?.drawImage(video, 0, 0, width, height)
      const dataURL = this.canvasElement.toDataURL('image/jpeg', 0.7)
      return dataURL.substring(dataURL.indexOf(',') + 1)
    }

    return null
  }

  async startScreenShare(onFrameCallback = null) {
    this.onScreenFrame = onFrameCallback

    if (this.screenStream && this.isVideoTrackLive(this.screenStream)) {
      return true
    }

    this.stopScreenShare()

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        console.warn('Screen sharing not supported (or permission disallowed).')
        return false
      }

      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      })

      const [track] = this.screenStream.getVideoTracks()
      if (track) {
        track.onended = () => {
          this.stopScreenShare()
        }
      }

      const video = document.createElement('video')
      video.srcObject = this.screenStream
      video.muted = true
      await video.play().catch(() => {})
      this.screenVideoElement = video

      await this.ensureVideoReady(video)

      this.isSharingScreen = true
      this.onStateChange?.(true)

      if (this.onScreenFrame) {
        this.screenShareInterval = setInterval(() => {
          if (!this.isSharingScreen) return
          const frame = this.captureVideoFrame(video, 1280)
          if (frame && this.onScreenFrame) {
            this.onScreenFrame(frame)
          }
        }, 1000)
      }

      return true
    } catch (error) {
      console.error('VisionManager: screen share failed', error?.message || error)
      this.stopScreenShare()
      return false
    }
  }

  stopScreenShare() {
    if (!this.isSharingScreen && !this.screenStream) return

    this.isSharingScreen = false
    this.onStateChange?.(false)
    this.onScreenFrame = null

    if (this.screenShareInterval) {
      clearInterval(this.screenShareInterval)
      this.screenShareInterval = null
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop())
    }

    this.screenStream = null
    this.screenVideoElement = null
  }

  captureScreen() {
    if (!this.isSharingScreen || !this.screenVideoElement) return null

    if (!this.screenStream || !this.isVideoTrackLive(this.screenStream)) {
      this.stopScreenShare()
      return null
    }

    if (this.screenVideoElement.videoWidth === 0 || this.screenVideoElement.videoHeight === 0) {
      return null
    }

    return this.captureVideoFrame(this.screenVideoElement, 1920)
  }

  captureVideoFrame(video, maxWidth) {
    if (video.videoWidth === 0 || video.videoHeight === 0) return null

    const scale = Math.min(1, maxWidth / video.videoWidth)
    const width = Math.floor(video.videoWidth * scale)
    const height = Math.floor(video.videoHeight * scale)

    if (this.canvasElement) {
      this.canvasElement.width = width
      this.canvasElement.height = height
      const ctx = this.canvasElement.getContext('2d')
      ctx?.drawImage(video, 0, 0, width, height)
      const dataURL = this.canvasElement.toDataURL('image/jpeg', 0.6)
      return dataURL.substring(dataURL.indexOf(',') + 1)
    }

    return null
  }

  async captureCameraClip(durationMs = 1800) {
    if (!this.stream || !this.isVideoTrackLive(this.stream)) {
      const success = await this.startCamera()
      if (!success) return null
    }
    return this.recordStreamClip(this.stream, durationMs)
  }

  async captureScreenClip(durationMs = 1800) {
    if (!this.screenStream || !this.isVideoTrackLive(this.screenStream)) {
      return null
    }
    return this.recordStreamClip(this.screenStream, durationMs)
  }

  async recordStreamClip(stream, durationMs = 1800) {
    if (!stream || this.isRecordingClip || typeof MediaRecorder === 'undefined') {
      return null
    }

    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]
    const mimeType =
      mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || ''

    this.isRecordingClip = true

    return await new Promise((resolve) => {
      const chunks = []
      let recorder = null
      let timeoutId = null

      const finalize = (blob = null) => {
        if (timeoutId) clearTimeout(timeoutId)
        this.isRecordingClip = false
        resolve(blob)
      }

      try {
        recorder = new MediaRecorder(stream, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: 900_000,
        })
      } catch {
        finalize(null)
        return
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      recorder.onerror = () => {
        finalize(null)
      }

      recorder.onstop = () => {
        if (chunks.length === 0) {
          finalize(null)
          return
        }

        const blobType = mimeType || 'video/webm'
        finalize(new Blob(chunks, { type: blobType }))
      }

      try {
        recorder.start()
      } catch {
        finalize(null)
        return
      }

      timeoutId = setTimeout(
        () => {
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop()
          } else {
            finalize(null)
          }
        },
        Math.max(600, durationMs),
      )
    })
  }

  reset() {
    this.cameraDenied = false
    this.stopCamera()
    this.stopScreenShare()
  }

  cleanup() {
    this.stopScreenShare()
    this.stopCamera()
    this.cameraDenied = false

    if (this.videoElement) {
      this.videoElement.pause()
      this.videoElement.srcObject = null
      if (this.videoElement.parentNode) {
        document.body.removeChild(this.videoElement)
      }
    }

    if (this.screenVideoElement) {
      this.screenVideoElement.pause()
      this.screenVideoElement.srcObject = null
    }

    this.videoElement = null
    this.canvasElement = null
    this.screenVideoElement = null
    this.isInitialized = false
  }
}
