import { describe, expect, it } from 'vitest'

import { seeOther } from './see-other'

describe('seeOther', () => {
  it('is a 303 with the path verbatim in Location', () => {
    const response = seeOther('/200-general')

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/200-general')
  })

  it('keeps the query and the fragment, which carry where to land', () => {
    expect(seeOther('/thread/4-welcome?post=11').headers.get('location')).toBe(
      '/thread/4-welcome?post=11',
    )
  })

  it('never states the board’s own origin', () => {
    expect(seeOther('/').headers.get('location')).not.toMatch(/^https?:/)
  })

  it('refuses an absolute URL', () => {
    expect(() => seeOther('https://evil.example/')).toThrow(/path on this board/)
  })

  it('refuses a protocol-relative URL, which looks like a path and is not', () => {
    expect(() => seeOther('//evil.example/')).toThrow(/path on this board/)
  })

  it('refuses a bare relative path, which would resolve against the route', () => {
    expect(() => seeOther('200-general')).toThrow(/path on this board/)
  })
})
