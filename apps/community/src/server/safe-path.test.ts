import { describe, expect, it } from 'vitest'

import { isSafeLocalPath } from './safe-path'

describe('isSafeLocalPath', () => {
  it('accepts a plain path on this board', () => {
    expect(isSafeLocalPath('/')).toBe(true)
    expect(isSafeLocalPath('/thread/12-a-slug')).toBe(true)
    expect(isSafeLocalPath('/search?q=hello%20world#top')).toBe(true)
  })

  it('rejects a protocol-relative target', () => {
    expect(isSafeLocalPath('//evil.com')).toBe(false)
  })

  it('rejects a backslash target the browser reads as an authority', () => {
    expect(isSafeLocalPath('/\\evil.com')).toBe(false)
    expect(isSafeLocalPath('/\\/\\evil.com')).toBe(false)
    expect(isSafeLocalPath('\\/evil.com')).toBe(false)
  })

  it('rejects an absolute URL', () => {
    expect(isSafeLocalPath('https://evil.com')).toBe(false)
    expect(isSafeLocalPath('http://evil.com')).toBe(false)
    expect(isSafeLocalPath('javascript:alert(1)')).toBe(false)
  })

  it('rejects control characters that could smuggle a header', () => {
    expect(isSafeLocalPath('/ok\r\nLocation: https://evil.com')).toBe(false)
    expect(isSafeLocalPath('/ok here')).toBe(false)
  })

  it('rejects anything that does not start with a single slash', () => {
    expect(isSafeLocalPath('')).toBe(false)
    expect(isSafeLocalPath('evil.com')).toBe(false)
    expect(isSafeLocalPath('../secret')).toBe(false)
  })
})
