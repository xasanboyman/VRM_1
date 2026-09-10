import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'
import { cacheManager } from './cacheManager.js'

export class VRMLoader {
  loader

  constructor() {
    this.loader = new GLTFLoader()
    this.loader.setCrossOrigin('anonymous')
    this.loader.register((parser) => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: false }))
  }

  async loadVRMFromPath(path) {
    if (!path) {
      console.warn('VRMLoader: Empty path provided')
      return null
    }
    try {
      // 1. Bypass and delete stale cache for local models so updates always load
      let buffer = null
      if (path.startsWith('/models/')) {
        await cacheManager.deleteCached('models', path).catch(() => {})
      } else {
        const cached = await cacheManager.getCached('models', path)
        if (cached) {
          if (cached.meta && cached.buffer) {
            buffer = cached.buffer
            console.log('⚡ VRMLoader: Loaded from cache (with meta):', path)
          } else if (cached.byteLength) {
            buffer = cached
            console.log('⚡ VRMLoader: Loaded from cache (legacy):', path)
          }
        }
      }

      if (buffer) {
        const gltf = await this.loader.parseAsync(buffer, path)
        const vrm = gltf.userData.vrm
        this.setupVRMModel(vrm)
        return vrm
      }

      // 2. Fetch if not cached
      const fetchUrl = path.startsWith('/models/') ? `${path}?v=${Date.now()}` : path
      console.log('🌐 VRMLoader: Fetching from network:', fetchUrl)
      const response = await fetch(fetchUrl)
      if (!response.ok) throw new Error(`Failed to fetch ${path}`)

      const arrayBuffer = await response.arrayBuffer()

      // 3. Store in Cache (only for non-local models or if not disabled)
      if (!path.startsWith('/models/')) {
        cacheManager
          .setCached('models', path, arrayBuffer)
          .catch((err) => console.warn('Failed to cache model', err))
      }

      // 4. Parse
      const gltf = await this.loader.parseAsync(arrayBuffer, path)
      const vrm = gltf.userData.vrm
      this.setupVRMModel(vrm)
      return vrm
    } catch (error) {
      console.error('VRMLoader: Error loading', error)
      throw error
    }
  }

  async loadVRMFromFile(file) {
    try {
      console.log('Loading VRM model from file:', file.name)
      const arrayBuffer = await file.arrayBuffer()

      // Save to cache with metadata
      const key = `user_vrm_${Date.now()}`
      const meta = {
        name: file.name,
        date: Date.now(),
        type: 'user',
        size: file.size,
      }

      await cacheManager.setCached('models', key, {
        buffer: arrayBuffer,
        meta,
      })
      console.log('💾 VRMLoader: Cached user model', key)

      const gltf = await this.loader.parseAsync(arrayBuffer, '')
      const vrm = gltf.userData.vrm
      this.setupVRMModel(vrm)
      return vrm
    } catch (error) {
      console.error('Failed to load VRM from file:', error)
      throw error
    }
  }

  setupVRMModel(vrm) {
    if (!vrm) return

    if (vrm.humanoid) {
      vrm.humanoid.autoUpdateHumanBones = false
    }

    const isLegacyVrm0 = vrm.meta?.metaVersion === '0' || vrm.meta?.specVersion === '0.0'
    const isRiko = vrm.meta?.title === 'Riko' || vrm.meta?.name === 'Riko'
    vrm.scene.rotation.y = (isRiko || isLegacyVrm0) ? Math.PI : 0
    vrm.scene.scale.set(2, 2, 2)
    vrm.scene.position.set(0, -1.2, -0.3)

    // Shadow flags are per-mesh in three.js — setting them on the root Group
    // alone does nothing. Traverse so shadows actually render, and disable
    // frustum culling so animated limbs never get wrongly culled at the edges.
    vrm.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = false
        if (child.name === 'emotions' || child.material?.name === 'Emotions2') {
          child.renderOrder = 20
        }
      }
    })

    // Clamp morphTargetInfluences on all meshes after every expressionManager update
    // to prevent additive expression combinations (e.g. blush + happy + mood blends)
    // from extrapolating vertices past 1.0, which projects facial planes (blush/tears/sweat) off the face,
    // AND enforce human mouth proportions (preventing vertical mouth elongation / gaping jaw).
    if (vrm.expressionManager && typeof vrm.expressionManager.update === 'function') {
      const originalExpressionUpdate = vrm.expressionManager.update.bind(vrm.expressionManager)
      vrm.expressionManager.update = () => {
        originalExpressionUpdate()
        if (vrm.scene) {
          vrm.scene.traverse((child) => {
            if (child.isMesh && Array.isArray(child.morphTargetInfluences)) {
              const inf = child.morphTargetInfluences
              for (let i = 0; i < inf.length; i++) {
                if (inf[i] > 1.0) inf[i] = 1.0
                else if (inf[i] < 0.0) inf[i] = 0.0
              }

              // Human mouth shaping: ensure vertical jaw opening never exceeds natural human limits
              // across any combinations of jaw-opening morphs (あ, ワ, あ２, お, Fcl_MTH_A, etc.)
              const dict = child.morphTargetDictionary
              if (dict) {
                const idxAa = dict['あ'] ?? dict['Fcl_MTH_A'] ?? dict['jawOpen'] ?? dict['aa']
                const idxWa = dict['ワ']
                const idxAa2 = dict['あ２']
                const idxOh = dict['お'] ?? dict['Fcl_MTH_O'] ?? dict['mouthFunnel'] ?? dict['oh']
                const idxOu = dict['う'] ?? dict['ou']
                const idxNarrow = dict['口横狭め'] ?? dict['mouthPucker'] ?? dict['Fcl_MTH_Small']
                const idxWide = dict['口横広げ']
                const idxCorners = dict['口角上げ']

                const vAa = idxAa !== undefined ? inf[idxAa] : 0
                const vWa = idxWa !== undefined ? inf[idxWa] : 0
                const vAa2 = idxAa2 !== undefined ? inf[idxAa2] : 0
                let vOh = idxOh !== undefined ? inf[idxOh] : 0
                let vOu = idxOu !== undefined ? inf[idxOu] : 0

                // Strict caps on rounding / puckering morphs to prevent narrow fish mouth
                if (idxOh !== undefined && inf[idxOh] > 0.32) {
                  inf[idxOh] = 0.32
                  vOh = 0.32
                }
                if (idxOu !== undefined && inf[idxOu] > 0.22) {
                  inf[idxOu] = 0.22
                  vOu = 0.22
                }

                const totalVertical = vAa + vWa + vAa2 + vOh * 0.7
                const maxHumanVertical = 0.85
                if (totalVertical > maxHumanVertical) {
                  const scale = maxHumanVertical / totalVertical
                  if (idxAa !== undefined) inf[idxAa] *= scale
                  if (idxWa !== undefined) inf[idxWa] *= scale
                  if (idxAa2 !== undefined) inf[idxAa2] *= scale
                  if (idxOh !== undefined) inf[idxOh] *= scale
                }

                // If mouth is opening vertically, strictly prevent horizontal narrowing and enforce wide mouth
                if (totalVertical > 0.03) {
                  if (idxNarrow !== undefined) {
                    inf[idxNarrow] = 0.0
                  }
                  if (idxWide !== undefined) {
                    const minWide = Math.min(0.85, Math.max(0.25, totalVertical * 0.95))
                    inf[idxWide] = Math.max(inf[idxWide], minWide)
                  }
                  if (idxCorners !== undefined) {
                    const minCorners = Math.min(0.35, Math.max(0.12, totalVertical * 0.45))
                    inf[idxCorners] = Math.max(inf[idxCorners], minCorners)
                  }
                }
              }
            }
          })
        }
      }
    }

    if (isRiko) {
      this.fixTPose(vrm)
    }
  }

  fixTPose(vrm) {
    if (!vrm || !vrm.humanoid) return
    try {
      const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm')
      const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm')
      if (leftUpperArm) {
        leftUpperArm.rotation.z = 1.0
        leftUpperArm.rotation.x = 0.3
        leftUpperArm.rotation.y = 0.2
      }
      if (rightUpperArm) {
        rightUpperArm.rotation.z = -1.0
        rightUpperArm.rotation.x = 0.3
        rightUpperArm.rotation.y = -0.2
      }
    } catch (error) {
      console.error('Error fixing T-pose:', error)
    }
  }

  cleanupVRM(vrm) {
    if (!vrm) return

    // 1. Dispose VRM instance (plugin resources, blendshape managers, etc.)
    if (typeof vrm.dispose === 'function') {
      try {
        vrm.dispose()
      } catch (e) {
        console.warn('Error disposing VRM instance:', e)
      }
    }

    // 2. Deep dispose of Scene Graph (Geometries, Materials, Textures)
    if (vrm.scene) {
      vrm.scene.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) {
            child.geometry.dispose()
          }

          const materials = Array.isArray(child.material) ? child.material : [child.material]

          materials.forEach((material) => {
            if (!material) return

            // Dispose all textures on the material
            Object.keys(material).forEach((key) => {
              const prop = material[key]
              if (prop && prop.isTexture) {
                prop.dispose()
              }
            })

            material.dispose()
          })
        }
      })
    }
  }
}
