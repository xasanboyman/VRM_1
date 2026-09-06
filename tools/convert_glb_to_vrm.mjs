#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'

const INPUT_PATH = '/home/xasanboy/Downloads/Ani-default_481.glb'
const OUTPUT_VRM_PATH = '/home/xasanboy/VRM_1/public/models/Ani.vrm'
const DOWNLOADS_VRM_PATH = '/home/xasanboy/Downloads/Ani.vrm'

console.log('--- Converting GLB to VRM 1.0 with T-Pose CPU Baking ---')
console.log(`Input:  ${INPUT_PATH}`)
console.log(`Output: ${OUTPUT_VRM_PATH}`)

// 1. Read and parse GLB
const buffer = fs.readFileSync(INPUT_PATH)
const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

if (dataView.getUint32(0, true) !== 0x46546c67) {
  throw new Error('Not a valid GLB file.')
}
if (dataView.getUint32(4, true) !== 2) {
  throw new Error('Unsupported GLB version.')
}

const jsonChunkLength = dataView.getUint32(12, true)
const jsonChunkType = dataView.getUint32(16, true)
if (jsonChunkType !== 0x4e4f534a) {
  throw new Error('First chunk is not JSON.')
}

const jsonBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + 20, jsonChunkLength)
const gltfJson = JSON.parse(new TextDecoder('utf-8').decode(jsonBytes))

let binBuffer = null
const binOffset = 20 + jsonChunkLength
if (binOffset < dataView.byteLength) {
  const binChunkLength = dataView.getUint32(binOffset, true)
  const binChunkType = dataView.getUint32(binOffset + 4, true)
  if (binChunkType !== 0x004e4942) {
    throw new Error('Expected BIN chunk.')
  }
  binBuffer = buffer.buffer.slice(buffer.byteOffset + binOffset + 8, buffer.byteOffset + binOffset + 8 + binChunkLength)
}

const newGltf = JSON.parse(JSON.stringify(gltfJson))

// 2. Node name lookup
const nodeNameToIndex = {}
newGltf.nodes.forEach((n, idx) => {
  if (n.name) nodeNameToIndex[n.name] = idx
})

