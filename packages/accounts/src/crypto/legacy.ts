import { createHash, timingSafeEqual } from 'node:crypto'

import { bcryptVerify } from 'hash-wasm'

export const MYBB_PREFIX = 'mybb$'
export const PHPBB_PREFIX = 'phpbb$'

export interface LegacyMybbHash {
  readonly salt: string
  readonly hash: string
}

function md5(value: string | Buffer): Buffer {
  return createHash('md5').update(value).digest()
}

function md5Hex(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

export function parseMybbHash(stored: string): LegacyMybbHash | null {
  if (!stored.startsWith(MYBB_PREFIX)) return null

  const rest = stored.slice(MYBB_PREFIX.length)
  const separator = rest.indexOf('$')
  if (separator === -1) return null

  const salt = rest.slice(0, separator)
  const hash = rest.slice(separator + 1)

  if (salt.length === 0) return null
  if (!/^[0-9a-f]{32}$/i.test(hash)) return null

  return { salt, hash }
}

export function isLegacyHash(stored: string | null | undefined): boolean {
  return (
    typeof stored === 'string' &&
    (stored.startsWith(MYBB_PREFIX) || stored.startsWith(PHPBB_PREFIX))
  )
}

export function verifyMybbPassword(password: string, stored: string): boolean {
  const parsed = parseMybbHash(stored)
  if (parsed === null) return false

  const computed = md5Hex(md5Hex(parsed.salt) + md5Hex(password))
  return constantTimeEqual(computed, parsed.hash.toLowerCase())
}

const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function phpassEncode64(input: Buffer, count: number): string {
  let output = ''
  let i = 0
  while (i < count) {
    let value = input[i]!
    i += 1
    output += ITOA64[value & 0x3f]
    if (i < count) value |= input[i]! << 8
    output += ITOA64[(value >> 6) & 0x3f]
    if (i >= count) break
    i += 1
    if (i < count) value |= input[i]! << 16
    output += ITOA64[(value >> 12) & 0x3f]
    if (i >= count) break
    i += 1
    output += ITOA64[(value >> 18) & 0x3f]
  }
  return output
}

function verifyPhpassHash(password: string, stored: string): boolean {
  if (stored.length !== 34) return false

  const countLog2 = ITOA64.indexOf(stored[3]!)
  if (countLog2 < 7 || countLog2 > 30) return false

  const salt = stored.slice(4, 12)
  if (salt.length !== 8) return false

  const rounds = 1 << countLog2
  let hash = md5(salt + password)
  for (let i = 0; i < rounds; i += 1) {
    hash = md5(Buffer.concat([hash, Buffer.from(password, 'utf8')]))
  }

  return constantTimeEqual(stored.slice(0, 12) + phpassEncode64(hash, 16), stored)
}

export async function verifyPhpbbPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(PHPBB_PREFIX)) return false
  const hash = stored.slice(PHPBB_PREFIX.length)

  if (/^\$2[abxy]\$/.test(hash)) {
    try {
      return await bcryptVerify({ password, hash: `$2a$${hash.slice(4)}` })
    } catch {
      return false
    }
  }

  if (hash.startsWith('$H$') || hash.startsWith('$P$')) {
    return verifyPhpassHash(password, hash)
  }

  if (/^[0-9a-f]{32}$/i.test(hash)) {
    return constantTimeEqual(md5Hex(password), hash.toLowerCase())
  }

  return false
}

export function verifyLegacyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith(MYBB_PREFIX)) {
    return Promise.resolve(verifyMybbPassword(password, stored))
  }
  return verifyPhpbbPassword(password, stored)
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
