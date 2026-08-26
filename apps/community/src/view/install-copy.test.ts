import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { installFormCopy } from './install-copy'

const SERVER = readFileSync(new URL('../server/install.ts', import.meta.url), 'utf8')

function keysThrownAsMessages(): string[] {
  const thrown = new Set<string>()

  for (const match of SERVER.matchAll(/=\s*'(install\.[a-z][A-Za-z.]*)'/g)) {
    const key = match[1]
    if (key !== undefined) thrown.add(key)
  }

  return [...thrown].sort()
}

describe('the copy an install failure is shown through', () => {
  const copy = installFormCopy([])

  it('finds the keys the server throws in place of a message', () => {
    expect(keysThrownAsMessages().length).toBeGreaterThan(0)
  })

  it.each(keysThrownAsMessages())('carries %s, so the operator reads prose', (key) => {
    expect(Object.keys(copy)).toContain(key)
  })

  it('resolves each of them to something other than the key itself', () => {
    for (const key of keysThrownAsMessages()) {
      expect(copy[key]).not.toBe(key)
      expect((copy[key] ?? '').length).toBeGreaterThan(20)
    }
  })
})