// Humanoid bone mappings for Ani
const humanoidBoneMap = {
  // Spine / Core
  hips: nodeNameToIndex['Hips'], // 442
  spine: nodeNameToIndex['Spine'], // 441
  chest: nodeNameToIndex['Chest'], // 287
  neck: nodeNameToIndex['Neck'], // 203
  head: nodeNameToIndex['Head'], // 202

  // Left Arm (anatomical left: Left_arm, Left_elbow, Left_wrist)
  leftShoulder: nodeNameToIndex['Left_shoulder'], // 245
  leftUpperArm: nodeNameToIndex['Left_arm'], // 242
  leftLowerArm: nodeNameToIndex['Left_elbow'], // 233
  leftHand: nodeNameToIndex['Left_wrist'], // 221

  // Right Arm (anatomical right: Right_arm, Right_elbow, Right_wrist)
  rightShoulder: nodeNameToIndex['Right_shoulder'], // 277
  rightUpperArm: nodeNameToIndex['Right_arm'], // 274
  rightLowerArm: nodeNameToIndex['Right_elbow'], // 264
  rightHand: nodeNameToIndex['Right_wrist'], // 263

  // Left Leg
  leftUpperLeg: nodeNameToIndex['Left_leg'], // 11
  leftLowerLeg: nodeNameToIndex['Left_knee'], // 3
  leftFoot: nodeNameToIndex['Left_ankle'], // 1
  leftToes: nodeNameToIndex['Left_toe'], // 0

  // Right Leg
  rightUpperLeg: nodeNameToIndex['Right_leg'], // 28
  rightLowerLeg: nodeNameToIndex['Right_knee'], // 19
  rightFoot: nodeNameToIndex['Right_ankle'], // 13
  rightToes: nodeNameToIndex['Right_toe'], // 12

  // Left Hand Fingers
  leftThumbMetacarpal: nodeNameToIndex['Thumb0_L'], // 220
  leftThumbProximal: nodeNameToIndex['Thumb1_L'], // 219
  leftThumbDistal: nodeNameToIndex['Thumb2_L'], // 218
  leftIndexProximal: nodeNameToIndex['IndexFinger1_L'], // 208
  leftIndexIntermediate: nodeNameToIndex['IndexFinger2_L'], // 207
  leftIndexDistal: nodeNameToIndex['IndexFinger3_L'], // 206
  leftMiddleProximal: nodeNameToIndex['MiddleFinger1_L'], // 211
  leftMiddleIntermediate: nodeNameToIndex['MiddleFinger2_L'], // 210
  leftMiddleDistal: nodeNameToIndex['MiddleFinger3_L'], // 209
  leftRingProximal: nodeNameToIndex['RingFinger1_L'], // 217
  leftRingIntermediate: nodeNameToIndex['RingFinger2_L'], // 216
  leftRingDistal: nodeNameToIndex['RingFinger3_L'], // 215
  leftLittleProximal: nodeNameToIndex['LittleFinger1_L'], // 214
  leftLittleIntermediate: nodeNameToIndex['LittleFinger2_L'], // 213
  leftLittleDistal: nodeNameToIndex['LittleFinger3_L'], // 212

  // Right Hand Fingers
  rightThumbMetacarpal: nodeNameToIndex['Thumb0_R'], // 262
  rightThumbProximal: nodeNameToIndex['Thumb1_R'], // 261
  rightThumbDistal: nodeNameToIndex['Thumb2_R'], // 260
  rightIndexProximal: nodeNameToIndex['IndexFinger1_R'], // 250
  rightIndexIntermediate: nodeNameToIndex['IndexFinger2_R'], // 249
  rightIndexDistal: nodeNameToIndex['IndexFinger3_R'], // 248
  rightMiddleProximal: nodeNameToIndex['MiddleFinger1_R'], // 253
  rightMiddleIntermediate: nodeNameToIndex['MiddleFinger2_R'], // 252
  rightMiddleDistal: nodeNameToIndex['MiddleFinger3_R'], // 251
  rightRingProximal: nodeNameToIndex['RingFinger1_R'], // 259
  rightRingIntermediate: nodeNameToIndex['RingFinger2_R'], // 258
  rightRingDistal: nodeNameToIndex['RingFinger3_R'], // 257
  rightLittleProximal: nodeNameToIndex['LittleFinger1_R'], // 256
  rightLittleIntermediate: nodeNameToIndex['LittleFinger2_R'], // 255
  rightLittleDistal: nodeNameToIndex['LittleFinger3_R'], // 254
}

// 3. Compute Scene Graph Hierarchy & World Matrices
const parentMap = {}
newGltf.nodes.forEach((n, i) => {
  if (n.children) {
    n.children.forEach(c => { parentMap[c] = i })
  }
})

function getWorldMatrix(nodeIdx, currentGltf = newGltf) {
  const n = currentGltf.nodes[nodeIdx]
  const m = new THREE.Matrix4()
  const pos = n.translation ? new THREE.Vector3(...n.translation) : new THREE.Vector3()
  const rot = n.rotation ? new THREE.Quaternion(...n.rotation) : new THREE.Quaternion()
  const scale = n.scale ? new THREE.Vector3(...n.scale) : new THREE.Vector3(1, 1, 1)
  m.compose(pos, rot, scale)
  if (parentMap[nodeIdx] !== undefined) {
    m.premultiply(getWorldMatrix(parentMap[nodeIdx], currentGltf))
  }
  return m
}

// Find all descendants of a node
function getDescendants(rootIdx) {
  const set = new Set([rootIdx])
  function traverse(idx) {
    const n = newGltf.nodes[idx]
    if (n.children) {
      for (const c of n.children) {
        set.add(c)
        traverse(c)
      }
    }
  }
  traverse(rootIdx)
  return set
}

const leftArmNode = humanoidBoneMap.leftUpperArm
const rightArmNode = humanoidBoneMap.rightUpperArm
const leftElbowNode = humanoidBoneMap.leftLowerArm
const rightElbowNode = humanoidBoneMap.rightLowerArm

const leftArmNodes = getDescendants(leftArmNode)
const rightArmNodes = getDescendants(rightArmNode)

console.log(`Left arm tree contains ${leftArmNodes.size} nodes`)
console.log(`Right arm tree contains ${rightArmNodes.size} nodes`)

// Get world positions and calculate lift rotations
const leftArmWorldPos = new THREE.Vector3()
const leftArmWorldRot = new THREE.Quaternion()
getWorldMatrix(leftArmNode).decompose(leftArmWorldPos, leftArmWorldRot, new THREE.Vector3())

