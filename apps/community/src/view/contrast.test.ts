/**
 * The contrast checker, and the gate it puts on the board's own palette.
 *
 * The claim the editor makes is that a failure in its legibility panel means
 * something. That claim is only worth anything if the board does not ship
 * failures of its own: a panel that is red on a pristine install teaches an
 * operator within a day to ignore it, and the one failure they caused
 * themselves then scrolls past with the rest. So **every theme in the registry**
 * is held to every pair, in both schemes, here.
 *
 * The list comes from `community.config.ts` rather than from a constant, the same
 * way F77's rendering contract takes it: registering a theme enrols it, and
 * there is no list to forget to add yourself to. `midnight` failed twelve pairs
 * on the day this test was written — the tool's first real finding, in the theme
 * shipped as the worked example — and its palette moved rather than the test.
 *
 * It runs in both directions on purpose. A pair added to `CONTRAST_PAIRS` that a
 * shipped theme fails is either a wrong pair or a real bug in the palette, and
 * this test makes somebody decide which — rather than the pair being quietly
 * dropped because the panel looked untidy.
 */
import { describe, expect, it } from 'vitest'

import { LIGHT_TOKENS, TOKEN_NAMES } from '@meith/theme-default'

import forumConfig from '../../community.config'

import {
  CONTRAST_PAIRS,
  checkContrast,
  contrastChecksFor,
  contrastGrade,
  contrastRatio,
  formatRatio,
} from './contrast'

const WHITE = '#ffffff'
const BLACK = '#000000'

describe('contrastRatio', () => {
  it('is 21:1 for black on white, which is the top of the scale', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5)
  })

  it('is 1:1 for a colour on itself', () => {
    expect(contrastRatio('oklch(0.55 0.12 68)', 'oklch(0.55 0.12 68)')).toBeCloseTo(1, 10)
  })

  /*
   * The formula puts the lighter of the two on top, so the pair's *label* is
   * what carries the direction. Asserted because a reader of the panel could
   * reasonably assume otherwise, and because an implementation that cared about
   * order would report two different numbers for one pair of colours.
   */
  it('does not depend on which value is given first', () => {
    expect(contrastRatio(WHITE, BLACK)).toBe(contrastRatio(BLACK, WHITE))
  })

  it('reads both notations the board stores', () => {
    /* oklch(1 0 0) is white; the ratio against black is the same 21:1. */
    expect(contrastRatio('oklch(1 0 0)', BLACK)).toBeCloseTo(21, 3)
  })

  /*
   * The honest answer for a value this module cannot turn into a luminance.
   * Reporting a pass would be a green tick over an unanswered question, and the
   * values that reach it — `color-mix()`, a `var()`, an alpha channel — are all
   * legitimate CSS that a board really does hold.
   */
  it.each(['color-mix(in srgb, red 50%, blue)', 'var(--primary)', 'oklch(0.2 0 0 / 8%)', ''])(
    'returns null rather than a number for %s',
    (value) => {
      expect(contrastRatio(value, WHITE)).toBeNull()
    },
  )
})

describe('checkContrast', () => {
  it('reports a pair whose values it cannot read as unknown, not as a pass', () => {
    const [check] = checkContrast(
      { primary: 'color-mix(in srgb, red, blue)', 'primary-foreground': WHITE },
      [
        {
          foreground: 'primary-foreground',
          background: 'primary',
          label: 'A button',
          need: 'text',
        },
      ],
    )

    expect(check?.state).toBe('unknown')
    expect(check?.ratio).toBeNull()
  })

  /*
   * A palette-only theme may declare fewer tokens than the board describes. A
   * pair it has no values for is not a failure — it is a pair that does not
   * exist on that board — and reporting it red would light the panel up for a
   * theme that has done nothing wrong.
   */
  it('reports a pair the theme has no values for as unknown', () => {
    const [check] = checkContrast({}, [
      { foreground: 'ring', background: 'card', label: 'Focus', need: 'non-text' },
    ])

    expect(check?.state).toBe('unknown')
  })

  it('fails a pair below its threshold and passes one above it', () => {
    const pairs = [
      { foreground: 'foreground', background: 'background', label: 'Text', need: 'text' },
    ] as const

    expect(checkContrast({ foreground: BLACK, background: WHITE }, pairs)[0]?.state).toBe('pass')
    expect(
      checkContrast({ foreground: '#767676', background: '#8a8a8a' }, pairs)[0]?.state,
    ).toBe('fail')
  })

  /*
   * 3:1 for a focus ring and 4.5:1 for text is the whole reason `need` exists.
   * A single threshold would either fail every ring on the board or pass text
   * nobody can read.
   */
  it('holds a non-text pair to 3:1 and text to 4.5:1', () => {
    const values = { a: '#767676', b: WHITE }

    expect(
      checkContrast(values, [{ foreground: 'a', background: 'b', label: 'x', need: 'text' }])[0]
        ?.state,
    ).toBe('pass')
    expect(
      checkContrast(values, [
        { foreground: 'a', background: 'b', label: 'x', need: 'non-text' },
      ])[0]?.state,
    ).toBe('pass')

    /* Between the two thresholds: passes as a ring, fails as body text. */
    const between = { a: '#949494', b: WHITE }
    expect(
      checkContrast(between, [{ foreground: 'a', background: 'b', label: 'x', need: 'text' }])[0]
        ?.state,
    ).toBe('fail')
    expect(
      checkContrast(between, [
        { foreground: 'a', background: 'b', label: 'x', need: 'non-text' },
      ])[0]?.state,
    ).toBe('pass')
  })
})

