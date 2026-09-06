/**
 * Small Protocol Buffers codec for the two dlp3d streaming schemas.
 *
 * The services publish deliberately small proto3 schemas. Keeping this codec
 * local avoids a large runtime dependency and, importantly, lets the browser
 * speak the services' binary WebSocket protocol directly.
 */
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const concat = (parts) => {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

const varint = (number) => {
  let value = Math.max(0, Math.floor(number))
  const bytes = []
  do {
    let byte = value & 0x7f
    value = Math.floor(value / 128)
    if (value) byte |= 0x80
    bytes.push(byte)
  } while (value)
  return new Uint8Array(bytes)
}

const tag = (field, wireType) => varint((field << 3) | wireType)
const stringField = (field, value) => {
  if (value === undefined || value === null || value === '') return null
  const bytes = encoder.encode(String(value))
  return concat([tag(field, 2), varint(bytes.length), bytes])
}
const bytesField = (field, value) => {
  if (!value?.length) return null
  return concat([tag(field, 2), varint(value.length), value])
}
const intField = (field, value) => (value === undefined || value === null || value === 0)
  ? null : concat([tag(field, 0), varint(value)])
const floatField = (field, value) => {
  if (value === undefined || value === null || value === 0) return null
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setFloat32(0, value, true)
  return concat([tag(field, 5), bytes])
}
const messageField = (field, value) => value?.length ? concat([tag(field, 2), varint(value.length), value]) : null

const fields = (...values) => concat(values.filter(Boolean))

function readVarint(bytes, cursor) {
  let value = 0
  let shift = 0
  while (cursor.index < bytes.length) {
    const byte = bytes[cursor.index++]
    value += (byte & 0x7f) * (2 ** shift)
    if (!(byte & 0x80)) return value
    shift += 7
    if (shift > 49) throw new Error('Invalid protobuf varint')
  }
  throw new Error('Unexpected end of protobuf data')
}

function decodeFields(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const cursor = { index: 0 }
  const output = new Map()
  while (cursor.index < bytes.length) {
    const fieldTag = readVarint(bytes, cursor)
    const field = fieldTag >>> 3
    const wireType = fieldTag & 7
    let value
    if (wireType === 0) value = readVarint(bytes, cursor)
    else if (wireType === 1) {
      value = bytes.slice(cursor.index, cursor.index + 8)
      cursor.index += 8
    } else if (wireType === 2) {
      const length = readVarint(bytes, cursor)
      value = bytes.slice(cursor.index, cursor.index + length)
      cursor.index += length
    } else if (wireType === 5) {
      value = bytes.slice(cursor.index, cursor.index + 4)
      cursor.index += 4
    } else throw new Error(`Unsupported protobuf wire type ${wireType}`)
    if (!output.has(field)) output.set(field, [])
    output.get(field).push(value)
  }
  return output
}

const firstString = (decoded, field) => {
  const value = decoded.get(field)?.[0]
  return value ? decoder.decode(value) : ''
}
const strings = (decoded, field) => (decoded.get(field) || []).map((value) => decoder.decode(value))
const firstBytes = (decoded, field) => decoded.get(field)?.[0] || new Uint8Array()

export function encodeAudio2FaceRequest({ className, requestId, sampleRate, sampleWidth, channels, profileName, responseChunkFrames, pcmBytes }) {
  return fields(
    stringField(1, className), stringField(2, requestId), intField(3, sampleRate),
    intField(4, sampleWidth), intField(5, channels), stringField(6, profileName),
    intField(8, responseChunkFrames), bytesField(9, pcmBytes),
  )
}

export function decodeAudio2FaceResponse(buffer) {
  const decoded = decodeFields(buffer)
  return {
    className: firstString(decoded, 1),
    blendshapeNames: strings(decoded, 2),
    dtype: firstString(decoded, 3),
    data: firstBytes(decoded, 4),
  }
}

const encodeSpeechTime = ([charIndex, startTime]) => fields(intField(1, charIndex), floatField(2, startTime))
const encodeMotionKeyword = ([charIndex, keyword]) => fields(intField(1, charIndex), stringField(2, keyword))

export function encodeSpeech2MotionRequest({
  className,
  requestId,
  userId,
  avatar,
  appName,
  maxFrontExtensionDuration = 1.0,
  maxRearExtensionDuration = 5.0,
  duration,
  speechText,
  sequenceNumber,
  speechTime = [],
  motionKeywords = [],
  labelExpression,
  responseChunkFrames = 0,
}) {
  return fields(
    stringField(1, className),
    stringField(2, requestId),
    stringField(3, userId),
    stringField(4, avatar),
    stringField(5, appName),
    floatField(6, maxFrontExtensionDuration),
    floatField(7, maxRearExtensionDuration),
    responseChunkFrames ? intField(12, responseChunkFrames) : null,
    floatField(15, duration),
    stringField(16, speechText),
    intField(17, sequenceNumber),
    ...speechTime.map((item) => messageField(18, encodeSpeechTime(item))),
    ...motionKeywords.map((item) => messageField(19, encodeMotionKeyword(item))),
    stringField(20, labelExpression),
  )
}

export function decodeSpeech2MotionResponse(buffer) {
  const decoded = decodeFields(buffer)
  return {
    className: firstString(decoded, 1),
    requestId: firstString(decoded, 2),
    jointNames: strings(decoded, 3),
    restposeName: firstString(decoded, 4),
    dtype: firstString(decoded, 5),
    data: firstBytes(decoded, 8),
    log: firstString(decoded, 9),
    blendshapeNames: strings(decoded, 10),
  }
}

export function float32FromBytes(bytes) {
  const safe = bytes.byteOffset % 4 === 0
    ? bytes
    : bytes.slice()
  return new Float32Array(safe.buffer, safe.byteOffset, Math.floor(safe.byteLength / 4))
}
