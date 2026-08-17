export type CborValue =
  | number
  | bigint
  | string
  | boolean
  | null
  | Uint8Array
  | readonly CborValue[]
  | ReadonlyMap<CborValue, CborValue>

export interface CborRead {
  readonly value: CborValue
  readonly length: number
}

export function decodeCbor(bytes: Uint8Array, offset = 0): CborRead {
  const start = offset
  const initial = byteAt(bytes, offset)
  offset += 1

  const major = initial >> 5
  const minor = initial & 0b11111

  if (major === 7) {
    if (minor === 20) return { value: false, length: offset - start }
    if (minor === 21) return { value: true, length: offset - start }
    if (minor === 22) return { value: null, length: offset - start }
    if (minor === 23) return { value: null, length: offset - start }
    throw new Error(`unsupported CBOR simple value ${minor}`)
  }

  const head = readArgument(bytes, offset, minor)
  offset = head.offset
  const argument = head.value

  if (major === 0) return { value: argument, length: offset - start }
  if (major === 1) return { value: -1 - argument, length: offset - start }

  if (major === 2) {
    const end = offset + argument
    if (end > bytes.length) throw new Error('truncated CBOR byte string')
    return { value: bytes.slice(offset, end), length: end - start }
  }

  if (major === 3) {
    const end = offset + argument
    if (end > bytes.length) throw new Error('truncated CBOR text string')
    return {
      value: new TextDecoder().decode(bytes.subarray(offset, end)),
      length: end - start,
    }
  }

  if (major === 4) {
    const items: CborValue[] = []
    for (let index = 0; index < argument; index += 1) {
      const item = decodeCbor(bytes, offset)
      items.push(item.value)
      offset += item.length
    }
    return { value: items, length: offset - start }
  }

  if (major === 5) {
    const entries = new Map<CborValue, CborValue>()
    for (let index = 0; index < argument; index += 1) {
      const key = decodeCbor(bytes, offset)
      offset += key.length
      const value = decodeCbor(bytes, offset)
      offset += value.length
      entries.set(key.value, value.value)
    }
    return { value: entries, length: offset - start }
  }

  throw new Error(`unsupported CBOR major type ${major}`)
}

function readArgument(
  bytes: Uint8Array,
  offset: number,
  minor: number,
): { value: number; offset: number } {
  if (minor < 24) return { value: minor, offset }
  if (minor === 24) return { value: byteAt(bytes, offset), offset: offset + 1 }
  if (minor === 25) {
    return { value: (byteAt(bytes, offset) << 8) | byteAt(bytes, offset + 1), offset: offset + 2 }
  }
  if (minor === 26) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4)
    return { value: view.getUint32(0), offset: offset + 4 }
  }
  throw new Error(`unsupported CBOR argument width ${minor}`)
}

function byteAt(bytes: Uint8Array, offset: number): number {
  const value = bytes[offset]
  if (value === undefined) throw new Error('truncated CBOR value')
  return value
}

export function cborMap(value: CborValue): ReadonlyMap<CborValue, CborValue> {
  if (!(value instanceof Map)) throw new Error('expected a CBOR map')
  return value
}

export function cborBytes(value: CborValue | undefined): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error('expected a CBOR byte string')
  return value
}
