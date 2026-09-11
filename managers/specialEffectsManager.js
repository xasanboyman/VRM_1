import * as THREE from 'three'

/**
 * SpecialEffectsManager
 * 
 * Provides a comprehensive suite of anime visual & special effects for VRM avatars:
 * 1. 3D Particle Systems:
 *    - Floating Heart Burst (love, blushing, heart fingers)
 *    - Twinkling Star Sparkles & Stardust (joy, excitement, clapping, cheering)
 *    - Tears Splash (streaming and splashing teardrops on crying/sadness)
 *    - Oversized Anime Sweat Droplets (nervousness, embarrassment, dizziness)
 *    - Cartoon Head Steam Puffs (flustered overheating, fiery anger)
 *    - Comic Emotion Head Pop-ups (!, ?, !?, Zzz sleep bubbles, Music notes 🎵)
 *    - Forehead Gloom / Depression Shade Lines (shock, disappointment, despair)
 *    - Atmospheric Falling Sakura Petals
 * 
 * 2. Full-Screen Cinematic FX:
 *    - Anime Action Speed Lines (radial comic focus lines)
 *    - Mood Vignette & Color Grading (warm pink, somber indigo, fiery crimson, flash)
 *    - Chromatic Aberration / Digital Glitch
 * 
 * 3. Dynamic Scene & Lighting:
 *    - Emotion-Responsive Rim & Fill Lighting Shifts
 *    - Ambient Dynamic Breeze
 */
export class SpecialEffectsManager {
  constructor(options = {}) {
    this.sceneManager = options.sceneManager || null
    this.animationManager = options.animationManager || null
    this.vrm = options.vrm || null

    this.scene = this.sceneManager?.scene || null
    this.camera = this.sceneManager?.camera || null

    // 3D Scene Group for all particle and prop effects
    this.effectsGroup = new THREE.Group()
    this.effectsGroup.name = 'SpecialEffectsGroup'
    this.effectsGroup.renderOrder = 999
    if (this.scene) {
      this.scene.add(this.effectsGroup)
    }

    // Active particle systems
    this.particles = []
    this.headIcons = []
    this.sakuraPetals = []
    this.isSakuraActive = false

    // Dynamic procedural textures cache
    this.textureCache = new Map()

    // Screen overlay DOM elements
    this.overlayContainer = null
    this.speedLinesCanvas = null
    this.speedLinesCtx = null
    this.speedLinesActive = false
    this.speedLinesTimer = 0
    this.speedLinesDuration = 0

    this.vignetteEl = null
    this.vignetteTimer = null

    this.glitchEl = null
    this.glitchTimer = null

    // Mood lighting interpolation state
    this.defaultRimColor = new THREE.Color(0x8b9bff)
    this.targetRimColor = new THREE.Color(0x8b9bff)
    this.currentRimColor = new THREE.Color(0x8b9bff)
    this.targetRimIntensity = 2.4
    this.currentRimIntensity = 2.4

    // Head position tracking scratch vectors
    this._headWorldPos = new THREE.Vector3(0, 1.45, 0)
    this._leftEyeWorldPos = new THREE.Vector3(-0.06, 1.43, 0.12)
    this._rightEyeWorldPos = new THREE.Vector3(0.06, 1.43, 0.12)
    this._tempVec = new THREE.Vector3()

    // Wind oscillation state
    this.windTime = 0
    this.windForce = new THREE.Vector3(0, 0, 0)

    this._initScreenOverlay()

    if (this.animationManager) {
      this.attachAnimationManager(this.animationManager)
    }
  }

  setVRM(vrm) {
    this.vrm = vrm
  }

  /* -------------------------------------------------------------------------- */
  /*                         PROCEDURAL TEXTURE FACTORY                         */
  /* -------------------------------------------------------------------------- */

  _getTexture(key, drawFn) {
    if (this.textureCache.has(key)) {
      return this.textureCache.get(key)
    }
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    drawFn(ctx, 128, 128)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    this.textureCache.set(key, texture)
    return texture
  }

