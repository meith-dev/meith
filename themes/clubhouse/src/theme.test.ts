import { describe, expect, it } from 'vitest'

import {
  DARK_TOKENS as DEFAULT_DARK,
  LIGHT_TOKENS as DEFAULT_LIGHT,
  defaultTheme,
  SCHEME_INDEPENDENT_TOKENS,
} from '@meith/theme-default'
import { assertThemeContract, resolveTheme, SLOT_NAMES, SLOT_STABILITY } from '@meith/theme-kit'

import { clubhouseTheme } from './theme'
import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS } from './tokens'

function oklchToHex(value: string): string | null {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim())
  if (match === null) return null

  const [l, c, hDeg] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)

  const lp = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mp = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sp = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  const channels = [
    4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp,
    -1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp,
    -0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp,
  ].map((channel) => {
    const srgb =
      channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.max(channel, 0) ** (1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
  })

  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

describe('the clubhouse theme', () => {
  it('satisfies the theme-kit contract', () => {
    expect(assertThemeContract(resolveTheme(clubhouseTheme)).missing).toEqual([])
  })

  it('inherits from the default theme rather than copying it', () => {
    expect(resolveTheme(clubhouseTheme).chain).toEqual(['clubhouse', 'default'])
  })

  it('fills nothing the registry does not name', () => {
    for (const name of Object.keys(clubhouseTheme.slots)) {
      expect(SLOT_NAMES).toContain(name)
      expect(SLOT_STABILITY[name as keyof typeof SLOT_STABILITY]).toBeDefined()
    }
  })

  it('inherits the writing, signing-in and control-panel slots unchanged', () => {
    const own = new Set(Object.keys(clubhouseTheme.slots))
    const resolved = resolveTheme(clubhouseTheme)

    for (const name of [
      'PostForm',
      'AuthPage',
      'PanelShell',
      'PanelNav',
      'PanelPage',
      'PanelSection',
      'SearchForm',
      'SearchResults',
      'DiscoveryView',
      'ForumJump',
      'RedirectNotice',
      'ErrorNotice',
    ] as const) {
      expect(own.has(name)).toBe(false)
      expect(resolved.slots[name]).toBe(defaultTheme.slots[name])
    }
  })

  it.each([
    ['ForumRow', 'CategoryBlock'],
    ['ThreadRow', 'ForumDisplay'],
  ])('overrides %s together with its container %s', (row, container) => {
    const own = Object.keys(clubhouseTheme.slots)
    expect(own).toContain(row)
    expect(own).toContain(container)
  })

  it('leaves the provisional islands alone', () => {
    expect(resolveTheme(clubhouseTheme).missing).toEqual(['QuickReply', 'EditorToolbar'])
  })
})

describe('the clubhouse palette', () => {
  it('declares exactly the tokens the default theme does', () => {
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(Object.keys(DEFAULT_LIGHT).sort())
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(DEFAULT_DARK).sort())
  })

  it('shares no colour value with the default theme', () => {
    const shared = (a: Record<string, string>, b: Record<string, string>): string[] =>
      Object.keys(a).filter(
        (name) =>
          a[name] === b[name] && !(SCHEME_INDEPENDENT_TOKENS as readonly string[]).includes(name),
      )

    expect(shared(LIGHT_TOKENS, DEFAULT_LIGHT)).toEqual([])
    expect(shared(DARK_TOKENS, DEFAULT_DARK)).toEqual([])
  })

  it('sets its own geometry and heading voice', () => {
    expect(LIGHT_TOKENS.radius).not.toBe(DEFAULT_LIGHT.radius)
    expect(LIGHT_TOKENS.elevation).not.toBe(DEFAULT_LIGHT.elevation)
    expect(LIGHT_TOKENS['font-heading-stack']).not.toBe(DEFAULT_LIGHT['font-heading-stack'])
  })

  it('carries a club colour in both schemes, and a second one to trim it with', () => {
    for (const tokens of [LIGHT_TOKENS, DARK_TOKENS]) {
      expect(tokens.primary).toMatch(/^oklch\(/)
      expect(tokens.secondary).not.toBe(tokens.muted)
      expect(tokens.ring).not.toBe(tokens.border)
    }
  })

  it('fills with the club colour and outlines with a lighter step of it in dark', () => {
    expect(LIGHT_TOKENS.ring).toBe(LIGHT_TOKENS.primary)
    expect(DARK_TOKENS.ring).not.toBe(DARK_TOKENS.primary)
  })

  it.each([
    ['light', LIGHT_TOKENS, BROWSER_THEME_COLOR.light],
    ['dark', DARK_TOKENS, BROWSER_THEME_COLOR.dark],
  ])('keeps the %s browser theme colour equal to its background token', (_scheme, tokens, hex) => {
    expect(oklchToHex(tokens.background)).toBe(hex)
  })
})
