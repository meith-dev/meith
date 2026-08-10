import { describe, expect, it } from 'vitest'

import { logoSrc, resolveLogo } from './branding'

describe('logoSrc', () => {
  it('changes when the stored key does', () => {
    const a = logoSrc('light', 'board/logo-light-11111111-1111-1111-1111-111111111111.png')
    const b = logoSrc('light', 'board/logo-light-22222222-2222-2222-2222-222222222222.png')

    expect(a).not.toBe(b)
    expect(a.startsWith('/logo/light?v=')).toBe(true)
  })
})

describe('resolveLogo', () => {
  const LIGHT = 'board/logo-light-11111111-1111-1111-1111-111111111111.png'
  const DARK = 'board/logo-dark-22222222-2222-2222-2222-222222222222.png'
  const base = { alt: '', boardTitle: 'The Townland' } as const

  it('is null when the board has no logo, which is most boards', () => {
    expect(resolveLogo({ ...base, lightKey: null, darkKey: null, scheme: 'system' })).toBeNull()
  })

  it('sends one image and no picture element when a scheme is forced', () => {
    const light = resolveLogo({ ...base, lightKey: LIGHT, darkKey: DARK, scheme: 'light' })
    const dark = resolveLogo({ ...base, lightKey: LIGHT, darkKey: DARK, scheme: 'dark' })

    expect(light?.darkSrc).toBeNull()
    expect(dark?.darkSrc).toBeNull()
    expect(light?.src).not.toBe(dark?.src)
  })

  it('defers to the media query only for a reader on "system"', () => {
    const resolved = resolveLogo({ ...base, lightKey: LIGHT, darkKey: DARK, scheme: 'system' })

    expect(resolved?.src).toContain('/logo/light')
    expect(resolved?.darkSrc).toContain('/logo/dark')
  })

  it('uses the one image it has in both schemes', () => {
    const onlyLight = resolveLogo({ ...base, lightKey: LIGHT, darkKey: null, scheme: 'system' })
    expect(onlyLight?.src).toContain('/logo/light')
    expect(onlyLight?.darkSrc).toBeNull()

    const onlyDark = resolveLogo({ ...base, lightKey: null, darkKey: DARK, scheme: 'light' })
    expect(onlyDark?.src).toContain('/logo/dark')
  })

  it('never hands the theme an empty alt', () => {
    const fallback = resolveLogo({ ...base, lightKey: LIGHT, darkKey: null, scheme: 'light' })
    expect(fallback?.alt).toBe('The Townland')

    const written = resolveLogo({
      ...base,
      alt: '  The Townland, in a circle  ',
      lightKey: LIGHT,
      darkKey: null,
      scheme: 'light',
    })
    expect(written?.alt).toBe('The Townland, in a circle')
  })
})
