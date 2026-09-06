#!/usr/bin/env node
import * as THREE from 'three'
import { writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation'

if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type
      this.lengthComputable = init.lengthComputable ?? false
      this.loaded = init.loaded ?? 0
      this.total = init.total ?? 0
    }
  }
}

// Complete VRM 1.0 Humanoid Hierarchy
const BONE_HIERARCHY = {
  hips: ['spine', 'leftUpperLeg', 'rightUpperLeg'],
  spine: ['chest'],
  chest: ['neck', 'leftUpperArm', 'rightUpperArm'],
  neck: ['head'],
  head: [],
  leftUpperArm: ['leftLowerArm'],
  leftLowerArm: ['leftHand'],
  leftHand: [],
  rightUpperArm: ['rightLowerArm'],
  rightLowerArm: ['rightHand'],
  rightHand: [],
  leftUpperLeg: ['leftLowerLeg'],
  leftLowerLeg: ['leftFoot'],
  leftFoot: [],
  rightUpperLeg: ['rightLowerLeg'],
  rightLowerLeg: ['rightFoot'],
  rightFoot: [],
}

const ALL_HUMANOID_BONES = Object.keys(BONE_HIERARCHY)

// Natural relaxed VRM standing rest posture (A-pose) — arms hang down naturally to sides!
const DEFAULT_REST_ROTATIONS = {
  leftUpperArm: [0.12, -0.05, -1.24],
  rightUpperArm: [0.12, 0.05, 1.24],
  leftLowerArm: [0.08, 0, -0.15],
  rightLowerArm: [0.08, 0, 0.15],
  leftHand: [0, 0, 0],
  rightHand: [0, 0, 0],
  spine: [0, 0, 0],
  chest: [0, 0, 0],
  neck: [0, 0, 0],
  head: [0, 0, 0],
  hips: [0, 0, 0],
  leftUpperLeg: [0, 0, 0],
  rightUpperLeg: [0, 0, 0],
  leftLowerLeg: [0, 0, 0],
  rightLowerLeg: [0, 0, 0],
  leftFoot: [0, 0, 0],
  rightFoot: [0, 0, 0],
}

