import fs from 'node:fs';
import path from 'node:path';

const STUDENT_PATH = '/home/xasanboy/Downloads/student.vrm';
const ANI_PATH = '/home/xasanboy/VRM_1/public/models/Ani.vrm';
const TEXTURE_PATH = '/home/xasanboy/VRM_1/scratch_emotions_texture.png';
const OUTPUT_PATH = '/home/xasanboy/VRM_1/public/models/student.vrm';

console.log('--- Injecting Emotion Visual Effects into student.vrm ---');

// 1. Read GLBs
function parseGLB(filePath) {
  const buf = fs.readFileSync(filePath);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`Not GLB: ${filePath}`);
  const jsonChunkLen = dv.getUint32(12, true);
  const jsonBytes = new Uint8Array(buf.buffer, buf.byteOffset + 20, jsonChunkLen);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));
  const binOffset = 20 + jsonChunkLen;
  const binLen = dv.getUint32(binOffset, true);
  const binBuf = buf.buffer.slice(buf.byteOffset + binOffset + 8, buf.byteOffset + binOffset + 8 + binLen);
  return { json, binBuf, binBuffer: Buffer.from(binBuf) };
}

const student = parseGLB(STUDENT_PATH);
const ani = parseGLB(ANI_PATH);
const textureData = fs.readFileSync(TEXTURE_PATH);

// 2. Extract accessor from Ani
function getAniAccessorData(accIdx) {
  const acc = ani.json.accessors[accIdx];
  const typeMap = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const countMap = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const numComponents = countMap[acc.type];
  const TypedArray = typeMap[acc.componentType];
  const out = new Float32Array(acc.count * numComponents);
  if (acc.bufferView !== undefined) {
    const bv = ani.json.bufferViews[acc.bufferView];
    const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const src = new TypedArray(ani.binBuf, offset, acc.count * numComponents);
    out.set(src);
  }
  if (acc.sparse) {
    const sp = acc.sparse;
    const idxBv = ani.json.bufferViews[sp.indices.bufferView];
    const valBv = ani.json.bufferViews[sp.values.bufferView];
    const IdxTypedArray = typeMap[sp.indices.componentType];
    const indices = new IdxTypedArray(ani.binBuf, (idxBv.byteOffset || 0) + (sp.indices.byteOffset || 0), sp.count);
    const ValTypedArray = typeMap[acc.componentType];
    const values = new ValTypedArray(ani.binBuf, (valBv.byteOffset || 0) + (sp.values.byteOffset || 0), sp.count * numComponents);
    for (let i = 0; i < sp.count; i++) {
      const targetIdx = indices[i];
      for (let c = 0; c < numComponents; c++) {
        out[targetIdx * numComponents + c] = values[i * numComponents + c];
      }
    }
  }
  return out;
}

const aniPrim = ani.json.meshes[0].primitives[0];
const aniBasePos = getAniAccessorData(aniPrim.attributes.POSITION);
const aniBaseNorm = getAniAccessorData(aniPrim.attributes.NORMAL);
const aniUv = getAniAccessorData(aniPrim.attributes.TEXCOORD_0);

// Get index buffer
const aniIndicesAcc = ani.json.accessors[aniPrim.indices];
const aniIndicesBv = ani.json.bufferViews[aniIndicesAcc.bufferView];
const aniIndices = new Uint16Array(
  ani.binBuf,
  (aniIndicesBv.byteOffset || 0) + (aniIndicesAcc.byteOffset || 0),
  aniIndicesAcc.count
);

const numVerts = aniBasePos.length / 3;
console.log(`Extracted Ani mesh: ${numVerts} vertices, ${aniIndices.length} index elements`);

// Extract all 8 target deltas
const aniPosDeltas = aniPrim.targets.map(t => getAniAccessorData(t.POSITION));
const aniNormDeltas = aniPrim.targets.map(t => getAniAccessorData(t.NORMAL));