const leftElbowWorldPos = new THREE.Vector3()
getWorldMatrix(leftElbowNode).decompose(leftElbowWorldPos, new THREE.Quaternion(), new THREE.Vector3())

const rightArmWorldPos = new THREE.Vector3()
const rightArmWorldRot = new THREE.Quaternion()
getWorldMatrix(rightArmNode).decompose(rightArmWorldPos, rightArmWorldRot, new THREE.Vector3())

const rightElbowWorldPos = new THREE.Vector3()
getWorldMatrix(rightElbowNode).decompose(rightElbowWorldPos, new THREE.Quaternion(), new THREE.Vector3())

// Unit vectors along the original arms
const uLeftArm = leftElbowWorldPos.clone().sub(leftArmWorldPos).normalize()
const uRightArm = rightElbowWorldPos.clone().sub(rightArmWorldPos).normalize()

// Canonical VRM T-pose target directions (+X for Left, -X for Right)
const qLiftL = new THREE.Quaternion().setFromUnitVectors(uLeftArm, new THREE.Vector3(1, 0, 0))
const qLiftR = new THREE.Quaternion().setFromUnitVectors(uRightArm, new THREE.Vector3(-1, 0, 0))

console.log('qLiftL Euler:', new THREE.Euler().setFromQuaternion(qLiftL, 'XYZ').toArray().slice(0, 3).map(v => (v * 180 / Math.PI).toFixed(2) + '°'))
console.log('qLiftR Euler:', new THREE.Euler().setFromQuaternion(qLiftR, 'XYZ').toArray().slice(0, 3).map(v => (v * 180 / Math.PI).toFixed(2) + '°'))

// Affine transform matrices around the arm shoulder joints
const T_lift_L = new THREE.Matrix4().makeTranslation(leftArmWorldPos.x, leftArmWorldPos.y, leftArmWorldPos.z)
  .multiply(new THREE.Matrix4().makeRotationFromQuaternion(qLiftL))
  .multiply(new THREE.Matrix4().makeTranslation(-leftArmWorldPos.x, -leftArmWorldPos.y, -leftArmWorldPos.z))
const T_inv_L = T_lift_L.clone().invert()

const T_lift_R = new THREE.Matrix4().makeTranslation(rightArmWorldPos.x, rightArmWorldPos.y, rightArmWorldPos.z)
  .multiply(new THREE.Matrix4().makeRotationFromQuaternion(qLiftR))
  .multiply(new THREE.Matrix4().makeTranslation(-rightArmWorldPos.x, -rightArmWorldPos.y, -rightArmWorldPos.z))
const T_inv_R = T_lift_R.clone().invert()

// 4. Map skin joints to Left/Right arm sets
const skin = newGltf.skins[0]
const leftArmJointSet = new Set()
const rightArmJointSet = new Set()

skin.joints.forEach((nIdx, jIdx) => {
  if (leftArmNodes.has(nIdx)) leftArmJointSet.add(jIdx)
  if (rightArmNodes.has(nIdx)) rightArmJointSet.add(jIdx)
})

console.log(`Skin joints in left arm: ${leftArmJointSet.size}, in right arm: ${rightArmJointSet.size}`)

// Twist bone remapping map
const JOINT_REMAP = {
  210: 209, // zArmTwist_L (204) -> Left_arm (242)
  212: 211, // zHandTwist_L (205) -> Left_elbow (233)
  252: 251, // zArmTwist_R (246) -> Right_arm (274)
  254: 253, // zHandTwist_R (247) -> Right_elbow (264)
}

// Helper to access binary buffer slices
function getAccessorData(accIdx) {
  const acc = newGltf.accessors[accIdx]
  const bv = newGltf.bufferViews[acc.bufferView]
  const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0)
  if (acc.componentType === 5126) {
    return new Float32Array(binBuffer, byteOffset, acc.count * (acc.type === 'VEC4' ? 4 : (acc.type === 'VEC3' ? 3 : 2)))
  } else if (acc.componentType === 5123) {
    return new Uint16Array(binBuffer, byteOffset, acc.count * (acc.type === 'VEC4' ? 4 : 1))
  } else if (acc.componentType === 5121) {
    return new Uint8Array(binBuffer, byteOffset, acc.count * (acc.type === 'VEC4' ? 4 : 1))
  }
  throw new Error(`Unsupported componentType ${acc.componentType}`)
}