function buildValidVrmaGltf(trackData) {
  const { rotations, duration } = trackData
  const times = [0, duration]

  const chunks = []
  const bufferViews = []
  const accessors = []

  const addAccessor = (array, type, componentCount) => {
    const byteOffsetAligned = chunks.reduce((sum, c) => sum + c.array.byteLength, 0)
    chunks.push({ array })
    const min = new Array(componentCount).fill(Infinity)
    const max = new Array(componentCount).fill(-Infinity)
    for (let i = 0; i < array.length; i++) {
      const c = i % componentCount
      if (array[i] < min[c]) min[c] = array[i]
      if (array[i] > max[c]) max[c] = array[i]
    }
    bufferViews.push({ buffer: 0, byteOffset: byteOffsetAligned, byteLength: array.byteLength })
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126, // FLOAT
      count: array.length / componentCount,
      type,
      min,
      max,
    })
    return accessors.length - 1
  }

  // Define nodes for ALL humanoid bones
  const nodes = []
  const boneNameToIndex = {}
  const humanBones = {}

  ALL_HUMANOID_BONES.forEach((boneName) => {
    const node = { name: boneName }
    if (boneName === 'hips') {
      node.translation = [0, 1.0, 0]
    }
    const idx = nodes.push(node) - 1
    boneNameToIndex[boneName] = idx
    humanBones[boneName] = { node: idx }
  })

  // Wire parent-child relationships
  ALL_HUMANOID_BONES.forEach((boneName) => {
    const parentIdx = boneNameToIndex[boneName]
    const childrenNames = BONE_HIERARCHY[boneName] || []
    const childrenIndices = childrenNames.map((c) => boneNameToIndex[c]).filter((i) => i != null)
    if (childrenIndices.length > 0) {
      nodes[parentIdx].children = childrenIndices
    }
  })

  const samplers = []
  const channels = []

  // Add rotation samplers and channels
  ALL_HUMANOID_BONES.forEach((boneName) => {
    const nodeIndex = boneNameToIndex[boneName]
    let rot = rotations.get(boneName)
    if (!rot) {
      // Natural default resting pose for this bone
      const restEuler = DEFAULT_REST_ROTATIONS[boneName] || [0, 0, 0]
      const euler = new THREE.Euler(restEuler[0], restEuler[1], restEuler[2], 'YXZ')
      const quat = new THREE.Quaternion().setFromEuler(euler)
      rot = {
        times,
        values: [quat.x, quat.y, quat.z, quat.w, quat.x, quat.y, quat.z, quat.w],
      }
    }

    const input = addAccessor(Float32Array.from(rot.times), 'SCALAR', 1)
    const output = addAccessor(Float32Array.from(rot.values), 'VEC4', 4)
    samplers.push({ input, output, interpolation: 'LINEAR' })
    channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex, path: 'rotation' } })
  })

  // Add hips translation
  const hipsNodeIndex = boneNameToIndex['hips']
  const tin = addAccessor(Float32Array.from([0, duration]), 'SCALAR', 1)
  const tout = addAccessor(Float32Array.from([0, 1.0, 0, 0, 1.0, 0]), 'VEC3', 3)
  samplers.push({ input: tin, output: tout, interpolation: 'LINEAR' })
  channels.push({ sampler: samplers.length - 1, target: { node: hipsNodeIndex, path: 'translation' } })

  const totalBytes = chunks.reduce((sum, c) => sum + c.array.byteLength, 0)
  const merged = new Uint8Array(totalBytes)
  let offset = 0
  for (const c of chunks) {
    merged.set(new Uint8Array(c.array.buffer, c.array.byteOffset, c.array.byteLength), offset)
    offset += c.array.byteLength
  }
  const base64 = Buffer.from(merged).toString('base64')

  return {
    asset: { version: '2.0', generator: 'vrm1-fbx2vrma' },
    extensionsUsed: ['VRMC_vrm_animation'],
    buffers: [{ byteLength: totalBytes, uri: `data:application/octet-stream;base64,${base64}` }],
    bufferViews,
    accessors,
    nodes,
    scenes: [{ nodes: [boneNameToIndex['hips']] }],
    scene: 0,
    animations: [{ name: 'vrma', samplers, channels }],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: '1.0',
        humanoid: { humanBones },
      },
    },
  }
}

// Helper to construct keyframed animation with smooth Hermite easing
function createTrack(duration, fps, boneKeyframes) {
  const frameCount = Math.max(2, Math.round(duration * fps))
  const times = []
  for (let i = 0; i <= frameCount; i++) {
    times.push(Math.min(duration, (i / frameCount) * duration))
  }

  const rotations = new Map()

  for (const [boneName, generator] of Object.entries(boneKeyframes)) {
    const values = []
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    const quat = new THREE.Quaternion()

    for (let i = 0; i < times.length; i++) {
      const t = times[i] / duration // normalized 0..1
      const [rx, ry, rz] = generator(t, times[i])
      euler.set(rx, ry, rz)
      quat.setFromEuler(euler)
      values.push(quat.x, quat.y, quat.z, quat.w)
    }

    rotations.set(boneName, { times, values })
  }

  return { duration, rotations }
}

