import { createHash } from 'node:crypto'

import { bcrypt } from 'hash-wasm'
import { describe, expect, it } from 'vitest'

import { isLegacyHash, parseMybbHash, verifyMybbPassword, verifyPhpbbPassword } from './legacy'
import { needsRehash, verifyPassword } from './password'

const md5 = (value: string) => createHash('md5').update(value, 'utf8').digest('hex')

function mybbHash(password: string, salt: string): string {
  return `mybb$${salt}$${md5(md5(salt) + md5(password))}`
}

describe('parsing a stored legacy hash', () => {
  it('splits the prefix, the salt and the hash', () => {
    expect(parseMybbHash(mybbHash('hunter2', 'abcd1234'))).toEqual({
      salt: 'abcd1234',
      hash: md5(md5('abcd1234') + md5('hunter2')),
    })
  })

  it.each([
    ['mybb$$' + 'a'.repeat(32), 'an empty salt'],
    ['mybb$salt$', 'an empty hash'],
    ['mybb$salt$nothex', 'a hash that is not hex'],
    ['mybb$salt$' + 'a'.repeat(31), 'a hash of the wrong length'],
    ['mybb$saltonly', 'no separator'],
    ['a'.repeat(32), 'a bare MD5 — an unprefixed legacy column looks like this'],
    ['$argon2id$v=19$m=19456,t=2,p=1$abc$def', 'an Argon2 hash'],
    ['', 'nothing'],
  ])('refuses %s (%s)', (stored) => {
    expect(parseMybbHash(stored)).toBeNull()
  })

  it('recognises the prefix, and only the prefix', () => {
    expect(isLegacyHash(mybbHash('x', 'y'))).toBe(true)
    expect(isLegacyHash('a'.repeat(32))).toBe(false)
    expect(isLegacyHash(null)).toBe(false)
  })
})

describe('verifying against MyBB’s scheme', () => {
  const stored = mybbHash('correct horse battery staple', 'Zx91qP2m')

  it('accepts the right password', () => {
    expect(verifyMybbPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('refuses the wrong one', () => {
    expect(verifyMybbPassword('correct horse battery stapl', stored)).toBe(false)
    expect(verifyMybbPassword('', stored)).toBe(false)
  })

  it('accepts a stored hash in either letter case', () => {
    const upper = stored.replace(/[0-9a-f]{32}$/, (hex) => hex.toUpperCase())
    expect(verifyMybbPassword('correct horse battery staple', upper)).toBe(true)
  })

  it('refuses a hash it cannot parse rather than throwing', () => {
    expect(verifyMybbPassword('anything', 'mybb$$')).toBe(false)
  })

  it('is salted', () => {
    expect(verifyMybbPassword('hunter2', mybbHash('hunter2', 'saltA'))).toBe(true)
    expect(verifyMybbPassword('hunter2', mybbHash('hunter2', 'saltB'))).toBe(true)
    expect(mybbHash('hunter2', 'saltA')).not.toBe(mybbHash('hunter2', 'saltB'))
  })
})

describe('the login path', () => {
  const stored = mybbHash('imported-password', 'saltsalt')

  it('verifies an imported member through the ordinary verifier', async () => {
    await expect(verifyPassword('imported-password', stored)).resolves.toBe(true)
    await expect(verifyPassword('wrong', stored)).resolves.toBe(false)
  })

  it('is always due for a rehash', () => {
    expect(needsRehash(stored)).toBe(true)
  })

  it('does not verify an unprefixed MD5', async () => {
    await expect(verifyPassword('imported-password', md5('imported-password'))).resolves.toBe(false)
  })
})

describe('a phpBB hash', () => {
  it('verifies a phpass $H$ hash', async () => {
    const stored = 'phpbb$$H$9saltsaltoOYGA0TbwROeAx3OxiKY5/'
    await expect(verifyPhpbbPassword('correct horse', stored)).resolves.toBe(true)
    await expect(verifyPhpbbPassword('wrong', stored)).resolves.toBe(false)
  })

  it('verifies a phpass $P$ hash', async () => {
    const stored = 'phpbb$$P$8abcdefghusp.z.A.CKRJwpA1riYkP.'
    await expect(verifyPhpbbPassword('battery staple', stored)).resolves.toBe(true)
    await expect(verifyPhpbbPassword('battery stapl', stored)).resolves.toBe(false)
  })

  it('verifies a bcrypt hash, whatever its two-letter marker', async () => {
    const encoded = await bcrypt({
      password: 'modern phpbb password',
      salt: new Uint8Array(16).fill(7),
      costFactor: 8,
      outputType: 'encoded',
    })
    for (const marker of ['$2a$', '$2y$', '$2b$']) {
      const stored = `phpbb$${marker}${encoded.slice(4)}`
      await expect(verifyPhpbbPassword('modern phpbb password', stored)).resolves.toBe(true)
      await expect(verifyPhpbbPassword('nope', stored)).resolves.toBe(false)
    }
  })

  it('verifies a bare phpBB2 MD5', async () => {
    const stored = 'phpbb$5fcfd41e547a12215b173ff47fdd3739'
    await expect(verifyPhpbbPassword('trustno1', stored)).resolves.toBe(true)
    await expect(verifyPhpbbPassword('trustno2', stored)).resolves.toBe(false)
  })

  it('refuses shapes it does not recognise rather than throwing', async () => {
    await expect(verifyPhpbbPassword('anything', 'phpbb$')).resolves.toBe(false)
    await expect(verifyPhpbbPassword('anything', 'phpbb$$H$1short')).resolves.toBe(false)
    await expect(verifyPhpbbPassword('anything', 'mybb$salt$abc')).resolves.toBe(false)
  })

  it('signs an imported phpBB member in through the ordinary verifier', async () => {
    const stored = 'phpbb$$H$9saltsaltoOYGA0TbwROeAx3OxiKY5/'
    await expect(verifyPassword('correct horse', stored)).resolves.toBe(true)
    expect(isLegacyHash(stored)).toBe(true)
    expect(needsRehash(stored)).toBe(true)
  })
})
