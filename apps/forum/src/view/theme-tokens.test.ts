/**
 * The token descriptions the editor is built from.
 *
 * The colour conversions that used to live here went with the native hex
 * control they existed for; `@/view/oklch` and its own tests replaced both.
 */
import { describe, expect, it } from 'vitest'

import { LIGHT_TOKENS, TOKEN_NAMES } from '@meith/theme-default'

import {
  BRAND_PRESETS,
  BRAND_TOKENS,
  groupTokens,
  isSchemeIndependent,
  tokenMeta,
} from './theme-tokens'

describe('groupTokens', () => {
  const tokens = TOKEN_NAMES.map((name) => ({ name }))

  it('places every token the default theme declares', () => {
    /*
     * The property that matters: a token this file forgot to describe must
     * still be editable. It lands in "Other" under its own name rather than
     * vanishing from a screen that claims to show everything the theme has.
     */
    const placed = groupTokens(tokens).flatMap((group) => group.tokens.map((t) => t.name))

    expect([...placed].sort()).toEqual([...TOKEN_NAMES].sort())
  })

  it('describes every one of them, so nothing lands in "Other" today', () => {
    expect(groupTokens(tokens).map((group) => group.title)).not.toContain('Other')
  })

  it('offers only tokens the theme actually has', () => {
    const groups = groupTokens([{ name: 'primary' }])
    expect(groups.flatMap((group) => group.tokens.map((t) => t.name))).toEqual(['primary'])
  })

  it('keeps an undescribed token rather than dropping it', () => {
    const groups = groupTokens([{ name: 'primary' }, { name: 'invented-by-a-theme' }])
    const other = groups.find((group) => group.title === 'Other')

    expect(other?.tokens.map((t) => t.name)).toEqual(['invented-by-a-theme'])
  })
})

describe('token kinds', () => {
  /*
   * The kind decides the control: a colour gets two fields and a picker, and
   * anything else gets one field, because "light" and "dark" corner radii are
   * not a thing anybody wants and offering them is two chances to disagree with
   * yourself.
   */
  it('marks geometry, the font stacks and the shadow shape as scheme-independent', () => {
    for (const name of [
      'radius',
      'density-unit',
      'font-mono-stack',
      'font-sans-stack',
      'elevation',
    ]) {
      expect(isSchemeIndependent(name), name).toBe(true)
    }
  })

  /*
   * The list above is this file's opinion; `SCHEME_INDEPENDENT_TOKENS` is the
   * theme package's, and it decides what `.dark` may omit. They are checked
   * against each other in `styles/tokens.test.ts` — the pair disagreeing is a
   * silent failure in both directions, so it is asserted where both are already
   * imported rather than duplicated here.
   */

  it('marks every colour token as scheme-dependent', () => {
    for (const name of [
      'primary',
      'primary-hover',
      'surface',
      'shadow-tint',
      'background',
      'thread-locked',
      'group-admin',
    ]) {
      expect(isSchemeIndependent(name), name).toBe(false)
    }
  })

  it('falls back to the token name for anything undescribed', () => {
    expect(tokenMeta('invented').label).toBe('invented')
  })
})

describe('BRAND_PRESETS', () => {
  /*
   * A preset that named a token the theme does not declare would be refused by
   * F26's validator on save — after the operator had pressed it, watched the
   * preview change, and pressed Save. Caught here instead.
   */
  it('names only tokens the default theme declares', () => {
    for (const preset of BRAND_PRESETS) {
      for (const name of [...Object.keys(preset.light), ...Object.keys(preset.dark)]) {
        expect(LIGHT_TOKENS, `${preset.key}/${name}`).toHaveProperty(name)
      }
    }
  })

  /*
   * Both schemes, always. The whole reason presets exist is that applying one
   * colour to light and dark alike is the mistake this editor was rebuilt to
   * stop somebody making by hand.
   *
   * Every brand token rather than `primary` alone: a preset that moved the fill
   * and left the hover step identical across the schemes would pass the old
   * spelling of this test while giving a dark-mode board a hover state that
   * goes the wrong way.
   */
  it('sets a different value in each scheme', () => {
    for (const preset of BRAND_PRESETS) {
      expect(Object.keys(preset.dark), preset.key).toEqual(Object.keys(preset.light))
      for (const name of BRAND_TOKENS) {
        expect(preset.dark[name], `${preset.key}/${name}`).not.toBe(preset.light[name])
      }
    }
  })

  /*
   * A preset sets the *whole* brand or it is worse than no preset.
   *
   * `primary-hover` is why this exists. Before it was a token the filled button
   * faded itself with `hover:opacity-90`, so a preset had three tokens to set
   * and there was nothing to forget. Now there are four, and a preset missing
   * one leaves a board whose button is the new brand and whose hover state is
   * still the old one — visible only on hover, on one control, which is how it
   * would have survived review.
   */
  it('sets every brand token', () => {
    for (const preset of BRAND_PRESETS) {
      for (const scheme of ['light', 'dark'] as const) {
        expect(Object.keys(preset[scheme]).sort(), `${preset.key}/${scheme}`).toEqual(
          [...BRAND_TOKENS].sort(),
        )
      }
    }
  })

  it('has no duplicate keys', () => {
    const keys = BRAND_PRESETS.map((preset) => preset.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