  getHeartTexture() {
    return this._getTexture('heart', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2 - 4)

      // Outer glow
      ctx.shadowColor = 'rgba(255, 105, 180, 0.9)'
      ctx.shadowBlur = 16

      // Heart Path
      ctx.beginPath()
      const d = 34
      ctx.moveTo(0, d * 0.35)
      ctx.bezierCurveTo(-d * 0.8, -d * 0.6, -d * 1.35, d * 0.3, 0, d * 1.35)
      ctx.bezierCurveTo(d * 1.35, d * 0.3, d * 0.8, -d * 0.6, 0, d * 0.35)
      ctx.closePath()

      const grad = ctx.createLinearGradient(0, -d, 0, d)
      grad.addColorStop(0, '#ff69b4')
      grad.addColorStop(0.5, '#ff1493')
      grad.addColorStop(1, '#ff007f')
      ctx.fillStyle = grad
      ctx.fill()

      // Cute white shine spot
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.arc(-11, -2, 5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.fill()

      ctx.restore()
    })
  }

  getSparkleTexture() {
    return this._getTexture('sparkle', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)

      // Radial glow
      const radGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 60)
      radGrad.addColorStop(0, 'rgba(255, 245, 180, 1)')
      radGrad.addColorStop(0.2, 'rgba(255, 220, 100, 0.75)')
      radGrad.addColorStop(0.6, 'rgba(255, 180, 50, 0.25)')
      radGrad.addColorStop(1, 'rgba(255, 150, 0, 0)')
      ctx.fillStyle = radGrad
      ctx.beginPath()
      ctx.arc(0, 0, 60, 0, Math.PI * 2)
      ctx.fill()

      // 4-pointed diamond star
      ctx.beginPath()
      const rOuter = 52
      const rInner = 8
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2
        ctx.lineTo(Math.cos(angle) * rOuter, Math.sin(angle) * rOuter)
        const innerAngle = angle + Math.PI / 4
        ctx.lineTo(Math.cos(innerAngle) * rInner, Math.sin(innerAngle) * rInner)
      }
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = '#fff380'
      ctx.shadowBlur = 12
      ctx.fill()

      ctx.restore()
    })
  }

  getTearTexture() {
    return this._getTexture('tear', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)

      // Droplet shape
      ctx.beginPath()
      ctx.moveTo(0, -42)
      ctx.bezierCurveTo(28, -5, 34, 38, 0, 42)
      ctx.bezierCurveTo(-34, 38, -28, -5, 0, -42)
      ctx.closePath()

      const grad = ctx.createRadialGradient(-6, -10, 2, 0, 0, 42)
      grad.addColorStop(0, 'rgba(224, 242, 254, 0.95)')
      grad.addColorStop(0.5, 'rgba(147, 197, 253, 0.85)')
      grad.addColorStop(1, 'rgba(59, 130, 246, 0.65)')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(147, 197, 253, 0.8)'
      ctx.shadowBlur = 10
      ctx.fill()

      // Glossy highlight
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.ellipse(-10, 8, 5, 12, -0.3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.fill()

      ctx.restore()
    })
  }

  getSweatTexture() {
    return this._getTexture('sweat', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.rotate(0.35)

      ctx.beginPath()
      ctx.moveTo(0, -46)
      ctx.bezierCurveTo(32, -10, 36, 36, 0, 44)
      ctx.bezierCurveTo(-36, 36, -32, -10, 0, -46)
      ctx.closePath()

      const grad = ctx.createLinearGradient(0, -46, 0, 44)
      grad.addColorStop(0, '#e0f2fe')
      grad.addColorStop(0.6, '#38bdf8')
      grad.addColorStop(1, '#0284c7')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(56, 189, 248, 0.8)'
      ctx.shadowBlur = 14
      ctx.fill()

      // Shine reflection
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.ellipse(-10, 6, 6, 16, -0.2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
      ctx.fill()

      ctx.restore()
    })
  }

  getSteamTexture() {
    return this._getTexture('steam', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)

      // Overlapping cartoon cloud puffs
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
      ctx.shadowColor = 'rgba(255, 255, 255, 0.6)'
      ctx.shadowBlur = 12

      ctx.beginPath()
      ctx.arc(-18, 8, 22, 0, Math.PI * 2)
      ctx.arc(18, 6, 24, 0, Math.PI * 2)
      ctx.arc(0, -14, 28, 0, Math.PI * 2)
      ctx.closePath()
      ctx.fill()

      // Subtle shadow contour
      ctx.shadowBlur = 0
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.7)'
      ctx.stroke()

      ctx.restore()
    })
  }

  getExclamationTexture() {
    return this._getTexture('exclamation', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)

      // Comic burst star background
      ctx.beginPath()
      const points = 10
      for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? 54 : 38
        const angle = (i * Math.PI) / points
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fillStyle = '#ef4444'
      ctx.shadowColor = 'rgba(239, 68, 68, 0.9)'
      ctx.shadowBlur = 16
      ctx.fill()
      ctx.lineWidth = 4
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()

      // Bold exclamation mark
      ctx.shadowBlur = 0
      ctx.fillStyle = '#ffffff'
      ctx.font = '900 58px "Arial Black", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('!', 0, 2)

      ctx.restore()
    })
  }

  getQuestionTexture() {
    return this._getTexture('question', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)

      // Comic bubble circle
      ctx.beginPath()
      ctx.arc(0, 0, 48, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.shadowColor = 'rgba(245, 158, 11, 0.9)'
      ctx.shadowBlur = 16
      ctx.fill()
      ctx.lineWidth = 4
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()

      // Bold question mark
      ctx.shadowBlur = 0
      ctx.fillStyle = '#ffffff'
      ctx.font = '900 56px "Arial Black", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('?', 0, 2)

      ctx.restore()
    })
  }

  getZzzTexture() {
    return this._getTexture('zzz', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)

      // Playful purple sleep bubble
      ctx.shadowColor = 'rgba(168, 85, 247, 0.8)'
      ctx.shadowBlur = 14
      ctx.fillStyle = '#a855f7'
      ctx.font = '900 48px "Arial Black", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 6
      ctx.strokeStyle = '#ffffff'
      ctx.strokeText('Zzz', 0, 0)
      ctx.fillText('Zzz', 0, 0)

      ctx.restore()
    })
  }

  getMusicNoteTexture() {
    return this._getTexture('music_note', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)

      ctx.shadowColor = 'rgba(236, 72, 153, 0.9)'
      ctx.shadowBlur = 16
      ctx.fillStyle = '#ec4899'
      ctx.font = '900 64px "Arial Black", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 6
      ctx.strokeStyle = '#ffffff'
      ctx.strokeText('♫', 0, 0)
      ctx.fillText('♫', 0, 0)

      ctx.restore()
    })
  }

  getGloomLinesTexture() {
    return this._getTexture('gloom', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()

      // Vertical anime depression hatch lines
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(88, 28, 135, 0.95)')
      grad.addColorStop(0.6, 'rgba(49, 46, 129, 0.75)')
      grad.addColorStop(1, 'rgba(30, 27, 75, 0.0)')

      ctx.strokeStyle = grad
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'

      for (let x = 16; x < w - 16; x += 10) {
        const lineLen = h * (0.65 + Math.sin(x * 0.4) * 0.25)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, lineLen)
        ctx.stroke()
      }

      ctx.restore()
    })
  }

  getSakuraTexture() {
    return this._getTexture('sakura', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)

      // Curved cherry blossom petal with notched tip
      ctx.beginPath()
      ctx.moveTo(0, 42)
      ctx.bezierCurveTo(24, 20, 32, -22, 10, -42)
      ctx.lineTo(0, -32) // Notch
      ctx.lineTo(-10, -42)
      ctx.bezierCurveTo(-32, -22, -24, 20, 0, 42)
      ctx.closePath()

      const grad = ctx.createLinearGradient(0, -42, 0, 42)
      grad.addColorStop(0, '#fbcfe8')
      grad.addColorStop(0.6, '#f472b6')
      grad.addColorStop(1, '#db2777')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(244, 114, 182, 0.6)'
      ctx.shadowBlur = 8
      ctx.fill()

      ctx.restore()
    })
  }

  /* -------------------------------------------------------------------------- */
  /*                             HEAD POSITION TRACKING                         */
  /* -------------------------------------------------------------------------- */

  _updateHeadPositions() {
    if (!this.vrm) return
    const headNode = this.vrm.humanoid?.getNormalizedBoneNode?.('head') ||
                     this.vrm.humanoid?.getRawBoneNode?.('head') ||
                     this.vrm.scene?.getObjectByName?.('Head')

    if (headNode) {
      headNode.getWorldPosition(this._headWorldPos)
      // Slight forward offset for forehead/eyes
      this._leftEyeWorldPos.copy(this._headWorldPos).add(new THREE.Vector3(-0.055, 0.02, 0.12))
      this._rightEyeWorldPos.copy(this._headWorldPos).add(new THREE.Vector3(0.055, 0.02, 0.12))
    } else {
      this._headWorldPos.set(0, 1.45, 0)
      this._leftEyeWorldPos.set(-0.06, 1.43, 0.12)
      this._rightEyeWorldPos.set(0.06, 1.43, 0.12)
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                         3D PARTICLE SYSTEMS TRIGGER                        */
  /* -------------------------------------------------------------------------- */

  /**
   * Spawn floating hearts around character
   */
  triggerHearts(options = {}) {
    this._updateHeadPositions()
    const count = options.count || 14
    const texture = this.getHeartTexture()

    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95,
        blending: THREE.NormalBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)

      const spawnPos = this._headWorldPos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.45,
        -0.15 + (Math.random() - 0.5) * 0.35,
        0.05 + (Math.random() - 0.5) * 0.25
      ))
      sprite.position.copy(spawnPos)

      const baseScale = 0.08 + Math.random() * 0.10
      sprite.scale.set(0.01, 0.01, 1)
      this.effectsGroup.add(sprite)

      this.particles.push({
        sprite,
        material,
        position: spawnPos,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.25,
          0.30 + Math.random() * 0.35,
          (Math.random() - 0.5) * 0.15
        ),
        wobbleSpeed: 2.5 + Math.random() * 3.0,
        wobbleAmp: 0.08 + Math.random() * 0.12,
        targetScale: baseScale,
        currentScale: 0.01,
        life: 0,
        maxLife: 2.0 + Math.random() * 1.2,
        type: 'heart',
      })
    }
  }

  /**
   * Spawn twinkling star sparkles & stardust
   */
  triggerSparkles(options = {}) {
    this._updateHeadPositions()
    const count = options.count || 24
    const texture = this.getSparkleTexture()

    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)

      const radius = 0.20 + Math.random() * 0.50
      const theta = Math.random() * Math.PI * 2
      const spawnPos = this._headWorldPos.clone().add(new THREE.Vector3(
        Math.cos(theta) * radius,
        -0.25 + Math.random() * 0.55,
        Math.sin(theta) * radius * 0.6
      ))
      sprite.position.copy(spawnPos)

      const baseScale = 0.07 + Math.random() * 0.11
      sprite.scale.set(0.01, 0.01, 1)
      this.effectsGroup.add(sprite)

      this.particles.push({
        sprite,
        material,
        position: spawnPos,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.18,
          0.15 + Math.random() * 0.28,
          (Math.random() - 0.5) * 0.18
        ),
        targetScale: baseScale,
        currentScale: 0.01,
        twinkleSpeed: 4.0 + Math.random() * 5.0,
        life: 0,
        maxLife: 1.8 + Math.random() * 1.4,
        type: 'sparkle',
      })
    }
  }

  /**
   * Spawn crying stream & splashes
   */
  triggerTears(options = {}) {
    this._updateHeadPositions()
    const count = options.count || 22
    const texture = this.getTearTexture()

    for (let i = 0; i < count; i++) {
      const isLeft = Math.random() < 0.5
      const eyeOrigin = isLeft ? this._leftEyeWorldPos : this._rightEyeWorldPos

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.85,
        blending: THREE.NormalBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)

      const spawnPos = eyeOrigin.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.03,
        (Math.random() - 0.5) * 0.02,
        0.02
      ))
      sprite.position.copy(spawnPos)

      const baseScale = 0.05 + Math.random() * 0.05
      sprite.scale.set(baseScale * 0.7, baseScale, 1)
      this.effectsGroup.add(sprite)

      this.particles.push({
        sprite,
        material,
        position: spawnPos,
        velocity: new THREE.Vector3(
          (isLeft ? -1 : 1) * (0.04 + Math.random() * 0.08),
          -(0.25 + Math.random() * 0.35),
          0.02
        ),
        targetScale: baseScale,
        currentScale: baseScale,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.8,
        type: 'tear',
      })
    }
  }

  /**
   * Spawn anime sweat droplet
   */
  triggerSweat(options = {}) {
    this._updateHeadPositions()
    const texture = this.getSweatTexture()

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.renderOrder = 1000

    // Positioned beside temple
    const anchorOffset = new THREE.Vector3(0.20, 0.08, 0.15)
    const spawnPos = this._headWorldPos.clone().add(anchorOffset)
    sprite.position.copy(spawnPos)

    const baseScale = 0.20
    sprite.scale.set(0.01, 0.01, 1)
    this.effectsGroup.add(sprite)

    this.headIcons.push({
      sprite,
      material,
      anchorOffset,
      life: 0,
      maxLife: 3.2,
      baseScale,
      type: 'sweat',
    })
  }

  /**
   * Spawn steam puffs from head
   */
  triggerSteam(options = {}) {
    this._updateHeadPositions()
    const count = options.count || 8
    const texture = this.getSteamTexture()

    for (let i = 0; i < count; i++) {
      const isLeft = i % 2 === 0
      const sideX = isLeft ? -0.16 : 0.16

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.88,
        depthTest: false,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.renderOrder = 1000

      const spawnPos = this._headWorldPos.clone().add(new THREE.Vector3(
        sideX + (Math.random() - 0.5) * 0.04,
        0.08 + Math.random() * 0.06,
        0.10 + (Math.random() - 0.5) * 0.06
      ))
      sprite.position.copy(spawnPos)

      const baseScale = 0.12 + Math.random() * 0.08
      sprite.scale.set(0.02, 0.02, 1)
      this.effectsGroup.add(sprite)

      this.particles.push({
        sprite,
        material,
        position: spawnPos,
        velocity: new THREE.Vector3(
          (isLeft ? -1 : 1) * (0.12 + Math.random() * 0.18),
          0.22 + Math.random() * 0.28,
          (Math.random() - 0.5) * 0.06
        ),
        targetScale: baseScale * 2.2, // Expands as it rises
        currentScale: 0.02,
        life: 0,
        maxLife: 1.4 + Math.random() * 0.6,
        type: 'steam',
      })
    }
  }

  /**
   * Spawn comic head popup: exclamation (!)
   */
  triggerExclamation() {
    this._updateHeadPositions()
    const texture = this.getExclamationTexture()
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.renderOrder = 1000
    sprite.scale.set(0.01, 0.01, 1)
    this.effectsGroup.add(sprite)

    this.headIcons.push({
      sprite,
      material,
      anchorOffset: new THREE.Vector3(0.18, 0.28, 0.15),
      life: 0,
      maxLife: 2.4,
      baseScale: 0.28,
      type: 'pop',
    })
  }

  /**
   * Spawn comic head popup: question (?)
   */
  triggerQuestion() {
    this._updateHeadPositions()
    const texture = this.getQuestionTexture()
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.renderOrder = 1000
    sprite.scale.set(0.01, 0.01, 1)
    this.effectsGroup.add(sprite)

    this.headIcons.push({
      sprite,
      material,
      anchorOffset: new THREE.Vector3(0.18, 0.28, 0.15),
      life: 0,
      maxLife: 2.6,
      baseScale: 0.26,
      type: 'question',
    })
  }

  /**
   * Spawn sleep bubbles (Zzz)
   */
  triggerZzz(options = {}) {
    this._updateHeadPositions()
    const count = options.count || 4
    const texture = this.getZzzTexture()

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (!this.effectsGroup) return
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        })
        const sprite = new THREE.Sprite(material)
        sprite.renderOrder = 1000
        const spawnPos = this._headWorldPos.clone().add(new THREE.Vector3(0.12, 0.15, 0.15))
        sprite.position.copy(spawnPos)
        sprite.scale.set(0.01, 0.01, 1)
        this.effectsGroup.add(sprite)

        this.particles.push({
          sprite,
          material,
          position: spawnPos,
          velocity: new THREE.Vector3(0.12 + Math.random() * 0.08, 0.22 + Math.random() * 0.12, 0),
          wobbleSpeed: 2.0,
          wobbleAmp: 0.05,
          targetScale: 0.16 + i * 0.04,
          currentScale: 0.01,
          life: 0,
          maxLife: 2.5,
          type: 'zzz',
        })
      }, i * 380)
    }
  }

  /**
   * Spawn floating musical notes
   */
  triggerMusicNotes(options = {}) {
    this._updateHeadPositions()
    const count = options.count || 5
    const texture = this.getMusicNoteTexture()

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (!this.effectsGroup) return
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
          depthWrite: false,
        })
        const sprite = new THREE.Sprite(material)
        sprite.renderOrder = 1000
        const side = i % 2 === 0 ? 0.22 : -0.22
        const spawnPos = this._headWorldPos.clone().add(new THREE.Vector3(side, 0.10 + Math.random() * 0.15, 0.15))
        sprite.position.copy(spawnPos)
        sprite.scale.set(0.01, 0.01, 1)
        this.effectsGroup.add(sprite)

        this.particles.push({
          sprite,
          material,
          position: spawnPos,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.28 + Math.random() * 0.22, 0),
          wobbleSpeed: 3.5,
          wobbleAmp: 0.08,
          targetScale: 0.16 + Math.random() * 0.06,
          currentScale: 0.01,
          life: 0,
          maxLife: 2.4,
          type: 'music',
        })
      }, i * 280)
    }
  }

  /**
   * Spawn forehead depression gloom lines
   */
  triggerGloom(options = {}) {
    this._updateHeadPositions()
    const texture = this.getGloomLinesTexture()
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.0,
      depthTest: false,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.renderOrder = 1000
    this.effectsGroup.add(sprite)

    this.headIcons.push({
      sprite,
      material,
      anchorOffset: new THREE.Vector3(0, 0.02, 0.16),
      life: 0,
      maxLife: options.duration || 3.5,
      baseScale: 0.40,
      type: 'gloom',
    })
  }

  /**
   * Toggle continuous falling sakura cherry blossom petals
   */
  toggleSakura(enable) {
    this.isSakuraActive = enable !== undefined ? enable : !this.isSakuraActive
    if (!this.isSakuraActive) {
      this.sakuraPetals.forEach((p) => {
        this.effectsGroup.remove(p.sprite)
        p.material.dispose()
      })
      this.sakuraPetals = []
      return
    }

    const texture = this.getSakuraTexture()
    const count = 35
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      const x = (Math.random() - 0.5) * 3.5
      const y = 1.0 + Math.random() * 2.5
      const z = -1.0 + Math.random() * 2.5
      sprite.position.set(x, y, z)
      const scale = 0.06 + Math.random() * 0.05
      sprite.scale.set(scale, scale, 1)
      this.effectsGroup.add(sprite)

      this.sakuraPetals.push({
        sprite,
        material,
        scale,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 2.0,
        fallSpeed: 0.25 + Math.random() * 0.35,
        driftSpeed: 1.2 + Math.random() * 1.5,
        driftOffset: Math.random() * Math.PI * 2,
      })
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                        SCREEN OVERLAYS (SPEED LINES, VIGNETTE, GLITCH)     */
  /* -------------------------------------------------------------------------- */

  _initScreenOverlay() {
    if (typeof document === 'undefined') return
    let container = document.getElementById('vrm-fx-overlay')
    if (!container) {
      container = document.createElement('div')
      container.id = 'vrm-fx-overlay'
      container.style.cssText = `
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 18;
      `
      document.body.appendChild(container)
    }
    this.overlayContainer = container

    // 1. Anime Speed Lines Canvas
    let canvas = document.getElementById('vrm-fx-speed-lines')
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.id = 'vrm-fx-speed-lines'
      canvas.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        transition: opacity 0.2s ease-out;
        pointer-events: none;
      `
      container.appendChild(canvas)
    }
    this.speedLinesCanvas = canvas
    this.speedLinesCtx = canvas.getContext('2d')

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', resizeCanvas)
    resizeCanvas()

    // 2. Mood Vignette Overlay
    let vignette = document.getElementById('vrm-fx-vignette')
    if (!vignette) {
      vignette = document.createElement('div')
      vignette.id = 'vrm-fx-vignette'
      vignette.style.cssText = `
        position: absolute;
        inset: 0;
        opacity: 0;
        transition: opacity 0.4s ease-in-out, background 0.4s ease-in-out;
        pointer-events: none;
      `
      container.appendChild(vignette)
    }
    this.vignetteEl = vignette

    // 3. Glitch / Chromatic Aberration Flash Overlay
    let glitch = document.getElementById('vrm-fx-glitch')
    if (!glitch) {
      glitch = document.createElement('div')
      glitch.id = 'vrm-fx-glitch'
      glitch.style.cssText = `
        position: absolute;
        inset: 0;
        opacity: 0;
        pointer-events: none;
        mix-blend-mode: screen;
        transition: opacity 0.08s linear;
      `
      container.appendChild(glitch)
    }
    this.glitchEl = glitch
  }

  /**
   * Trigger anime action speed lines (radial comic lines)
   */
  triggerSpeedLines(options = {}) {
    if (!this.speedLinesCanvas) return
    this.speedLinesDuration = options.duration || 1.1
    this.speedLinesTimer = this.speedLinesDuration
    this.speedLinesActive = true
    this.speedLinesCanvas.style.opacity = '0.92'
  }

  _renderSpeedLines() {
    if (!this.speedLinesActive || !this.speedLinesCtx) return
    const ctx = this.speedLinesCtx
    const w = this.speedLinesCanvas.width
    const h = this.speedLinesCanvas.height
    ctx.clearRect(0, 0, w, h)

    // Focus center: screen center with subtle upward tilt toward face
    const cx = w * 0.50
    const cy = h * 0.42

    const lineCount = 42
    const innerRadius = Math.min(w, h) * 0.28
    const maxRadius = Math.max(w, h) * 0.9

    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'

    for (let i = 0; i < lineCount; i++) {
      if (Math.random() < 0.25) continue // Dynamic flicker
      const angle = (i / lineCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.05
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      const startDist = innerRadius + (Math.random() - 0.5) * 60
      const length = maxRadius

      const x1 = cx + cos * startDist
      const y1 = cy + sin * startDist
      const x2 = cx + cos * length
      const y2 = cy + sin * length

      const thickness = 1.5 + Math.random() * 4.5
      ctx.lineWidth = thickness

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    ctx.restore()
  }

  /**
   * Trigger Mood Vignette
   */
  triggerVignette(colorType = 'pink', duration = 2.8) {
    if (!this.vignetteEl) return
    if (this.vignetteTimer) clearTimeout(this.vignetteTimer)

    let bg = ''
    switch (colorType) {
      case 'pink':
      case 'love':
        bg = 'radial-gradient(circle at center, transparent 35%, rgba(244, 114, 182, 0.32) 80%, rgba(219, 39, 119, 0.55) 100%)'
        break
      case 'blue':
      case 'sad':
        bg = 'radial-gradient(circle at center, transparent 30%, rgba(30, 58, 138, 0.45) 75%, rgba(15, 23, 42, 0.8) 100%)'
        break
      case 'red':
      case 'angry':
        bg = 'radial-gradient(circle at center, transparent 35%, rgba(220, 38, 38, 0.40) 80%, rgba(153, 27, 27, 0.75) 100%)'
        break
      case 'yellow':
      case 'surprise':
        bg = 'radial-gradient(circle at center, transparent 40%, rgba(251, 191, 36, 0.35) 85%, rgba(245, 158, 11, 0.65) 100%)'
        break
      default:
        bg = 'radial-gradient(circle at center, transparent 40%, rgba(0, 0, 0, 0.5) 100%)'
    }

    this.vignetteEl.style.background = bg
    this.vignetteEl.style.opacity = '1'

    this.vignetteTimer = setTimeout(() => {
      if (this.vignetteEl) {
        this.vignetteEl.style.opacity = '0'
      }
    }, duration * 1000)
  }

  /**
   * Trigger chromatic glitch flash
   */
  triggerGlitch(duration = 0.35) {
    if (!this.glitchEl) return
    if (this.glitchTimer) clearTimeout(this.glitchTimer)

    this.glitchEl.style.background = `
      linear-gradient(90deg, rgba(255,0,0,0.2) 0%, rgba(0,255,255,0.2) 50%, rgba(0,0,255,0.2) 100%),
      repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 2px, transparent 2px, transparent 4px)
    `
    this.glitchEl.style.opacity = '0.9'

    this.glitchTimer = setTimeout(() => {
      if (this.glitchEl) {
        this.glitchEl.style.opacity = '0'
      }
    }, duration * 1000)
  }

  /* -------------------------------------------------------------------------- */
  /*                          DYNAMIC MOOD LIGHTING                             */
  /* -------------------------------------------------------------------------- */

  setMoodLighting(mood = 'neutral') {
    switch (mood) {
      case 'love':
      case 'blush':
        this.targetRimColor.setHex(0xff69b4)
        this.targetRimIntensity = 3.0
        break
      case 'happy':
      case 'joy':
        this.targetRimColor.setHex(0xffd700)
        this.targetRimIntensity = 2.8
        break
      case 'sad':
      case 'crying':
        this.targetRimColor.setHex(0x5da8ff)
        this.targetRimIntensity = 2.2
        break
      case 'angry':
        this.targetRimColor.setHex(0xff2244)
        this.targetRimIntensity = 3.4
        break
      case 'surprised':
        this.targetRimColor.setHex(0xffffff)
        this.targetRimIntensity = 3.6
        break
      default:
        this.targetRimColor.copy(this.defaultRimColor)
        this.targetRimIntensity = 2.4
    }
  }

  _updateLighting(delta) {
    if (!this.sceneManager?.rimLight) return
    const rim = this.sceneManager.rimLight

    this.currentRimColor.lerp(this.targetRimColor, delta * 3.5)
    this.currentRimIntensity = THREE.MathUtils.lerp(this.currentRimIntensity, this.targetRimIntensity, delta * 3.5)

    rim.color.copy(this.currentRimColor)
    rim.intensity = this.currentRimIntensity
  }

  /* -------------------------------------------------------------------------- */
  /*                       ANIMATION & EMOTION INTEGRATION                      */
  /* -------------------------------------------------------------------------- */

  attachAnimationManager(animMgr) {
    if (!animMgr) return
    this.animationManager = animMgr

    // Hook setExpression to automatically trigger matching special effects
    const origSetExpression = animMgr.setExpression.bind(animMgr)
    animMgr.setExpression = (name, duration = 3.0) => {
      origSetExpression(name, duration)
      this.handleEmotionChange(name, duration)
    }

    // Hook triggerNamedAnimation
    const origTriggerNamedAnim = animMgr.triggerNamedAnimation.bind(animMgr)
    animMgr.triggerNamedAnimation = (name) => {
      this.handleAnimationTrigger(name)
      return origTriggerNamedAnim(name)
    }
  }

  handleEmotionChange(name, duration = 3.0) {
    if (!name) return
    const lower = String(name).toLowerCase().trim()

    if (lower.includes('blush') || lower.includes('shy') || lower === 'love' || lower === 'heart') {
      this.triggerHearts({ count: 12 })
      this.triggerVignette('pink', duration)
      this.setMoodLighting('love')
    } else if (lower.includes('cry') || lower.includes('tear') || lower.includes('sad') || lower.includes('grief')) {
      this.triggerTears({ count: 24 })
      this.triggerGloom({ duration: Math.min(duration, 4.0) })
      this.triggerVignette('blue', duration)
      this.setMoodLighting('sad')
    } else if (lower.includes('angry') || lower.includes('furious') || lower.includes('mad')) {
      this.triggerSteam({ count: 10 })
      this.triggerVignette('red', duration)
      this.setMoodLighting('angry')
    } else if (lower.includes('surpris') || lower.includes('shock') || lower === 'realization') {
      this.triggerExclamation()
      this.triggerSpeedLines({ duration: 1.0 })
      this.triggerVignette('yellow', 1.2)
      this.setMoodLighting('surprised')
    } else if (lower.includes('think') || lower.includes('ponder') || lower.includes('confus')) {
      this.triggerQuestion()
    } else if (lower.includes('sleep') || lower.includes('bored') || lower.includes('tired')) {
      this.triggerZzz()
    } else if (lower.includes('happy') || lower.includes('joy') || lower.includes('cheer') || lower.includes('excited')) {
      this.triggerSparkles({ count: 28 })
      this.triggerMusicNotes({ count: 4 })
      this.setMoodLighting('happy')
    } else if (lower.includes('dizzy')) {
      this.triggerSweat()
      this.triggerGlitch(0.4)
    } else if (lower === 'neutral' || lower === 'idle') {
      this.setMoodLighting('neutral')
    }
  }

  handleAnimationTrigger(name) {
    if (!name) return
    const lower = String(name).toLowerCase().trim()

    if (lower.includes('heart') || lower.includes('kiss')) {
      this.triggerHearts({ count: 18 })
      this.triggerVignette('pink', 2.5)
    } else if (lower.includes('wave') || lower.includes('greet') || lower.includes('hello')) {
      this.triggerSparkles({ count: 16 })
    } else if (lower.includes('clap') || lower.includes('cheer') || lower.includes('applause')) {
      this.triggerSparkles({ count: 30 })
      this.triggerMusicNotes({ count: 5 })
    } else if (lower.includes('spin') || lower.includes('twirl')) {
      this.triggerSpeedLines({ duration: 1.4 })
      this.triggerSparkles({ count: 22 })
    }
  }

  /**
   * Unified trigger method for explicit calls
   */
  trigger(effectName, options = {}) {
    const lower = String(effectName).toLowerCase().trim()
    switch (lower) {
      case 'hearts':
      case 'heart':
        this.triggerHearts(options)
        break
      case 'sparkles':
      case 'sparkle':
      case 'glitter':
        this.triggerSparkles(options)
        break
      case 'tears':
      case 'tear':
      case 'crying':
        this.triggerTears(options)
        break
      case 'sweat':
        this.triggerSweat(options)
        break
      case 'steam':
        this.triggerSteam(options)
        break
      case 'exclamation':
      case '!':
        this.triggerExclamation()
        break
      case 'question':
      case '?':
        this.triggerQuestion()
        break
      case 'zzz':
      case 'sleep':
        this.triggerZzz(options)
        break
      case 'music':
      case 'notes':
        this.triggerMusicNotes(options)
        break
      case 'gloom':
        this.triggerGloom(options)
        break
      case 'speed_lines':
      case 'action_lines':
        this.triggerSpeedLines(options)
        break
      case 'sakura':
        this.toggleSakura(options.enable)
        break
      case 'glitch':
        this.triggerGlitch(options.duration)
        break
      case 'vignette':
        this.triggerVignette(options.color, options.duration)
        break
      default:
        console.warn(`Unknown special effect: ${effectName}`)
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                              PER-FRAME UPDATE                              */
  /* -------------------------------------------------------------------------- */

  update(delta) {
    const safeDelta = Math.min(delta, 0.05)
    this._updateHeadPositions()

    // 1. Update dynamic lighting
    this._updateLighting(safeDelta)

    // 2. Update wind oscillation
    this.windTime += safeDelta * 1.5
    this.windForce.set(Math.sin(this.windTime) * 0.05, 0, Math.cos(this.windTime * 0.7) * 0.03)

    // 3. Update 3D Floating Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life += safeDelta

      if (p.life >= p.maxLife) {
        this.effectsGroup.remove(p.sprite)
        p.material.dispose()
        this.particles.splice(i, 1)
        continue
      }

      const progress = p.life / p.maxLife

      // Scale in and fade out
      if (progress < 0.2) {
        p.currentScale = THREE.MathUtils.lerp(p.currentScale, p.targetScale, safeDelta * 12)
      } else if (progress > 0.7) {
        p.currentScale = THREE.MathUtils.lerp(p.currentScale, 0, safeDelta * 6)
        p.material.opacity = (1.0 - progress) / 0.3
      }
      p.sprite.scale.set(p.currentScale, p.currentScale, 1)

      // Move particle
      p.position.addScaledVector(p.velocity, safeDelta)

      // Apply type-specific wobble
      if (p.wobbleSpeed) {
        const wobble = Math.sin(p.life * p.wobbleSpeed) * p.wobbleAmp
        p.sprite.position.x = p.position.x + wobble
      } else {
        p.sprite.position.copy(p.position)
      }

      // Twinkle for star sparkles
      if (p.twinkleSpeed) {
        p.material.opacity = Math.max(0.2, Math.min(1.0, 0.6 + Math.sin(p.life * p.twinkleSpeed) * 0.4))
      }
    }

    // 4. Update Head Attached Icons (!, ?, sweat, gloom)
    for (let i = this.headIcons.length - 1; i >= 0; i--) {
      const icon = this.headIcons[i]
      icon.life += safeDelta

      if (icon.life >= icon.maxLife) {
        this.effectsGroup.remove(icon.sprite)
        icon.material.dispose()
        this.headIcons.splice(i, 1)
        continue
      }

      // Pin directly to current head world position + offset
      icon.sprite.position.copy(this._headWorldPos).add(icon.anchorOffset)

      const progress = icon.life / icon.maxLife

      if (icon.type === 'pop' || icon.type === 'question') {
        // Elastic bounce overshoot: 0 -> 1.3 -> 1.0
        let s = icon.baseScale
        if (progress < 0.15) {
          const t = progress / 0.15
          s = icon.baseScale * (1.0 + Math.sin(t * Math.PI) * 0.35)
        } else if (progress > 0.75) {
          icon.material.opacity = (1.0 - progress) / 0.25
        }
        icon.sprite.scale.set(s, s, 1)
      } else if (icon.type === 'gloom') {
        // Drop down shading over forehead
        if (progress < 0.25) {
          icon.material.opacity = progress / 0.25
        } else if (progress > 0.7) {
          icon.material.opacity = (1.0 - progress) / 0.3
        }
        const s = icon.baseScale
        icon.sprite.scale.set(s, s * 1.5, 1)
      } else if (icon.type === 'sweat') {
        // Nervous drip twitch
        const twitch = Math.sin(icon.life * 6.0) * 0.015
        icon.sprite.position.y += twitch
        let s = icon.baseScale
        if (progress < 0.2) {
          s = icon.baseScale * (progress / 0.2)
        } else if (progress > 0.8) {
          icon.material.opacity = (1.0 - progress) / 0.2
        }
        icon.sprite.scale.set(s, s, 1)
      }
    }

    // 5. Update Falling Sakura Petals
    if (this.isSakuraActive) {
      for (const petal of this.sakuraPetals) {
        petal.sprite.position.y -= petal.fallSpeed * safeDelta
        petal.sprite.position.x += Math.sin(this.windTime + petal.driftOffset) * petal.driftSpeed * safeDelta * 0.3
        petal.sprite.position.z += Math.cos(this.windTime * 0.8 + petal.driftOffset) * 0.1 * safeDelta

        petal.rotation += petal.rotSpeed * safeDelta
        petal.sprite.material.rotation = petal.rotation

        // Loop back up when reaching floor
        if (petal.sprite.position.y < -0.8) {
          petal.sprite.position.y = 2.4 + Math.random() * 0.6
          petal.sprite.position.x = (Math.random() - 0.5) * 3.5
        }
      }
    }

    // 6. Update Screen Action Speed Lines
    if (this.speedLinesActive) {
      this.speedLinesTimer -= safeDelta
      if (this.speedLinesTimer <= 0) {
        this.speedLinesActive = false
        if (this.speedLinesCanvas) {
          this.speedLinesCanvas.style.opacity = '0'
          this.speedLinesCtx?.clearRect(0, 0, this.speedLinesCanvas.width, this.speedLinesCanvas.height)
        }
      } else {
        this._renderSpeedLines()
      }
    }
  }

  cleanup() {
    this.particles.forEach((p) => {
      this.effectsGroup.remove(p.sprite)
      p.material.dispose()
    })
    this.particles = []

    this.headIcons.forEach((h) => {
      this.effectsGroup.remove(h.sprite)
      h.material.dispose()
    })
    this.headIcons = []

    this.sakuraPetals.forEach((p) => {
      this.effectsGroup.remove(p.sprite)
      p.material.dispose()
    })
    this.sakuraPetals = []

    this.textureCache.forEach((t) => t.dispose())
    this.textureCache.clear()

    if (this.overlayContainer && this.overlayContainer.parentNode) {
      this.overlayContainer.parentNode.removeChild(this.overlayContainer)
    }
  }
}