// 5. Transform vertex positions & normals on skinned meshes (CPU Skin Baking)
let totalTransformedVertices = 0

newGltf.meshes.forEach((mesh, mIdx) => {
  mesh.primitives.forEach((prim, pIdx) => {
    if (prim.attributes.JOINTS_0 === undefined || prim.attributes.POSITION === undefined) return

    const posAcc = newGltf.accessors[prim.attributes.POSITION]
    const normAcc = prim.attributes.NORMAL !== undefined ? newGltf.accessors[prim.attributes.NORMAL] : null

    const positions = getAccessorData(prim.attributes.POSITION)
    const normals = normAcc ? getAccessorData(prim.attributes.NORMAL) : null
    const joints = getAccessorData(prim.attributes.JOINTS_0)
    const weights = getAccessorData(prim.attributes.WEIGHTS_0)

    const vertexCount = posAcc.count
    let meshTransformed = 0

    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    for (let vIdx = 0; vIdx < vertexCount; vIdx++) {
      let wLeft = 0
      let wRight = 0
      let wOther = 0

      for (let k = 0; k < 4; k++) {
        const j = joints[vIdx * 4 + k]
        const w = weights[vIdx * 4 + k]
        if (w <= 0.00001) continue
        if (leftArmJointSet.has(j)) {
          wLeft += w
        } else if (rightArmJointSet.has(j)) {
          wRight += w
        } else {
          wOther += w
        }
      }

      const wTotal = wLeft + wRight + wOther
      if (wTotal > 0.00001) {
        wLeft /= wTotal
        wRight /= wTotal
        wOther /= wTotal
      }

      if (wLeft > 0.00001 || wRight > 0.00001) {
        meshTransformed++
        const px = positions[vIdx * 3]
        const py = positions[vIdx * 3 + 1]
        const pz = positions[vIdx * 3 + 2]
        const origPos = new THREE.Vector3(px, py, pz)

        const pLeft = origPos.clone().sub(leftArmWorldPos).applyQuaternion(qLiftL).add(leftArmWorldPos)
        const pRight = origPos.clone().sub(rightArmWorldPos).applyQuaternion(qLiftR).add(rightArmWorldPos)

        const newPos = new THREE.Vector3()
          .addScaledVector(pLeft, wLeft)
          .addScaledVector(pRight, wRight)
          .addScaledVector(origPos, wOther)

        positions[vIdx * 3] = newPos.x
        positions[vIdx * 3 + 1] = newPos.y
        positions[vIdx * 3 + 2] = newPos.z

        if (normals) {
          const nx = normals[vIdx * 3]
          const ny = normals[vIdx * 3 + 1]
          const nz = normals[vIdx * 3 + 2]
          const origNorm = new THREE.Vector3(nx, ny, nz)

          const nLeft = origNorm.clone().applyQuaternion(qLiftL)
          const nRight = origNorm.clone().applyQuaternion(qLiftR)

          const newNorm = new THREE.Vector3()
            .addScaledVector(nLeft, wLeft)
            .addScaledVector(nRight, wRight)
            .addScaledVector(origNorm, wOther)
            .normalize()

          normals[vIdx * 3] = newNorm.x
          normals[vIdx * 3 + 1] = newNorm.y
          normals[vIdx * 3 + 2] = newNorm.z
        }
      }

      // Remap twist bones and merge duplicate joints
      const jwMap = new Map()
      for (let k = 0; k < 4; k++) {
        let j = joints[vIdx * 4 + k]
        const w = weights[vIdx * 4 + k]
        if (w <= 0.00001) continue
        if (JOINT_REMAP[j] !== undefined) {
          j = JOINT_REMAP[j]
        }
        jwMap.set(j, (jwMap.get(j) || 0) + w)
      }
      const sorted = Array.from(jwMap.entries()).sort((a, b) => b[1] - a[1])
      let sW = 0
      for (let k = 0; k < Math.min(4, sorted.length); k++) sW += sorted[k][1]
      for (let k = 0; k < 4; k++) {
        if (k < sorted.length) {
          joints[vIdx * 4 + k] = sorted[k][0]
          weights[vIdx * 4 + k] = sW > 0 ? (sorted[k][1] / sW) : 0
        } else {
          joints[vIdx * 4 + k] = 0
          weights[vIdx * 4 + k] = 0
        }
      }

      // Track min/max
      const cx = positions[vIdx * 3]
      const cy = positions[vIdx * 3 + 1]
      const cz = positions[vIdx * 3 + 2]
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy
      if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz
    }

    posAcc.min = [minX, minY, minZ]
    posAcc.max = [maxX, maxY, maxZ]

    totalTransformedVertices += meshTransformed
    console.log(`Mesh ${mIdx} (${mesh.name}): transformed ${meshTransformed} / ${vertexCount} vertices to T-pose`)
  })
})
console.log(`Total baked vertices: ${totalTransformedVertices}`)