// 3. Transform to Student Face Coordinates
function transformActive(ax, ay, az, targetIdx) {
  // Rotate 180 around Y so character-left (+X in Ani) maps to character-left (-X in student)
  const sx = -ax;
  // Center eye Y in Ani is 1.5869, in Student is 1.4443
  const sy = (ay - 1.5869) + 1.4443;
  let sz;
  if (targetIdx === 0) {
    // Blush (cheeks): cheek front is at Z ~ -0.070 to -0.074. Set to -0.075 to float right on cheek skin
    sz = -0.0745 - (az - 0.0344) * 0.4;
  } else if (targetIdx === 1) {
    // Tears (under eyes): under-eye skin is at Z ~ -0.067 to -0.070. Set to -0.072
    sz = -0.072 - (az - 0.0307) * 0.4;
  } else if (targetIdx === 2) {
    // Blush lines (////)
    sz = -0.075 - (az - 0.0525) * 0.4;
  } else if (targetIdx === 3) {
    // Sweat (汗)
    sz = -0.075;
  } else if (targetIdx === 4) {
    // Anger (怒)
    sz = -0.075;
  } else if (targetIdx === 5) {
    // Dizzy (spiral eyes): cornea is at -0.064 to -0.068, lashes at -0.075. Set to -0.082
    sz = -0.082 - (az - 0.0456) * 0.3;
  } else {
    // Hau / Hachu eyes
    sz = -0.082 - (az - 0.044) * 0.3;
  }
  return [sx, sy, sz];
}

// Build rest positions (inside the head)
const newRestPos = new Float32Array(numVerts * 3);
const newRestNorm = new Float32Array(numVerts * 3);
for (let i = 0; i < numVerts; i++) {
  const bx = aniBasePos[i * 3];
  const by = aniBasePos[i * 3 + 1];
  newRestPos[i * 3] = -bx;
  newRestPos[i * 3 + 1] = (by - 1.5869) + 1.4443;
  newRestPos[i * 3 + 2] = 0.00; // Deep inside the skull (Z=0.00)

  // Outward normal facing forward in student space (-Z)
  newRestNorm[i * 3] = -aniBaseNorm[i * 3];
  newRestNorm[i * 3 + 1] = aniBaseNorm[i * 3 + 1];
  newRestNorm[i * 3 + 2] = -aniBaseNorm[i * 3 + 2];
}

const tearPositions = {
  // Left tear (character left, X < 0)
  267: [-0.028, 1.395, -0.0792],
  268: [-0.028, 1.425, -0.0765],
  269: [-0.028, 1.425, -0.0765],
  270: [-0.052, 1.398, -0.0780],
  271: [-0.052, 1.398, -0.0780],
  272: [-0.052, 1.428, -0.0755],
  // Right tear (character right, X > 0)
  273: [0.028, 1.395, -0.0792],
  274: [0.028, 1.395, -0.0792],
  275: [0.028, 1.425, -0.0765],
  276: [0.052, 1.398, -0.0780],
  277: [0.052, 1.428, -0.0755],
  278: [0.052, 1.428, -0.0755]
};

