const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function encodeBase32(bytes: Uint8Array): string {
  let out = ''
  let buffer = 0
  let bits = 0

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8

    while (bits >= 5) {
      bits -= 5
      out += ALPHABET[(buffer >> bits) & 0b11111]
    }
  }

  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 0b11111]

  return out
}

export function decodeBase32(value: string): Uint8Array {
  const clean = value.replace(/[=\s-]/g, '').toUpperCase()
  const bytes: number[] = []

  let buffer = 0
  let bits = 0

  for (const character of clean) {
    const digit = ALPHABET.indexOf(character)
    if (digit < 0) throw new Error('not base32')

    buffer = (buffer << 5) | digit
    bits += 5

    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }

  return Uint8Array.from(bytes)
}

export function isBase32(value: string): boolean {
  try {
    return decodeBase32(value).length > 0
  } catch {
    return false
  }
}
