import { createHash, timingSafeEqual } from 'node:crypto'

export const MYBB_PREFIX = 'mybb$'

export interface LegacyMybbHash {
  readonly salt: string
  readonly hash: string
}

function md5(value: string): string {
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
  return typeof stored === 'string' && stored.startsWith(MYBB_PREFIX)
}

export function verifyMybbPassword(password: string, stored: string): boolean {
  const parsed = parseMybbHash(stored)
  if (parsed === null) return false

  const computed = md5(md5(parsed.salt) + md5(password))
  const expected = Buffer.from(parsed.hash.toLowerCase(), 'utf8')
  const actual = Buffer.from(computed, 'utf8')

  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}