// Compute new target deltas
const newPosDeltas = [];
const newNormDeltas = [];
for (let t = 0; t < 8; t++) {
  const pDelta = new Float32Array(numVerts * 3);
  const nDelta = new Float32Array(numVerts * 3);
  const origPd = aniPosDeltas[t];
  const origNd = aniNormDeltas[t];

  for (let i = 0; i < numVerts; i++) {
    if (t === 1 && tearPositions[i]) {
      const [sx, sy, sz] = tearPositions[i];
      pDelta[i * 3] = sx - newRestPos[i * 3];
      pDelta[i * 3 + 1] = sy - newRestPos[i * 3 + 1];
      pDelta[i * 3 + 2] = sz - newRestPos[i * 3 + 2];

      nDelta[i * 3] = 0 - newRestNorm[i * 3];
      nDelta[i * 3 + 1] = 0 - newRestNorm[i * 3 + 1];
      nDelta[i * 3 + 2] = -1 - newRestNorm[i * 3 + 2];
    } else {
      const dx = origPd[i * 3];
      const dy = origPd[i * 3 + 1];
      const dz = origPd[i * 3 + 2];
      // For eye-based targets (5: dizzy, 6: hau, 7: hachu), internal anchor vertices in Ani have dz <= 0.01.
      // Only vertices that actually project outward (dz > 0.01) should move to the face surface.
      const movesToFace = (t < 5)
        ? (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4 || Math.abs(dz) > 1e-4)
        : (dz > 0.01);
      if (movesToFace) {
        const ax = aniBasePos[i * 3] + dx;
        const ay = aniBasePos[i * 3 + 1] + dy;
        const az = aniBasePos[i * 3 + 2] + dz;
        const [sx, sy, sz] = transformActive(ax, ay, az, t);
        pDelta[i * 3] = sx - newRestPos[i * 3];
        pDelta[i * 3 + 1] = sy - newRestPos[i * 3 + 1];
        pDelta[i * 3 + 2] = sz - newRestPos[i * 3 + 2];

        const nx = aniBaseNorm[i * 3] + origNd[i * 3];
        const ny = aniBaseNorm[i * 3 + 1] + origNd[i * 3 + 1];
        const nz = aniBaseNorm[i * 3 + 2] + origNd[i * 3 + 2];
        nDelta[i * 3] = -nx - newRestNorm[i * 3];
        nDelta[i * 3 + 1] = ny - newRestNorm[i * 3 + 1];
        nDelta[i * 3 + 2] = -nz - newRestNorm[i * 3 + 2];
      }
    }
  }
  newPosDeltas.push(pDelta);
  newNormDeltas.push(nDelta);
}

// Joints & Weights: bound 100% to joint 34 (J_Bip_C_Head in student skin 0)
const newJoints = new Uint16Array(numVerts * 4);
const newWeights = new Float32Array(numVerts * 4);
for (let i = 0; i < numVerts; i++) {
  newJoints[i * 4] = 34;
  newJoints[i * 4 + 1] = 0;
  newJoints[i * 4 + 2] = 0;
  newJoints[i * 4 + 3] = 0;

  newWeights[i * 4] = 1.0;
  newWeights[i * 4 + 1] = 0.0;
  newWeights[i * 4 + 2] = 0.0;
  newWeights[i * 4 + 3] = 0.0;
}

// 4. Binary Buffer Appending
let newBinChunks = [student.binBuffer];
let currentBinLength = student.binBuffer.length;

function appendBuffer(rawBuffer) {
  // Ensure 4-byte alignment
  const pad = (4 - (currentBinLength % 4)) % 4;
  if (pad > 0) {
    const padBuf = Buffer.alloc(pad, 0);
    newBinChunks.push(padBuf);
    currentBinLength += pad;
  }
  const offset = currentBinLength;
  const buf = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);
  newBinChunks.push(buf);
  currentBinLength += buf.length;
  return { byteOffset: offset, byteLength: buf.length };
}

// Add bufferViews and accessors to student JSON
const sJson = student.json;
if (!sJson.bufferViews) sJson.bufferViews = [];
if (!sJson.accessors) sJson.accessors = [];

function addBufferViewAndAccessor({ data, type, componentType, count, min, max, target }) {
  const { byteOffset, byteLength } = appendBuffer(data);
  const bvIdx = sJson.bufferViews.length;
  const bv = {
    buffer: 0,
    byteOffset,
    byteLength
  };
  if (target) bv.target = target;
  sJson.bufferViews.push(bv);

  const accIdx = sJson.accessors.length;
  const acc = {
    bufferView: bvIdx,
    byteOffset: 0,
    componentType,
    count,
    type
  };
  if (min) acc.min = min;
  if (max) acc.max = max;
  sJson.accessors.push(acc);
  return accIdx;
}

function getMinMax(arr, numComp) {
  const min = new Array(numComp).fill(Infinity);
  const max = new Array(numComp).fill(-Infinity);
  for (let i = 0; i < arr.length; i += numComp) {
    for (let c = 0; c < numComp; c++) {
      min[c] = Math.min(min[c], arr[i + c]);
      max[c] = Math.max(max[c], arr[i + c]);
    }
  }
  return { min, max };
}