const CLIP_DEFINITIONS = {
  // 1. Nod (Affirmative head nod with relaxed natural arms)
  'Nod.vrma': () =>
    createTrack(1.8, 30, {
      head: (t) => {
        const nod = Math.sin(t * Math.PI * 4) * Math.sin(t * Math.PI) * 0.35
        return [nod, 0, 0]
      },
      neck: (t) => [Math.sin(t * Math.PI * 4) * Math.sin(t * Math.PI) * 0.15, 0, 0],
      chest: (t) => [Math.sin(t * Math.PI * 2) * 0.04, 0, 0],
      spine: (t) => [Math.sin(t * Math.PI * 2) * 0.02, 0, 0],
      leftUpperArm: () => [0.12, -0.05, -1.24],
      rightUpperArm: () => [0.12, 0.05, 1.24],
      leftLowerArm: () => [0.08, 0, -0.15],
      rightLowerArm: () => [0.08, 0, 0.15],
    }),

  // 2. ShakeHead (Head shake with relaxed natural arms)
  'ShakeHead.vrma': () =>
    createTrack(2.0, 30, {
      head: (t) => {
        const shake = Math.sin(t * Math.PI * 5) * Math.sin(t * Math.PI) * 0.38
        const tilt = Math.cos(t * Math.PI * 2.5) * Math.sin(t * Math.PI) * 0.08
        return [0.04, shake, tilt]
      },
      neck: (t) => [0, Math.sin(t * Math.PI * 5) * Math.sin(t * Math.PI) * 0.15, 0],
      spine: (t) => [0, 0, Math.sin(t * Math.PI * 2.5) * 0.02],
      leftUpperArm: () => [0.12, -0.05, -1.24],
      rightUpperArm: () => [0.12, 0.05, 1.24],
      leftLowerArm: () => [0.08, 0, -0.15],
      rightLowerArm: () => [0.08, 0, 0.15],
    }),

  // 3. Thinking (Hand to chin, thoughtful gaze, left arm relaxed)
  'Thinking.vrma': () =>
    createTrack(3.2, 30, {
      head: (t) => {
        const c = Math.sin(t * Math.PI)
        return [-0.12 * c, 0.22 * c, 0.15 * c]
      },
      neck: (t) => [-0.05 * Math.sin(t * Math.PI), 0.1 * Math.sin(t * Math.PI), 0.05 * Math.sin(t * Math.PI)],
      chest: (t) => [0.03 * Math.sin(t * Math.PI), 0.05 * Math.sin(t * Math.PI), 0],
      leftUpperArm: () => [0.12, -0.05, -1.24],
      leftLowerArm: () => [0.08, 0, -0.15],
      rightUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [-0.75 * c + 0.12 * (1 - c), 0.25 * c + 0.05 * (1 - c), 0.45 * c + 1.24 * (1 - c)]
      },
      rightLowerArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.1 * c + 0.08 * (1 - c), 0, 1.45 * c + 0.15 * (1 - c)]
      },
      rightHand: (t) => [0.2 * Math.sin(t * Math.PI), 0, 0.3 * Math.sin(t * Math.PI)],
    }),

  // 4. Bow (Respectful greeting / apology)
  'Bow.vrma': () =>
    createTrack(2.4, 30, {
      hips: (t) => [Math.sin(t * Math.PI) * 0.22, 0, 0],
      spine: (t) => [Math.sin(t * Math.PI) * 0.35, 0, 0],
      chest: (t) => [Math.sin(t * Math.PI) * 0.25, 0, 0],
      neck: (t) => [Math.sin(t * Math.PI) * 0.15, 0, 0],
      head: (t) => [Math.sin(t * Math.PI) * 0.12, 0, 0],
      leftUpperArm: (t) => [0.12 + Math.sin(t * Math.PI) * 0.15, -0.05, -1.24 + Math.sin(t * Math.PI) * 0.15],
      rightUpperArm: (t) => [0.12 + Math.sin(t * Math.PI) * 0.15, 0.05, 1.24 - Math.sin(t * Math.PI) * 0.15],
      leftLowerArm: () => [0.08, 0, -0.15],
      rightLowerArm: () => [0.08, 0, 0.15],
    }),

  // 5. Cheering / Victory (Both hands raised triumphantly)
  'Cheering.vrma': () =>
    createTrack(2.8, 30, {
      hips: (t) => [0, 0, Math.sin(t * Math.PI * 4) * 0.04],
      spine: (t) => [-0.08 * Math.sin(t * Math.PI), 0, Math.sin(t * Math.PI * 4) * 0.03],
      chest: (t) => [-0.12 * Math.sin(t * Math.PI), 0, 0],
      head: (t) => [-0.2 * Math.sin(t * Math.PI), 0, 0],
      leftUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        const wave = Math.sin(t * Math.PI * 6) * 0.15 * c
        return [-0.6 * c + 0.12 * (1 - c), 0, -2.4 * c + -1.24 * (1 - c) + wave]
      },
      leftLowerArm: (t) => [0.08, 0, -0.8 * Math.sin(t * Math.PI) + -0.15 * (1 - Math.sin(t * Math.PI))],
      rightUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        const wave = Math.sin(t * Math.PI * 6) * 0.15 * c
        return [-0.6 * c + 0.12 * (1 - c), 0, 2.4 * c + 1.24 * (1 - c) - wave]
      },
      rightLowerArm: (t) => [0.08, 0, 0.8 * Math.sin(t * Math.PI) + 0.15 * (1 - Math.sin(t * Math.PI))],
    }),

  // 6. Facepalm (Exasperation, right hand to forehead, left arm down)
  'Facepalm.vrma': () =>
    createTrack(2.8, 30, {
      head: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.28 * c, 0.08 * c, -0.12 * c]
      },
      neck: (t) => [0.15 * Math.sin(t * Math.PI), 0, 0],
      spine: (t) => [0.08 * Math.sin(t * Math.PI), 0, 0],
      leftUpperArm: () => [0.12, -0.05, -1.24],
      leftLowerArm: () => [0.08, 0, -0.15],
      rightUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [-0.85 * c + 0.12 * (1 - c), 0.3 * c, 0.45 * c + 1.24 * (1 - c)]
      },
      rightLowerArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.1 * c, 0, 1.85 * c + 0.15 * (1 - c)]
      },
      rightHand: (t) => [0.35 * Math.sin(t * Math.PI), 0, 0.2 * Math.sin(t * Math.PI)],
    }),

  // 7. Explaining (Two-handed expressive conversational gesture)
  'Explaining.vrma': () =>
    createTrack(3.0, 30, {
      spine: (t) => [Math.sin(t * Math.PI * 2) * 0.03, 0, 0],
      chest: (t) => [Math.cos(t * Math.PI * 2) * 0.04, 0, 0],
      head: (t) => [Math.sin(t * Math.PI * 3) * 0.08, Math.sin(t * Math.PI * 2) * 0.06, 0],
      leftUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        const p = Math.sin(t * Math.PI * 3) * 0.12 * c
        return [-0.5 * c + 0.12 * (1 - c), -0.2 * c, -0.6 * c + -1.24 * (1 - c) + p]
      },
      leftLowerArm: (t) => [0.1, 0, -1.1 * Math.sin(t * Math.PI) + -0.15 * (1 - Math.sin(t * Math.PI))],
      leftHand: (t) => [0, -0.3 * Math.sin(t * Math.PI), 0],
      rightUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        const p = Math.sin(t * Math.PI * 3 + 1) * 0.12 * c
        return [-0.5 * c + 0.12 * (1 - c), 0.2 * c, 0.6 * c + 1.24 * (1 - c) - p]
      },
      rightLowerArm: (t) => [0.1, 0, 1.1 * Math.sin(t * Math.PI) + 0.15 * (1 - Math.sin(t * Math.PI))],
      rightHand: (t) => [0, 0.3 * Math.sin(t * Math.PI), 0],
    }),

  // 8. HandsOnHips (Sassy hands on hips pose)
  'HandsOnHips.vrma': () =>
    createTrack(3.2, 30, {
      hips: (t) => [0, 0, Math.sin(t * Math.PI) * 0.06],
      spine: (t) => [-0.05 * Math.sin(t * Math.PI), 0, -Math.sin(t * Math.PI) * 0.05],
      chest: (t) => [-0.08 * Math.sin(t * Math.PI), 0, 0],
      head: (t) => [-0.05 * Math.sin(t * Math.PI), 0.12 * Math.sin(t * Math.PI), 0.08 * Math.sin(t * Math.PI)],
      leftUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.12, -0.2 * c - 0.05 * (1 - c), -0.75 * c + -1.24 * (1 - c)]
      },
      leftLowerArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.08, 0, -1.35 * c + -0.15 * (1 - c)]
      },
      leftHand: (t) => [0, 0, -0.3 * Math.sin(t * Math.PI)],
      rightUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.12, 0.2 * c + 0.05 * (1 - c), 0.75 * c + 1.24 * (1 - c)]
      },
      rightLowerArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.08, 0, 1.35 * c + 0.15 * (1 - c)]
      },
      rightHand: (t) => [0, 0, 0.3 * Math.sin(t * Math.PI)],
    }),

  // 9. HeartFingers (Cute K-Pop heart pose, left arm down)
  'HeartFingers.vrma': () =>
    createTrack(2.8, 30, {
      head: (t) => [0, 0, Math.sin(t * Math.PI) * 0.15],
      chest: (t) => [0.04 * Math.sin(t * Math.PI), 0, 0],
      leftUpperArm: () => [0.12, -0.05, -1.24],
      leftLowerArm: () => [0.08, 0, -0.15],
      rightUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [-0.6 * c + 0.12 * (1 - c), 0.35 * c, 0.3 * c + 1.24 * (1 - c)]
      },
      rightLowerArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.1, 0, 1.65 * c + 0.15 * (1 - c)]
      },
      rightHand: (t) => [0.4 * Math.sin(t * Math.PI), 0, 0.2 * Math.sin(t * Math.PI)],
    }),

  // 10. Shy / Fidgeting
  'Shy.vrma': () =>
    createTrack(3.0, 30, {
      head: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.22 * c, -0.15 * c, -0.18 * c]
      },
      neck: (t) => [0.12 * Math.sin(t * Math.PI), 0, -0.08 * Math.sin(t * Math.PI)],
      spine: (t) => [0.06 * Math.sin(t * Math.PI), 0, Math.sin(t * Math.PI * 3) * 0.03],
      leftUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.35 * c + 0.12 * (1 - c), -0.1, -0.9 * c + -1.24 * (1 - c)]
      },
      leftLowerArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.08, 0, -0.9 * c + -0.15 * (1 - c)]
      },
      rightUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.35 * c + 0.12 * (1 - c), 0.1, 0.9 * c + 1.24 * (1 - c)]
      },
      rightLowerArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.08, 0, 0.9 * c + 0.15 * (1 - c)]
      },
    }),

  // 11. CutthroatGesture
  'CutthroatGesture.vrma': () =>
    createTrack(2.4, 30, {
      head: (t) => [0.1 * Math.sin(t * Math.PI), -0.2 * Math.sin(t * Math.PI), 0],
      neck: (t) => [0.05 * Math.sin(t * Math.PI), -0.1 * Math.sin(t * Math.PI), 0],
      chest: (t) => [0.04 * Math.sin(t * Math.PI), 0, 0],
      leftUpperArm: () => [0.12, -0.05, -1.24],
      leftLowerArm: () => [0.08, 0, -0.15],
      rightUpperArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [-0.75 * c + 0.12 * (1 - c), 0.4 * c, 0.3 * c + 1.24 * (1 - c)]
      },
      rightLowerArm: (t) => {
        const c = Math.sin(t * Math.PI)
        return [0.1, 0, 1.75 * c + 0.15 * (1 - c)]
      },
      rightHand: (t) => [0.4 * Math.sin(t * Math.PI), -0.5 * Math.sin(t * Math.PI * 2), 0.3 * Math.sin(t * Math.PI)],
    }),
}

async function main() {
  console.log('🎬 Generating and verifying realistic A-pose VRMA animations...')
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser))

  for (const [filename, builder] of Object.entries(CLIP_DEFINITIONS)) {
    const trackData = builder()
    const gltf = buildValidVrmaGltf(trackData)
    const outPath = `public/animations/${filename}`
    const jsonStr = JSON.stringify(gltf)
    writeFileSync(outPath, jsonStr)

    // Verify
    const buffer = new TextEncoder().encode(jsonStr).buffer
    await new Promise((resolve, reject) => {
      loader.parse(buffer, '', (parsedGltf) => {
        const anim = parsedGltf.userData.vrmAnimations?.[0]
        if (!anim) {
          reject(new Error(`Failed to parse ${filename}`))
        } else {
          console.log(`  ✨ Verified ${filename}: ${anim.humanoidTracks.rotation.size} tracks, ${anim.duration}s`)
          resolve()
        }
      }, reject)
    })
  }

  console.log(`✅ All ${Object.keys(CLIP_DEFINITIONS).length} VRMA animations generated with natural A-pose posture and verified!`)
}

main()
