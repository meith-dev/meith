import { describe, expect, it } from 'vitest'

import { asId, ICON_PATHS, parseAward, parseIcon, postbitLimit } from './awards'
import { plugin } from './definition'

describe('award inputs', () => {
  it('validates all three icon formats', () => {
    for (const icon of ['🏆', '👩🏽‍🚀', '🇮🇪', '1️⃣']) expect(parseIcon(icon)?.icon_kind).toBe('emoji')
    for (const icon of Object.keys(ICON_PATHS)) expect(parseIcon(icon)?.icon_kind).toBe('svg')
    for (const icon of ['/icons/award.svg', 'https://example.com/a.png'])
      expect(parseIcon(icon)?.icon_kind).toBe('image')
    for (const icon of [
      '',
      'text',
      '🏆🏆',
      '<svg/>',
      'javascript:alert(1)',
      '//evil.test/x',
      '/\\evil.test',
      'http://example.com/x',
      'https://user:password@example.com/x',
      'https://example.com/\nx',
    ])
      expect(parseIcon(icon)).toBeNull()
  })
  it('parses fields and refuses invalid input', () => {
    expect(
      parseAward({ name: ' Welcome ', icon: 'star', display_order: '4', listed: 'on' }).draft,
    ).toMatchObject({
      name: 'Welcome',
      icon_kind: 'svg',
      display_order: 4,
      allow_multiple: false,
      listed: true,
    })
    for (const display_order of ['-1', '1.2', '1e2', '2147483648'])
      expect(parseAward({ name: 'A', display_order }).error).toBe('invalid')
    expect(parseAward({ name: '' }).error).toBe('invalid')
    expect(parseAward({ name: 'a'.repeat(121) }).error).toBe('invalid')
    expect(parseAward({ name: 'A', icon: 'nope' }).error).toBe('icon')
    expect(asId('1e2')).toBeNull()
    expect(asId('0')).toBeNull()
    expect(asId('23')).toBe(23)
    expect(postbitLimit({ postbit_limit: -1 })).toBe(0)
    expect(postbitLimit({})).toBe(5)
  })
  it('declares public pages, admin-only mutations and the supported regions', () => {
    expect(plugin.key).toBe('awards')
    expect(plugin.pages.map((page) => page.access)).toEqual(['anonymous', 'anonymous', 'anonymous'])
    expect(plugin.routes.every((route) => route.access === 'admin')).toBe(true)
    expect(plugin.contributions.map((entry) => entry.region)).toEqual([
      'postbit.badges',
      'profile.panel',
      'admin.dashboard',
    ])
  })
})