// Add attributes:
// POSITION (ARRAY_BUFFER = 34962)
const posMinMax = getMinMax(newRestPos, 3);
const posAcc = addBufferViewAndAccessor({
  data: newRestPos,
  type: 'VEC3',
  componentType: 5126,
  count: numVerts,
  min: posMinMax.min,
  max: posMinMax.max,
  target: 34962
});

// NORMAL
const normAcc = addBufferViewAndAccessor({
  data: newRestNorm,
  type: 'VEC3',
  componentType: 5126,
  count: numVerts,
  target: 34962
});

// TEXCOORD_0
const uvAcc = addBufferViewAndAccessor({
  data: aniUv,
  type: 'VEC2',
  componentType: 5126,
  count: numVerts,
  target: 34962
});

// JOINTS_0
const jointsAcc = addBufferViewAndAccessor({
  data: newJoints,
  type: 'VEC4',
  componentType: 5123,
  count: numVerts,
  target: 34962
});

// WEIGHTS_0
const weightsAcc = addBufferViewAndAccessor({
  data: newWeights,
  type: 'VEC4',
  componentType: 5126,
  count: numVerts,
  target: 34962
});

// INDICES (ELEMENT_ARRAY_BUFFER = 34963)
const indicesAcc = addBufferViewAndAccessor({
  data: aniIndices,
  type: 'SCALAR',
  componentType: 5123,
  count: aniIndices.length,
  target: 34963
});

// Targets
const targetAccs = [];
for (let t = 0; t < 8; t++) {
  const pDelta = newPosDeltas[t];
  const pMinMax = getMinMax(pDelta, 3);
  const pAcc = addBufferViewAndAccessor({
    data: pDelta,
    type: 'VEC3',
    componentType: 5126,
    count: numVerts,
    min: pMinMax.min,
    max: pMinMax.max
  });

  const nDelta = newNormDeltas[t];
  const nAcc = addBufferViewAndAccessor({
    data: nDelta,
    type: 'VEC3',
    componentType: 5126,
    count: numVerts
  });

  targetAccs.push({ POSITION: pAcc, NORMAL: nAcc });
}

// Image bufferView
const imgBv = appendBuffer(textureData);
const imgBvIdx = sJson.bufferViews.length;
sJson.bufferViews.push({
  buffer: 0,
  byteOffset: imgBv.byteOffset,
  byteLength: imgBv.byteLength
});

// Add image, sampler, texture, material
if (!sJson.images) sJson.images = [];
const imgIdx = sJson.images.length;
sJson.images.push({
  bufferView: imgBvIdx,
  mimeType: 'image/png',
  name: 'emotions_texture'
});

if (!sJson.samplers) sJson.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
const samplerIdx = 0;

if (!sJson.textures) sJson.textures = [];
const texIdx = sJson.textures.length;
sJson.textures.push({
  sampler: samplerIdx,
  source: imgIdx
});

if (!sJson.materials) sJson.materials = [];
const matIdx = sJson.materials.length;
sJson.materials.push({
  name: 'Emotions2',
  alphaMode: 'BLEND',
  doubleSided: true,
  pbrMetallicRoughness: {
    baseColorTexture: { index: texIdx },
    metallicFactor: 0.0,
    roughnessFactor: 0.5
  }
});

// Create Mesh
if (!sJson.meshes) sJson.meshes = [];
const newMeshIdx = sJson.meshes.length;
sJson.meshes.push({
  name: 'Grok - Ms.Ani.042',
  extras: {
    targetNames: [
      '照れ', '涙', '////', '汗', '怒', 'ぐるぐる', 'はぅ', 'はちゅ目'
    ]
  },
  primitives: [
    {
      attributes: {
        POSITION: posAcc,
        NORMAL: normAcc,
        TEXCOORD_0: uvAcc,
        JOINTS_0: jointsAcc,
        WEIGHTS_0: weightsAcc
      },
      indices: indicesAcc,
      material: matIdx,
      targets: targetAccs
    }
  ]
});

// Create Node
if (!sJson.nodes) sJson.nodes = [];
const newNodeIdx = sJson.nodes.length;
sJson.nodes.push({
  name: 'emotions',
  mesh: newMeshIdx,
  skin: 0
});

