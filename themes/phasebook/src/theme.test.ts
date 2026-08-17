import { describe, expect, it } from 'vitest'

import {
  DARK_TOKENS as DEFAULT_DARK,
  LIGHT_TOKENS as DEFAULT_LIGHT,
  defaultTheme,
} from '@meith/theme-default'
import { assertThemeContract, resolveTheme, SLOT_NAMES, SLOT_STABILITY } from '@meith/theme-kit'

import { phasebookTheme } from './theme'
import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS } from './tokens'

const GEOMETRY = [
  'radius',
  'density-unit',
  'font-mono-stack',
  'font-sans-stack',
  'font-heading-stack',
  'elevation',
]

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

  const linear = [
    4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp,
    -1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp,
    -0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp,
  ]

  return `#${linear
    .map((channel) => {
      const srgb = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055
      const byte = Math.round(Math.min(1, Math.max(0, srgb)) * 255)
      return byte.toString(16).padStart(2, '0')
    })
    .join('')}`
}

describe('the phasebook theme', () => {
  it('satisfies the theme-kit contract', () => {
    expect(assertThemeContract(resolveTheme(phasebookTheme)).missing).toEqual([])
  })

  it('inherits from the default theme rather than copying it', () => {
    expect(resolveTheme(phasebookTheme).chain).toEqual(['phasebook', 'default'])
  })

  it('fills every stable slot itself, so no page falls back to another theme’s markup', () => {
    const own = new Set(Object.keys(phasebookTheme.slots))
    const stable = SLOT_NAMES.filter((name) => SLOT_STABILITY[name] !== 'provisional')

    expect(stable.filter((name) => !own.has(name))).toEqual([])
  })

  it('shares no slot implementation with the theme it extends', () => {
    const resolved = resolveTheme(phasebookTheme)

    const shared = Object.keys(phasebookTheme.slots).filter(
      (name) =>
        resolved.slots[name as keyof typeof resolved.slots] ===
        defaultTheme.slots[name as keyof typeof defaultTheme.slots],
    )

    expect(shared).toEqual([])
  })

  it.each([
    ['ForumRow', 'CategoryBlock'],
    ['ThreadRow', 'ForumDisplay'],
  ])('overrides %s together with its container %s', (row, container) => {
    const own = Object.keys(phasebookTheme.slots)
    expect(own).toContain(row)
    expect(own).toContain(container)
  })

  it('fills nothing the registry does not name', () => {
    for (const name of Object.keys(phasebookTheme.slots)) {
      expect(SLOT_NAMES).toContain(name)
    }
  })
})

describe('the phasebook palette', () => {
  it('declares exactly the tokens the default theme does', () => {
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(Object.keys(DEFAULT_LIGHT).sort())
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(DEFAULT_DARK).sort())
  })

  it('repaints every colour the default theme ships', () => {
    const shared = (a: Record<string, string>, b: Record<string, string>): string[] =>
      Object.keys(a).filter((name) => a[name] === b[name] && !GEOMETRY.includes(name))

    expect(shared(LIGHT_TOKENS, DEFAULT_LIGHT)).toEqual(['card'])
    expect(shared(DARK_TOKENS, DEFAULT_DARK)).toEqual([])
  })

  it('sets its own typography', () => {
    expect(LIGHT_TOKENS['font-sans-stack']).not.toBe(DEFAULT_LIGHT['font-sans-stack'])
    expect(LIGHT_TOKENS.elevation).not.toBe(DEFAULT_LIGHT.elevation)
  })

  it.each([
    ['light', LIGHT_TOKENS, BROWSER_THEME_COLOR.light],
    ['dark', DARK_TOKENS, BROWSER_THEME_COLOR.dark],
  ])('keeps the %s browser theme colour equal to its background token', (_scheme, tokens, hex) => {
    expect(oklchToHex(tokens.background)).toBe(hex)
  })
})
