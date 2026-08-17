import { describe, expect, it } from 'vitest'

import { assertSealingKey, openSecret, sealSecret } from './secret-box'

const KEY = 'a-board-auth-secret-0000000000000'

describe('sealing the secret an authenticator app holds', () => {
  it('comes back out under the same key', async () => {
    const sealed = await sealSecret('MZXW6YTBOI', KEY)
    expect(await openSecret(sealed, KEY)).toBe('MZXW6YTBOI')
  })

  it('does not carry the secret in the clear', async () => {
    expect(await sealSecret('MZXW6YTBOI', KEY)).not.toContain('MZXW6YTBOI')
  })

  it('seals the same secret differently every time', async () => {
    expect(await sealSecret('MZXW6YTBOI', KEY)).not.toBe(await sealSecret('MZXW6YTBOI', KEY))
  })

  it('will not open under another key', async () => {
    const sealed = await sealSecret('MZXW6YTBOI', KEY)
    expect(await openSecret(sealed, `${KEY}-different`)).toBeNull()
  })

  it('will not open once a byte has been changed', async () => {
    const sealed = await sealSecret('MZXW6YTBOI', KEY)
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith('A') ? 'BB' : 'AA'}`

    expect(await openSecret(tampered, KEY)).toBeNull()
  })

  it('reads nothing out of something that is not a sealed secret', async () => {
    for (const value of ['', 'MZXW6YTBOI', 'v1.only-two', 'v2.aaaa.bbbb']) {
      expect(await openSecret(value, KEY)).toBeNull()
    }
  })

  it('says plainly what is missing when the board has no key to seal with', () => {
    expect(() => assertSealingKey(undefined)).toThrow(/needs AUTH_SECRET set/)
    expect(() => assertSealingKey('   ')).toThrow(/needs AUTH_SECRET set/)
    expect(assertSealingKey(KEY)).toBe(KEY)
  })
})
