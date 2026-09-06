#!/usr/bin/env node
/**
 * Mixamo FBX  ->  VRM Animation (.vrma) converter.
 *
 *   node tools/animations/convert.mjs <input.fbx> [output.vrma]
 *   node tools/animations/convert.mjs --selftest
 *
 * The avatar can already play Mixamo `.fbx` files directly (they are retargeted
 * at load time), so this baking step is OPTIONAL — use it only to produce the
 * smaller, CDN-friendly `.vrma` format that matches the project's other clips.
 *
 * It ports the official @pixiv/three-vrm Mixamo retargeting (so bone orientation
 * math matches a known-good reference), samples the result into VRM-agnostic
 * "normalized" humanoid-bone rotations, and writes a glTF carrying the
 * `VRMC_vrm_animation` extension.
 *
 * Note: rotation tracks (the bulk of the motion) are the well-validated part.
 * Hips *translation* is scaled best-effort (cm -> m); most upper-body gestures
 * barely use it. Always eyeball the result in the app after converting.
 */
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { Buffer } from 'node:buffer'
import process from 'node:process'

// three's loaders dispatch ProgressEvent, which isn't a Node global. Polyfill it
// so GLTFLoader can resolve the embedded data-URI buffer when verifying output.
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

const FBX_TO_METERS = 0.01 // Mixamo exports in centimeters.

const MIXAMO_VRM_RIG_MAP = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
}

// BVH packs (e.g. the SillyTavern VRM pack) already name joints with VRM
// humanoid bone names, but use the VRM0 thumb naming. Remap thumbs to VRM1.0
// and drop eyes (driven by lookAt). Everything else maps 1:1.
const BVH_BONE_OVERRIDES = {
  leftThumbProximal: 'leftThumbMetacarpal',
  leftThumbIntermediate: 'leftThumbProximal',
  leftThumbDistal: 'leftThumbDistal',
  rightThumbProximal: 'rightThumbMetacarpal',
  rightThumbIntermediate: 'rightThumbProximal',
  rightThumbDistal: 'rightThumbDistal',
}
const BVH_BONE_SKIP = new Set(['leftEye', 'rightEye'])

function mapBvhBone(name) {
  if (BVH_BONE_SKIP.has(name)) return null
  return BVH_BONE_OVERRIDES[name] || name
}

/**
 * Retarget a BVH clip to normalized humanoid bone tracks. BVH rest poses carry
 * identity bone rotations (every joint's rest frame is world-aligned), which is
 * exactly the VRM "normalized" convention — so local rotations copy across
 * directly. Hips translation is kept in BVH units; three-vrm rescales it to the
 * target model using the hips node's rest height (set in buildVrmaGltf).
 */
function retargetBvh(text) {
  const { skeleton, clip } = new BVHLoader().parse(text)
  const hipsBone = skeleton.bones.find((b) => b.name === 'hips')
  const hipsRestHeight = hipsBone ? hipsBone.position.y : 1

  const rotations = new Map()
  let hipsTranslation = null

  clip.tracks.forEach((track) => {
    const dot = track.name.lastIndexOf('.')
    const jointName = track.name.slice(0, dot)
    const property = track.name.slice(dot + 1)
    const boneName = mapBvhBone(jointName)
    if (!boneName) return

    if (property === 'quaternion') {
      rotations.set(boneName, { times: Array.from(track.times), values: Array.from(track.values) })
    } else if (property === 'position' && boneName === 'hips') {
      hipsTranslation = { times: Array.from(track.times), values: Array.from(track.values) }
    }
  })

  if (rotations.size === 0) throw new Error('No mappable humanoid bones found in BVH')
  return { name: clip.name || 'clip', duration: clip.duration, rotations, hipsTranslation, hipsRestHeight }
}

/** Retarget a parsed Mixamo asset to normalized humanoid bone tracks. */
function retargetMixamo(asset) {
  const sourceClip =
    THREE.AnimationClip.findByName(asset.animations, 'mixamo.com') || asset.animations?.[0]
  if (!sourceClip) throw new Error('No animation found in FBX')

  const restRotationInverse = new THREE.Quaternion()
  const parentRestWorldRotation = new THREE.Quaternion()
  const _quat = new THREE.Quaternion()

  const motionHips = asset.getObjectByName('mixamorigHips')
  const hipsRestHeight = (motionHips ? motionHips.position.y : 100) * FBX_TO_METERS

  const rotations = new Map() // boneName -> { times, values }
  let hipsTranslation = null

  sourceClip.tracks.forEach((track) => {
    const [rigName, property] = track.name.split('.')
    const boneName = MIXAMO_VRM_RIG_MAP[rigName]
    const rigNode = asset.getObjectByName(rigName)
    if (!boneName || !rigNode) return

    rigNode.getWorldQuaternion(restRotationInverse).invert()
    if (rigNode.parent) rigNode.parent.getWorldQuaternion(parentRestWorldRotation)
    else parentRestWorldRotation.identity()

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const values = Array.from(track.values)
      for (let i = 0; i < values.length; i += 4) {
        _quat.fromArray(values, i)
        _quat.premultiply(parentRestWorldRotation).multiply(restRotationInverse)
        _quat.toArray(values, i)
      }
      rotations.set(boneName, { times: Array.from(track.times), values })
    } else if (boneName === 'hips' && track instanceof THREE.VectorKeyframeTrack && property === 'position') {
      hipsTranslation = {
        times: Array.from(track.times),
        values: Array.from(track.values).map((v) => v * FBX_TO_METERS),
      }
    }
  })

  if (rotations.size === 0) throw new Error('No mappable humanoid bones found')
  return { name: sourceClip.name || 'clip', duration: sourceClip.duration, rotations, hipsTranslation, hipsRestHeight }
}

