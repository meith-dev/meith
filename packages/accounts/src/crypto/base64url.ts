const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!
    const b = bytes[index + 1]
    const c = bytes[index + 2]

    out += ALPHABET[a >> 2]
    out += ALPHABET[((a & 0b11) << 4) | ((b ?? 0) >> 4)]
    if (b === undefined) break
    out += ALPHABET[((b & 0b1111) << 2) | ((c ?? 0) >> 6)]
    if (c === undefined) break
    out += ALPHABET[c & 0b111111]
  }

  return out
}

export function decodeBase64Url(value: string): Uint8Array {
  const clean = value.replace(/[=\s]/g, '')
  const bytes: number[] = []

  let buffer = 0
  let bits = 0

  for (const character of clean) {
    const digit = ALPHABET.indexOf(character === '+' ? '-' : character === '/' ? '_' : character)
    if (digit < 0) throw new Error('not base64url')

    buffer = (buffer << 6) | digit
    bits += 6

    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }

  return Uint8Array.from(bytes)
}

export function decodeBase64UrlText(value: string): string {
  return new TextDecoder().decode(decodeBase64Url(value))
}

export function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}
