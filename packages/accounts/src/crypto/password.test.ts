import { describe, expect, it } from 'vitest'

import {
  CURRENT_PASSWORD_POLICY,
  hashPassword,
  needsRehash,
  parseArgon2Params,
  verifyPassword,
} from './password'

describe('hashPassword / verifyPassword', () => {
  it('produces a PHC-encoded argon2id hash with the current policy', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  it('verifies the correct password', async () => {
    const hash = await hashPassword('s3cret-pass')
    expect(await verifyPassword('s3cret-pass', hash)).toBe(true)
  })

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('s3cret-pass')
    expect(await verifyPassword('s3cret-pas', hash)).toBe(false)
    expect(await verifyPassword('S3cret-pass', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
    // ...yet both verify.
    expect(await verifyPassword('same-password', a)).toBe(true)
    expect(await verifyPassword('same-password', b)).toBe(true)
  })

  it('refuses to hash an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow(/empty password/i)
  })

  it('returns false (never throws) for null/garbage stored hashes', async () => {
    expect(await verifyPassword('x', null)).toBe(false)
    expect(await verifyPassword('x', undefined)).toBe(false)
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x', '$argon2id$v=19$broken')).toBe(false)
  })
})

describe('parseArgon2Params', () => {
  it('reads algorithm and cost from a PHC string', async () => {
    const hash = await hashPassword('pw')
    expect(parseArgon2Params(hash)).toEqual({
      algo: 'argon2id',
      memorySize: 19456,
      iterations: 2,
      parallelism: 1,
    })
  })

  it('returns null for non-argon2 strings', () => {
    expect(parseArgon2Params('$2b$12$abcdef')).toBeNull() // bcrypt
    expect(parseArgon2Params('plain')).toBeNull()
  })
})

describe('needsRehash', () => {
  it('is false for a hash at the current policy', async () => {
    const hash = await hashPassword('pw')
    expect(needsRehash(hash)).toBe(false)
  })

  it('is true for a weaker stored cost', () => {
    // A hash created under an older, cheaper policy.
    const weak = '$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo'
    expect(needsRehash(weak)).toBe(true)
  })

  it('is true for a non-argon2id algorithm (migrated legacy hash)', () => {
    const argon2i = '$argon2i$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo'
    expect(needsRehash(argon2i)).toBe(true)
    expect(needsRehash('$2b$12$legacybcrypthash')).toBe(true)
  })

  it('is false for a hash STRONGER than policy (never weakens)', () => {
    const strong = '$argon2id$v=19$m=65536,t=4,p=2$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo'
    expect(needsRehash(strong)).toBe(false)
  })

  it('re-hashing a flagged hash yields one that no longer needs rehash', async () => {
    const weak = '$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo'
    expect(needsRehash(weak)).toBe(true)
    const upgraded = await hashPassword('pw', CURRENT_PASSWORD_POLICY)
    expect(needsRehash(upgraded)).toBe(false)
  })
})
