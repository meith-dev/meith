import { describe, expect, it } from 'vitest'

import { absoluteUrl, buildMailBrand, mailLogo, normaliseBoardUrl } from './brand'

const LIGHT = 'board/logo-light-11111111-1111-1111-1111-111111111111.png'
const DARK = 'board/logo-dark-22222222-2222-2222-2222-222222222222.png'

describe('normaliseBoardUrl', () => {
  it('drops a trailing slash so no link is built with a double one', () => {
    expect(normaliseBoardUrl('https://board.example/')).toBe('https://board.example')
  })

  it('refuses anything that is not an absolute origin', () => {
    for (const value of ['', 'board.example', 'https://board.example/forum', 'javascript:x']) {
      expect(normaliseBoardUrl(value), value).toBe('')
    }
  })
})

describe('absoluteUrl', () => {
  it('joins a board-relative path onto the origin', () => {
    expect(absoluteUrl('https://board.example', '/verify')).toBe('https://board.example/verify')
  })

  it('gives nothing when the board has no address, rather than a broken link', () => {
    expect(absoluteUrl('', '/verify')).toBeNull()
    expect(absoluteUrl('https://board.example', null)).toBeNull()
    expect(absoluteUrl('https://board.example', 'verify')).toBeNull()
  })
})

describe('mailLogo', () => {
  const alt = 'The Townland'

  it('addresses both schemes absolutely, because mail has no origin of its own', () => {
    const logo = mailLogo({
      boardUrl: 'https://board.example',
      lightKey: LIGHT,
      darkKey: DARK,
      alt,
    })

    expect(logo?.src).toMatch(/^https:\/\/board\.example\/logo\/light\?v=/)
    expect(logo?.darkSrc).toMatch(/^https:\/\/board\.example\/logo\/dark\?v=/)
  })

  it('uses the one uploaded logo for both schemes', () => {
    const logo = mailLogo({ boardUrl: 'https://board.example', lightKey: LIGHT, darkKey: '', alt })

    expect(logo?.src).toContain('/logo/light')
    expect(logo?.darkSrc).toBeNull()
  })

  it('declines an SVG, which most mail clients will not draw', () => {
    const svg = 'board/logo-light-11111111-1111-1111-1111-111111111111.svg'
    expect(
      mailLogo({ boardUrl: 'https://board.example', lightKey: svg, darkKey: '', alt }),
    ).toBeNull()
  })

  it('declines a key that did not come from the upload path', () => {
    expect(
      mailLogo({
        boardUrl: 'https://board.example',
        lightKey: '../../etc/passwd',
        darkKey: '',
        alt,
      }),
    ).toBeNull()
  })

  it('declines everything when the board has no address to serve it from', () => {
    expect(mailLogo({ boardUrl: '', lightKey: LIGHT, darkKey: DARK, alt })).toBeNull()
  })
})

describe('buildMailBrand', () => {
  it('leaves fromName off entirely rather than sending an empty one', () => {
    expect(buildMailBrand({ boardName: 'A', boardUrl: '', fromName: ' ' }).fromName).toBeUndefined()
  })

  it('has a palette even when no theme could be read', () => {
    expect(buildMailBrand({ boardName: 'A', boardUrl: '' }).palette.light.primary).toMatch(
      /^#[0-9a-f]{6}$/,
    )
  })
})