/** Build a glTF (with VRMC_vrm_animation) object from retargeted tracks. */
function buildVrmaGltf(retargeted) {
  const { rotations, hipsTranslation, hipsRestHeight } = retargeted

  const chunks = [] // { name, array }
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

  const nodes = []
  const humanBones = {}
  const samplers = []
  const channels = []

  const boneNames = [...rotations.keys()]
  // Ensure hips exists as a node even if only rotation is present.
  boneNames.forEach((boneName) => {
    const node = { name: boneName }
    if (boneName === 'hips') node.translation = [0, hipsRestHeight, 0]
    const nodeIndex = nodes.push(node) - 1
    humanBones[boneName] = { node: nodeIndex }

    const rot = rotations.get(boneName)
    const input = addAccessor(Float32Array.from(rot.times), 'SCALAR', 1)
    const output = addAccessor(Float32Array.from(rot.values), 'VEC4', 4)
    samplers.push({ input, output, interpolation: 'LINEAR' })
    channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex, path: 'rotation' } })

    if (boneName === 'hips' && hipsTranslation) {
      const tin = addAccessor(Float32Array.from(hipsTranslation.times), 'SCALAR', 1)
      const tout = addAccessor(Float32Array.from(hipsTranslation.values), 'VEC3', 3)
      samplers.push({ input: tin, output: tout, interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex, path: 'translation' } })
    }
  })

  // Concatenate accessor data into one buffer (data URI).
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
    scenes: [{ nodes: nodes.map((_, i) => i) }],
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

async function verifyVrma(gltfJson) {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser))
  const text = JSON.stringify(gltfJson)
  const buffer = new TextEncoder().encode(text).buffer
  return await new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => {
      const anims = gltf.userData.vrmAnimations
      if (anims && anims.length > 0) resolve(anims[0])
      else reject(new Error('Parsed file contains no vrmAnimations'))
    }, reject)
  })
}

function convertFile(inPath, outPath) {
  const isBvh = /\.bvh$/i.test(inPath)
  let retargeted
  if (isBvh) {
    retargeted = retargetBvh(readFileSync(inPath, 'utf8'))
  } else {
    const buf = readFileSync(inPath)
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    retargeted = retargetMixamo(new FBXLoader().parse(arrayBuffer, ''))
  }
  const gltf = buildVrmaGltf(retargeted)
  const out = outPath || inPath.replace(/\.(fbx|bvh)$/i, '.vrma')
  writeFileSync(out, JSON.stringify(gltf))
  return { out, retargeted, gltf }
}

async function runSelfTest() {
  // Author a tiny VRMA from synthetic tracks and confirm it reloads as a valid
  // VRM animation. Validates the glTF + VRMC_vrm_animation authoring end-to-end.
  const times = [0, 0.5, 1]
  const identity = [0, 0, 0, 1]
  const rotations = new Map([
    ['hips', { times, values: [...identity, ...identity, ...identity] }],
    ['spine', { times, values: [...identity, ...identity, ...identity] }],
    ['head', { times, values: [...identity, ...identity, ...identity] }],
  ])
  const gltf = buildVrmaGltf({
    rotations,
    hipsTranslation: { times, values: [0, 1, 0, 0, 1.02, 0, 0, 1, 0] },
    hipsRestHeight: 1.0,
  })
  const anim = await verifyVrma(gltf)
  const boneCount = anim.humanoidTracks?.rotation?.size ?? 0
  if (boneCount < 3) throw new Error(`Expected 3 rotation tracks, got ${boneCount}`)
  console.log(`✅ self-test passed: authored VRMA reloaded with ${boneCount} humanoid rotation tracks.`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--selftest') {
    await runSelfTest()
    return
  }
  if (!args[0]) {
    console.error('Usage: node tools/animations/convert.mjs <input.fbx> [output.vrma]')
    process.exit(1)
  }
  const { out, retargeted, gltf } = convertFile(args[0], args[1])
  await verifyVrma(gltf) // fail loudly if the output is not a valid VRMA
  console.log(
    `✅ ${basename(args[0])} -> ${out}  (${retargeted.rotations.size} bones, ${retargeted.duration.toFixed(2)}s)`,
  )
}

main().catch((err) => {
  console.error('❌ Conversion failed:', err.message)
  process.exit(1)
})
