import { describe, expect, it } from 'vitest'

import { isSealedValue, openValue, sealValue } from './sealed-box'

const KEY = 'a-board-auth-secret-0000000000000'
const PURPOSE = 'meith/test-purpose'

describe('sealing a value under a purpose-bound key', () => {
  it('comes back out under the same key and purpose', async () => {
    const sealed = await sealValue('hunter2', KEY, PURPOSE)
    expect(isSealedValue(sealed)).toBe(true)
    expect(sealed).not.toContain('hunter2')
    expect(await openValue(sealed, KEY, PURPOSE)).toBe('hunter2')
  })

  it('seals the same value differently every time', async () => {
    expect(await sealValue('hunter2', KEY, PURPOSE)).not.toBe(
      await sealValue('hunter2', KEY, PURPOSE),
    )
  })

  it('will not open under another key or another purpose', async () => {
    const sealed = await sealValue('hunter2', KEY, PURPOSE)
    expect(await openValue(sealed, `${KEY}-other`, PURPOSE)).toBeNull()
    expect(await openValue(sealed, KEY, 'meith/other-purpose')).toBeNull()
  })

  it('reads nothing out of something that is not sealed', async () => {
    for (const value of ['', 'hunter2', 'v1.only-two', 'v2.aaaa.bbbb']) {
      expect(isSealedValue(value)).toBe(false)
      expect(await openValue(value, KEY, PURPOSE)).toBeNull()
    }
  })
})