// 6. Update Skin Inverse Bind Matrices
const ibmAcc = newGltf.accessors[skin.inverseBindMatrices]
const ibmBv = newGltf.bufferViews[ibmAcc.bufferView]
const ibmOffset = (ibmBv.byteOffset || 0) + (ibmAcc.byteOffset || 0)
const ibmArray = new Float32Array(binBuffer, ibmOffset, ibmAcc.count * 16)

let updatedIbmCount = 0
for (let jIdx = 0; jIdx < skin.joints.length; jIdx++) {
  if (leftArmJointSet.has(jIdx)) {
    const origMat = new THREE.Matrix4().fromArray(ibmArray, jIdx * 16)
    const newMat = origMat.clone().multiply(T_inv_L)
    ibmArray.set(newMat.elements, jIdx * 16)
    updatedIbmCount++
  } else if (rightArmJointSet.has(jIdx)) {
    const origMat = new THREE.Matrix4().fromArray(ibmArray, jIdx * 16)
    const newMat = origMat.clone().multiply(T_inv_R)
    ibmArray.set(newMat.elements, jIdx * 16)
    updatedIbmCount++
  }
}
console.log(`Updated ${updatedIbmCount} inverse bind matrices for arm chains`)

// 7. Update Arm Bone Rotations in Scene Graph Nodes
// Left Arm
const leftShoulderNode = humanoidBoneMap.leftShoulder
const mLeftShoulderWorld = getWorldMatrix(leftShoulderNode)
const mLeftArmWorld = getWorldMatrix(leftArmNode)
const mLeftArmWorldNew = T_lift_L.clone().multiply(mLeftArmWorld)
const mLeftArmLocalNew = mLeftShoulderWorld.clone().invert().multiply(mLeftArmWorldNew)

const newLeftArmPos = new THREE.Vector3()
const newLeftArmRot = new THREE.Quaternion()
const newLeftArmScl = new THREE.Vector3()
mLeftArmLocalNew.decompose(newLeftArmPos, newLeftArmRot, newLeftArmScl)
newGltf.nodes[leftArmNode].rotation = [newLeftArmRot.x, newLeftArmRot.y, newLeftArmRot.z, newLeftArmRot.w]

// Right Arm
const rightShoulderNode = humanoidBoneMap.rightShoulder
const mRightShoulderWorld = getWorldMatrix(rightShoulderNode)
const mRightArmWorld = getWorldMatrix(rightArmNode)
const mRightArmWorldNew = T_lift_R.clone().multiply(mRightArmWorld)
const mRightArmLocalNew = mRightShoulderWorld.clone().invert().multiply(mRightArmWorldNew)

const newRightArmPos = new THREE.Vector3()
const newRightArmRot = new THREE.Quaternion()
const newRightArmScl = new THREE.Vector3()
mRightArmLocalNew.decompose(newRightArmPos, newRightArmRot, newRightArmScl)
newGltf.nodes[rightArmNode].rotation = [newRightArmRot.x, newRightArmRot.y, newRightArmRot.z, newRightArmRot.w]

console.log('Updated Left_arm local rotation:', newLeftArmRot)
console.log('Updated Right_arm local rotation:', newRightArmRot)

// 8. Map facial & emotion morph targets (Mesh 0: emotions, Mesh 2: head)
const emotionsMeshNode = newGltf.nodes.findIndex(n => n.name === 'emotions')
const headMeshNode = newGltf.nodes.findIndex(n => n.name === 'head')

const emotionsMesh = newGltf.meshes[newGltf.nodes[emotionsMeshNode].mesh]
const headMesh = newGltf.meshes[newGltf.nodes[headMeshNode].mesh]

const emotionsTargets = emotionsMesh.extras?.targetNames || []
const headTargets = headMesh.extras?.targetNames || []