describe('contrastChecksFor', () => {
  it('returns every pair the token takes part in, on either side', () => {
    const pairs = contrastChecksFor('primary', LIGHT_TOKENS).map((check) => check.pair)

    expect(pairs.some((pair) => pair.background === 'primary')).toBe(true)
    expect(
      pairs.every((pair) => pair.foreground === 'primary' || pair.background === 'primary'),
    ).toBe(true)
  })

  it('returns nothing for a token no pair mentions', () => {
    expect(contrastChecksFor('radius', LIGHT_TOKENS)).toEqual([])
  })
})

describe('the pairs themselves', () => {
  /*
   * A pair naming a token the theme layer does not have is a row that can never
   * be measured and a link in the panel that goes nowhere. Cheap to state, and
   * the failure it catches is a typo.
   */
  it('name only tokens the theme layer declares', () => {
    const names = new Set<string>(TOKEN_NAMES)

    for (const pair of CONTRAST_PAIRS) {
      expect(names.has(pair.foreground), `${pair.foreground} is not a token`).toBe(true)
      expect(names.has(pair.background), `${pair.background} is not a token`).toBe(true)
    }
  })

  it('lists each combination once', () => {
    const seen = CONTRAST_PAIRS.map((pair) => `${pair.foreground}/${pair.background}`)
    expect(new Set(seen).size).toBe(seen.length)
  })
})

describe('every installed theme', () => {
  const themes = Object.values(forumConfig.themes).flatMap((installed) => [
    [`${installed.key} (light)`, installed.tokens.light] as const,
    [`${installed.key} (dark)`, installed.tokens.dark] as const,
  ])

  it.each(themes)('passes every pair — %s', (_name, values) => {
    const failures = checkContrast(values)
      .filter((check) => check.state !== 'pass')
      .map(
        (check) =>
          `${check.pair.foreground} on ${check.pair.background}: ${
            check.ratio === null ? 'unmeasurable' : formatRatio(check.ratio)
          }, needs ${check.required}:1`,
      )

    expect(failures).toEqual([])
  })

  /*
   * The registry really is being read. A `themes` map this test found empty
   * would pass every assertion above by having nothing to assert, which is the
   * failure mode of every "we run it over all of them" suite.
   */
  it('finds more than one theme to check', () => {
    expect(themes.length).toBeGreaterThan(2)
  })
})

describe('presentation', () => {
  it('drops trailing zeroes from a ratio without lying about precision', () => {
    expect(formatRatio(21)).toBe('21:1')
    expect(formatRatio(4.5)).toBe('4.5:1')
    expect(formatRatio(4.567)).toBe('4.57:1')
  })

  it('grades text at 7:1 and 4.5:1', () => {
    expect(contrastGrade(7.1, 'text')).toBe('AAA')
    expect(contrastGrade(4.6, 'text')).toBe('AA')
    expect(contrastGrade(4.4, 'text')).toBe('Fails')
  })

  /*
   * WCAG defines no enhanced level for a focus ring or a field's edge, so a
   * non-text pair tops out at AA. Claiming AAA for one would be inventing a
   * grade the specification does not have.
   */
  it('never grades a non-text pair AAA', () => {
    expect(contrastGrade(21, 'non-text')).toBe('AA')
    expect(contrastGrade(2.9, 'non-text')).toBe('Fails')
  })
})
