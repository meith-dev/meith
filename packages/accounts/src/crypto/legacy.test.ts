import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { isLegacyHash, parseMybbHash, verifyMybbPassword } from './legacy'
import { needsRehash, verifyPassword } from './password'

const md5 = (value: string) => createHash('md5').update(value, 'utf8').digest('hex')

/** A MyBB hash, built the way MyBB builds one. */
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

  /*
   * The empty-salt case is the dangerous one. MyBB's algorithm with an empty
   * salt is a *valid* hash of every password under a known constant, so an
   * accepting parser turns one corrupt row into an account anybody can log into.
   */
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

  /*
   * PHP installations differ on whether they wrote the hex upper or lower case,
   * and a migration that failed for half a board over letter case would be very
   * hard to diagnose from "incorrect password".
   */
  it('accepts a stored hash in either letter case', () => {
    const upper = stored.replace(/[0-9a-f]{32}$/, (hex) => hex.toUpperCase())
    expect(verifyMybbPassword('correct horse battery staple', upper)).toBe(true)
  })

  it('refuses a hash it cannot parse rather than throwing', () => {
    expect(verifyMybbPassword('anything', 'mybb$$')).toBe(false)
  })

  /* The salt is part of the scheme: the same password under a different salt differs. */
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

  /*
   * The upgrade half, and it needed no new code: `needsRehash` already returns
   * true for anything that is not a current-policy Argon2id hash, so the login
   * service replaces this on the first successful sign-in and the row stops
   * being a liability.
   */
  it('is always due for a rehash', () => {
    expect(needsRehash(stored)).toBe(true)
  })

  /* A bare MD5 must never verify — that is what an unprefixed column looks like. */
  it('does not verify an unprefixed MD5', async () => {
    await expect(verifyPassword('imported-password', md5('imported-password'))).resolves.toBe(false)
  })
})