// Add to scene 0
if (!sJson.scenes) sJson.scenes = [{ nodes: [] }];
if (!sJson.scenes[0].nodes) sJson.scenes[0].nodes = [];
sJson.scenes[0].nodes.push(newNodeIdx);

// Register BlendShapeGroups in VRM 0.0
const bsm = sJson.extensions?.VRM?.blendShapeMaster;
if (!bsm) throw new Error('No extensions.VRM.blendShapeMaster found in student.vrm');
if (!bsm.blendShapeGroups) bsm.blendShapeGroups = [];

const emotionGroups = [
  // Blush
  { name: 'blush', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 0, weight: 100 }] },
  { name: '照れ', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 0, weight: 100 }] },
  // Tears / Crying
  { name: 'tears', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 1, weight: 100 }] },
  { name: '涙', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 1, weight: 100 }] },
  { name: 'crying', presetName: 'unknown', binds: [
    { mesh: newMeshIdx, index: 1, weight: 100 },
    { mesh: 0, index: 4, weight: 70 }
  ] },
  // Blush lines
  { name: 'blush_lines', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 2, weight: 100 }] },
  { name: '////', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 2, weight: 100 }] },
  // Sweat
  { name: 'sweat', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 3, weight: 100 }] },
  { name: '汗', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 3, weight: 100 }] },
  // Anger mark
  { name: 'anger_mark', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 4, weight: 100 }] },
  { name: '怒', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 4, weight: 100 }] },
  // Dizzy
  { name: 'dizzy', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 5, weight: 100 }] },
  { name: 'ぐるぐる', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 5, weight: 100 }] },
  // Hau
  { name: 'hau', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 6, weight: 100 }] },
  { name: 'はぅ', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 6, weight: 100 }] },
  // Hachu eyes
  { name: 'hachu_eyes', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 7, weight: 100 }] },
  { name: 'はちゅ目', presetName: 'unknown', binds: [{ mesh: newMeshIdx, index: 7, weight: 100 }] }
];

// If group already exists, append bind; otherwise add group
for (const eg of emotionGroups) {
  const existing = bsm.blendShapeGroups.find(g => g.name === eg.name || (eg.presetName !== 'unknown' && g.presetName === eg.presetName));
  if (existing) {
    if (!existing.binds) existing.binds = [];
    existing.binds.push(...eg.binds);
  } else {
    bsm.blendShapeGroups.push(eg);
  }
}

console.log(`Updated blendShapeGroups, total: ${bsm.blendShapeGroups.length}`);

// 5. Pack final GLB
const jsonString = JSON.stringify(sJson);
const jsonBuffer = Buffer.from(jsonString, 'utf-8');
const jsonPad = (4 - (jsonBuffer.length % 4)) % 4;
const paddedJsonBuffer = jsonPad > 0 ? Buffer.concat([jsonBuffer, Buffer.alloc(jsonPad, 0x20)]) : jsonBuffer;

const fullBinBuffer = Buffer.concat(newBinChunks);
const binPad = (4 - (fullBinBuffer.length % 4)) % 4;
const paddedBinBuffer = binPad > 0 ? Buffer.concat([fullBinBuffer, Buffer.alloc(binPad, 0x00)]) : fullBinBuffer;

const totalLength = 12 + (8 + paddedJsonBuffer.length) + (8 + paddedBinBuffer.length);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // 'glTF'
header.writeUInt32LE(2, 4);          // version 2
header.writeUInt32LE(totalLength, 8); // total file length

const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(paddedJsonBuffer.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

const binChunkHeader = Buffer.alloc(8);
binChunkHeader.writeUInt32LE(paddedBinBuffer.length, 0);
binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

const finalGlb = Buffer.concat([
  header,
  jsonChunkHeader,
  paddedJsonBuffer,
  binChunkHeader,
  paddedBinBuffer
]);

fs.writeFileSync(OUTPUT_PATH, finalGlb);
console.log(`Successfully generated ${OUTPUT_PATH} (${(finalGlb.length / 1024 / 1024).toFixed(2)} MB)`);