console.log(`Found ${emotionsTargets.length} emotions targets and ${headTargets.length} head targets`)

const emotionNameToIdx = {}
emotionsTargets.forEach((name, idx) => { emotionNameToIdx[name] = idx })

const headNameToIdx = {}
headTargets.forEach((name, idx) => { headNameToIdx[name] = idx })

const PRESET_DEFINITIONS = {
  // Vowels (Lip-Sync)
  aa: { node: headMeshNode, index: headNameToIdx['あ'], weight: 1.0 },
  ih: { node: headMeshNode, index: headNameToIdx['い'], weight: 1.0 },
  ou: { node: headMeshNode, index: headNameToIdx['う'], weight: 1.0 },
  ee: { node: headMeshNode, index: headNameToIdx['え'], weight: 1.0 },
  oh: { node: headMeshNode, index: headNameToIdx['お'], weight: 1.0 },
  // Eye blinks
  blink: {
    binds: [
      { node: headMeshNode, index: headNameToIdx['まばたき'], weight: 1.0 },
      { node: headMeshNode, index: headNameToIdx['笑い'], weight: 0.8 },
    ]
  },
  blinkLeft: { node: headMeshNode, index: headNameToIdx['ウィンク'], weight: 1.0 },
  blinkRight: { node: headMeshNode, index: headNameToIdx['ウィンク右'], weight: 1.0 },
  // Core emotions
  happy: {
    binds: [
      { node: headMeshNode, index: headNameToIdx['喜び'], weight: 1.0 },
      { node: headMeshNode, index: headNameToIdx['にこり'], weight: 0.7 },
      { node: headMeshNode, index: headNameToIdx['笑い'], weight: 0.5 },
    ]
  },
  angry: {
    binds: [
      { node: headMeshNode, index: headNameToIdx['怒り'], weight: 1.0 },
      { node: headMeshNode, index: headNameToIdx['怒り目'], weight: 0.8 },
      { node: emotionsMeshNode, index: emotionNameToIdx['怒'], weight: 0.9 },
    ]
  },
  sad: {
    binds: [
      { node: headMeshNode, index: headNameToIdx['困る'], weight: 1.0 },
      { node: headMeshNode, index: headNameToIdx['悲しい'], weight: 0.8 },
      { node: emotionsMeshNode, index: emotionNameToIdx['涙'], weight: 0.6 },
    ]
  },
  relaxed: {
    binds: [
      { node: headMeshNode, index: headNameToIdx['なごみ'], weight: 1.0 },
      { node: headMeshNode, index: headNameToIdx['にこり'], weight: 0.6 },
    ]
  },
  surprised: {
    binds: [
      { node: headMeshNode, index: headNameToIdx['びっくり'], weight: 1.0 },
    ]
  },
  neutral: {
    binds: []
  }
}

const CUSTOM_DEFINITIONS = {
  blush: { node: emotionsMeshNode, index: emotionNameToIdx['照れ'], weight: 1.0 },
  tears: { node: emotionsMeshNode, index: emotionNameToIdx['涙'], weight: 1.0 },
  blush_lines: { node: emotionsMeshNode, index: emotionNameToIdx['////'], weight: 1.0 },
  sweat: { node: emotionsMeshNode, index: emotionNameToIdx['汗'], weight: 1.0 },
  anger_mark: { node: emotionsMeshNode, index: emotionNameToIdx['怒'], weight: 1.0 },
  dizzy: { node: emotionsMeshNode, index: emotionNameToIdx['ぐるぐる'], weight: 1.0 },
  star_eyes: { node: headMeshNode, index: headNameToIdx['星目'], weight: 1.0 },
  smirk: { node: headMeshNode, index: headNameToIdx['にやり'], weight: 1.0 },
  smile: { node: headMeshNode, index: headNameToIdx['にっこり'], weight: 1.0 },
  cat_mouth: { node: headMeshNode, index: headNameToIdx['ω'], weight: 1.0 },
  tongue: { node: headMeshNode, index: headNameToIdx['ぺろっ'], weight: 1.0 },
  tehepero: {
    binds: [
      { node: headMeshNode, index: headNameToIdx['ぺろっ'], weight: 1.0 },
      { node: headMeshNode, index: headNameToIdx['ウィンク'], weight: 0.9 },
      { node: emotionsMeshNode, index: emotionNameToIdx['照れ'], weight: 0.7 },
    ]
  },
  pupil_small: { node: headMeshNode, index: headNameToIdx['瞳小'], weight: 1.0 },
  pupil_big: { node: headMeshNode, index: headNameToIdx['瞳大'], weight: 1.0 },
  lifeless_eyes: { node: headMeshNode, index: headNameToIdx['光消'], weight: 1.0 },
  shocked: { node: headMeshNode, index: headNameToIdx['恐ろしい子！'], weight: 1.0 },
  hau: { node: emotionsMeshNode, index: emotionNameToIdx['はぅ'], weight: 1.0 },
  hachu_eyes: { node: emotionsMeshNode, index: emotionNameToIdx['はちゅ目'], weight: 1.0 },
  wink2: { node: headMeshNode, index: headNameToIdx['ウィンク２'], weight: 1.0 },
  wink2_right: { node: headMeshNode, index: headNameToIdx['ウィンク２右'], weight: 1.0 },
  laugh: { node: headMeshNode, index: headNameToIdx['笑い'], weight: 1.0 },
  mouth_close: { node: headMeshNode, index: headNameToIdx['ん'], weight: 1.0 },
  serious: { node: headMeshNode, index: headNameToIdx['真面目'], weight: 1.0 },
}

