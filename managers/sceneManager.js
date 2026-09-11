import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export class SceneManager {
  canvas
  options = null
  renderer = null
  scene = null
  camera = null
  controls = null
  clock = new THREE.Clock()
  mouse = { x: 0, y: 0 }
  updateCallbacks = []
  resizeHandler = null
  currentFps = 0
  fpsFrameCounter = 0
  fpsLastTimestamp = performance.now()
  animationFrameId = null
  isRendering = false
  renderPixelRatio = 1
  backgroundColor = '#111827'

  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.options = {
      antialias: options.antialias ?? false,
      alpha: options.alpha ?? false,
      shadows: options.shadows ?? false,
      powerPreference: options.powerPreference || 'high-performance',
      pixelRatioCap:
        Number.isFinite(options.pixelRatioCap) && options.pixelRatioCap > 0
          ? options.pixelRatioCap
          : 1,
      supersample:
        Number.isFinite(options.supersample) && options.supersample > 0 ? options.supersample : 1,
    }
    this.backgroundColor = this.normalizeBackgroundColor(options.backgroundColor)
  }

  initialize() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: this.options.antialias,
        canvas: this.canvas,
        alpha: this.options.alpha,
        powerPreference: this.options.powerPreference,
        preserveDrawingBuffer: false,
        stencil: false,
      })
      this.renderer.setSize(window.innerWidth, window.innerHeight)
      // Render at device resolution (× optional supersample), capped so HiDPI
      // screens stay crisp without rendering an absurd number of pixels.
      const nativeRatio = (window.devicePixelRatio || 1) * this.options.supersample
      this.renderPixelRatio = Math.min(nativeRatio, this.options.pixelRatioCap)
      this.renderer.setPixelRatio(this.renderPixelRatio)
      this.renderer.shadowMap.enabled = this.options.shadows
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

      // Filmic tone mapping + correct color space give the avatar richer, more
      // natural skin/material response instead of the flat washed-out default.
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      this.renderer.toneMappingExposure = 1.05

      this.scene = new THREE.Scene()
      this.scene.background = new THREE.Color(this.backgroundColor)

      // Image-based lighting: a generated soft "room" gives subtle, realistic
      // ambient bounce + reflections on the avatar. One-time GPU cost, then free.
      this.setupEnvironment()

      this.camera = new THREE.PerspectiveCamera(
        35,
        window.innerWidth / window.innerHeight,
        0.1,
        100,
      )
      this.camera.position.set(0, 1.4, 3.5)

      this.setupLighting()

      this.controls = new OrbitControls(this.camera, this.renderer.domElement)
      this.controls.target.set(0, 1.2, 0)
      this.controls.enablePan = false
      this.controls.minDistance = 1.0
      this.controls.maxDistance = 5.0

      // Lock vertical rotation (Polar angle) to horizontal only
      this.controls.maxPolarAngle = Math.PI / 2

      this.controls.update()

      this.setupResizeHandler()
      this.setupMouseHandler()

      return true
    } catch (error) {
      console.error(error)
      return false
    }
  }

  setupMouseHandler() {
    window.addEventListener('mousemove', (event) => {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    })
  }

  setupEnvironment() {
    if (!this.scene || !this.renderer) return
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer)
      const envScene = new RoomEnvironment()
      this.environmentTexture = pmrem.fromScene(envScene, 0.04).texture
      this.scene.environment = this.environmentTexture
      // Keep IBL subtle so the directional rig still defines the form.
      if ('environmentIntensity' in this.scene) {
        this.scene.environmentIntensity = 0.55
      }
      envScene.dispose?.()
      pmrem.dispose()
    } catch (error) {
      console.warn('Environment map unavailable, falling back to lights only.', error)
    }
  }

  setupLighting() {
    if (!this.scene) return

    // Soft sky/ground ambient bounce for natural fill (cool top, warm floor).
    const hemiLight = new THREE.HemisphereLight(0xbfd4ff, 0x33302c, 0.55)
    this.scene.add(hemiLight)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2)
    this.scene.add(ambientLight)

    // KEY light — warm, front-right, defines the main form and casts shadows.
    const keyLight = new THREE.DirectionalLight(0xfff1e0, 2.0)
    keyLight.position.set(2.2, 3.0, 3.2)
    keyLight.castShadow = this.options.shadows
    if (this.options.shadows) {
      keyLight.shadow.mapSize.set(2048, 2048)
      keyLight.shadow.bias = -0.0005
      keyLight.shadow.normalBias = 0.02
      keyLight.shadow.radius = 6
      const cam = keyLight.shadow.camera
      cam.near = 0.5
      cam.far = 12
      cam.left = -3
      cam.right = 3
      cam.top = 4
      cam.bottom = -1
    }
    this.scene.add(keyLight)
    this.keyLight = keyLight

    // FILL light — cool, soft, front-left, opens up the shadow side.
    const fillLight = new THREE.DirectionalLight(0xa9c4ff, 0.7)
    fillLight.position.set(-3.0, 1.6, 2.0)
    this.scene.add(fillLight)
    this.fillLight = fillLight

    // RIM / back light — indigo accent behind for that glowing edge separation.
    const rimLight = new THREE.DirectionalLight(0x8b9bff, 2.4)
    rimLight.position.set(-1.6, 3.4, -3.2)
    this.scene.add(rimLight)
    this.rimLight = rimLight

    if (this.options.shadows) {
      this.setupContactShadow()
    }
  }

  // A soft shadow-catching ground plane grounds the avatar so it doesn't appear
  // to float. Only added when shadows are enabled (otherwise it'd be invisible).
  setupContactShadow() {
    if (!this.scene) return
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    ground.receiveShadow = true
    this.scene.add(ground)
    this.groundShadow = ground
  }

  setupResizeHandler() {
    const handleResize = () => {
      if (!this.camera || !this.renderer) return
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
      this.renderer.setPixelRatio(this.renderPixelRatio)
    }
    window.addEventListener('resize', handleResize)
    this.resizeHandler = handleResize
  }

  addToScene(object) {
    if (this.scene) this.scene.add(object)
  }

  // Sharpen a loaded model's textures: max anisotropic filtering (kills the
  // blurry/shimmery look on the face, eyes, hair and clothing at grazing angles)
  // plus proper trilinear mipmapping. Cheap, one-time, big visible quality gain.
  applyModelQuality(root) {
    if (!root || !this.renderer) return
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() ?? 1
    const seen = new Set()

    root.traverse((obj) => {
      if (!obj.material) return
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach((material) => {
        for (const key in material) {
          const value = material[key]
          if (value && value.isTexture && !seen.has(value)) {
            seen.add(value)
            value.anisotropy = maxAniso
            value.generateMipmaps = true
            value.minFilter = THREE.LinearMipmapLinearFilter
            value.magFilter = THREE.LinearFilter
            value.needsUpdate = true
          }
        }
        material.needsUpdate = true
      })
    })
  }
  removeFromScene(object) {
    if (this.scene) this.scene.remove(object)
  }

  normalizeBackgroundColor(value) {
    if (typeof value === 'string') {
      const normalized = value.trim()
      if (/^#([0-9a-fA-F]{6})$/.test(normalized)) {
        return normalized.toLowerCase()
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, '0')}`
    }
    return '#111827'
  }

  setBackgroundColor(value) {
    const nextColor = this.normalizeBackgroundColor(value)
    this.backgroundColor = nextColor
    if (this.scene) {
      this.scene.background = new THREE.Color(nextColor)
    }
    return nextColor
  }

  setBackgroundImage(url) {
    if (!url) {
      if (this.scene) {
        this.scene.background = new THREE.Color(this.backgroundColor)
      }
      return
    }

    // Route through server-side proxy to avoid CORS blocks from remote image hosts
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`

    fetch(proxyUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        return response.blob()
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        const loader = new THREE.TextureLoader()
        loader.crossOrigin = 'anonymous'
        loader.load(
          objectUrl,
          (texture) => {
            if (this.scene) {
              texture.colorSpace = THREE.SRGBColorSpace
              this.scene.background = texture
            }
            URL.revokeObjectURL(objectUrl)
          },
          undefined,
          (error) => {
            console.error('Failed to parse background texture:', error)
            URL.revokeObjectURL(objectUrl)
          }
        )
      })
      .catch((error) => {
        console.error('Failed to fetch background image:', error)
      })
  }

  addUpdateCallback(callback) {
    this.updateCallbacks.push(callback)
  }

  startRenderLoop() {
    if (this.isRendering) return
    this.isRendering = true

    const animate = () => {
      if (!this.isRendering) return

      const delta = this.clock.getDelta()
      if (this.controls) this.controls.update()

      const count = this.updateCallbacks.length
      for (let i = 0; i < count; i++) {
        this.updateCallbacks[i](delta)
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera)
      }

      this.fpsFrameCounter += 1
      const now = performance.now()
      const elapsed = now - this.fpsLastTimestamp
      if (elapsed >= 1000) {
        this.currentFps = Math.round((this.fpsFrameCounter * 1000) / elapsed)
        this.fpsFrameCounter = 0
        this.fpsLastTimestamp = now
      }

      this.animationFrameId = requestAnimationFrame(animate)
    }
    this.animationFrameId = requestAnimationFrame(animate)
  }

  getCurrentFps() {
    return this.currentFps
  }

  cleanup() {
    this.isRendering = false
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler)
    this.environmentTexture?.dispose()
    this.renderer?.dispose()
  }
}