headTargets.forEach((name, idx) => {
  if (!CUSTOM_DEFINITIONS[name]) {
    CUSTOM_DEFINITIONS[name] = { node: headMeshNode, index: idx, weight: 1.0 }
  }
})
emotionsTargets.forEach((name, idx) => {
  if (!CUSTOM_DEFINITIONS[name]) {
    CUSTOM_DEFINITIONS[name] = { node: emotionsMeshNode, index: idx, weight: 1.0 }
  }
})

// 9. Build VRM 1.0 extension structure
function buildVRM1(boneMap) {
  const humanBones = {}
  for (const [boneName, nodeIdx] of Object.entries(boneMap)) {
    if (nodeIdx !== undefined) humanBones[boneName] = { node: nodeIdx }
  }

  const preset = {}
  for (const [name, def] of Object.entries(PRESET_DEFINITIONS)) {
    const morphTargetBinds = def.binds
      ? def.binds.filter(b => b.index !== undefined)
      : (def.index !== undefined ? [{ node: def.node, index: def.index, weight: def.weight || 1.0 }] : [])
    preset[name] = {
      morphTargetBinds,
      isBinary: false,
      overrideBlink: 'none',
      overrideLookAt: 'none',
      overrideMouth: 'none',
    }
  }

  const custom = {}
  for (const [name, def] of Object.entries(CUSTOM_DEFINITIONS)) {
    const morphTargetBinds = def.binds
      ? def.binds.filter(b => b.index !== undefined)
      : (def.index !== undefined ? [{ node: def.node, index: def.index, weight: def.weight || 1.0 }] : [])
    custom[name] = {
      morphTargetBinds,
      isBinary: false,
      overrideBlink: 'none',
      overrideLookAt: 'none',
      overrideMouth: 'none',
    }
  }

  return {
    specVersion: '1.0',
    meta: {
      name: 'Ani',
      version: '1.0',
      authors: ['Ani Creator'],
      licenseUrl: 'https://vrm.dev/licenses/1.0/',
      avatarPermission: 'everyone',
      allowExcessivelyViolentUsage: false,
      allowExcessivelySexualUsage: false,
      commercialUsage: 'personalNonProfit',
      allowPoliticalOrReligiousUsage: false,
      allowAntisocialOrHateUsage: false,
      creditNotation: 'required',
      allowRedistribution: false,
      modification: 'prohibited',
    },
    humanoid: { humanBones },
    firstPerson: {},
    lookAt: {
      offsetFromHeadBone: [0, 0.06, 0],
      type: 'bone',
      rangeMapHorizontalInner: { inputMaxValue: 90.0, outputScale: 10.0 },
      rangeMapHorizontalOuter: { inputMaxValue: 90.0, outputScale: 10.0 },
      rangeMapVerticalDown: { inputMaxValue: 90.0, outputScale: 10.0 },
      rangeMapVerticalUp: { inputMaxValue: 90.0, outputScale: 10.0 },
    },
    expressions: { preset, custom },
  }
}

// 10. Skeleton root & Scene Graph Restructuring (JustinBenito/gltf2vrm architecture)
const hipsNodeIndex = humanoidBoneMap.hips
let skeletonRootNodeIndex = hipsNodeIndex
while (parentMap[skeletonRootNodeIndex] !== undefined) {
  skeletonRootNodeIndex = parentMap[skeletonRootNodeIndex]
}
console.log(`Skeleton root node: ${skeletonRootNodeIndex} (${newGltf.nodes[skeletonRootNodeIndex].name})`)

if (newGltf.skins) {
  newGltf.skins.forEach(s => {
    s.skeleton = skeletonRootNodeIndex
  })
}

const childNodes = new Set()
newGltf.nodes.forEach(node => {
  if (node.children) node.children.forEach(c => childNodes.add(c))
})
const newSceneNodes = newGltf.nodes.map((_, i) => i).filter(i => !childNodes.has(i))
const sceneIndex = newGltf.scene || 0
newGltf.scenes[sceneIndex].nodes = newSceneNodes

// 11. Add VRMC_vrm extension
if (!newGltf.extensions) newGltf.extensions = {}
if (!newGltf.extensionsUsed) newGltf.extensionsUsed = []

const vrm1Ext = buildVRM1(humanoidBoneMap)
newGltf.extensions.VRMC_vrm = vrm1Ext
if (!newGltf.extensionsUsed.includes('VRMC_vrm')) newGltf.extensionsUsed.push('VRMC_vrm')

console.log('Built VRMC_vrm extension with', Object.keys(vrm1Ext.humanoid.humanBones).length, 'bones')
console.log('Presets:', Object.keys(vrm1Ext.expressions.preset).length, 'Customs:', Object.keys(vrm1Ext.expressions.custom).length)

// 12. Pack GLB
function packGlb(json, buffer) {
  const jsonString = JSON.stringify(json, (key, value) => (value === undefined || value === null) ? undefined : value)
  const jsonChunkData = new TextEncoder().encode(jsonString)
  const paddedJsonLength = Math.ceil(jsonChunkData.length / 4) * 4
  const jsonPadding = paddedJsonLength - jsonChunkData.length
  const jsonChunk = new Uint8Array(paddedJsonLength)
  jsonChunk.set(jsonChunkData)
  for (let i = 0; i < jsonPadding; i++) jsonChunk[jsonChunkData.length + i] = 0x20

  const hasBuffer = buffer && buffer.byteLength > 0
  let paddedBinLength = 0
  let binChunk = null
  if (hasBuffer) {
    const binPadding = (4 - (buffer.byteLength % 4)) % 4
    paddedBinLength = buffer.byteLength + binPadding
    binChunk = new Uint8Array(paddedBinLength)
    binChunk.set(new Uint8Array(buffer))
  }

  const totalLength = 12 + (8 + paddedJsonLength) + (hasBuffer ? (8 + paddedBinLength) : 0)
  const outputBuffer = new ArrayBuffer(totalLength)
  const dataView = new DataView(outputBuffer)
  let offset = 0

  dataView.setUint32(offset, 0x46546c67, true); offset += 4 // magic
  dataView.setUint32(offset, 2, true); offset += 4 // version
  dataView.setUint32(offset, totalLength, true); offset += 4 // length

  dataView.setUint32(offset, paddedJsonLength, true); offset += 4
  dataView.setUint32(offset, 0x4e4f534a, true); offset += 4 // 'JSON'
  new Uint8Array(outputBuffer, offset).set(jsonChunk)
  offset += paddedJsonLength

  if (hasBuffer) {
    dataView.setUint32(offset, paddedBinLength, true); offset += 4
    dataView.setUint32(offset, 0x004e4942, true); offset += 4 // 'BIN'
    new Uint8Array(outputBuffer, offset).set(binChunk)
  }

  return Buffer.from(outputBuffer)
}

const vrmBuffer = packGlb(newGltf, binBuffer)
fs.writeFileSync(OUTPUT_VRM_PATH, vrmBuffer)
fs.writeFileSync(DOWNLOADS_VRM_PATH, vrmBuffer)
console.log(`Saved T-Posed VRM (${(vrmBuffer.length / (1024 * 1024)).toFixed(2)} MB) to:`)
console.log(`  -> ${OUTPUT_VRM_PATH}`)
console.log(`  -> ${DOWNLOADS_VRM_PATH}`)
