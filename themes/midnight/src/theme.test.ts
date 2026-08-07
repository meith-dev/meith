import {
  DARK_TOKENS as DEFAULT_DARK,
  LIGHT_TOKENS as DEFAULT_LIGHT,
  defaultTheme,
} from '@meith/theme-default'
import { assertThemeContract, resolveTheme, SLOT_NAMES } from '@meith/theme-kit'
import { describe, expect, it } from 'vitest'

import { midnightTheme } from './theme'
import { DARK_TOKENS, LIGHT_TOKENS } from './tokens'

/**
 * F78 — what is true of *this* theme.
 *
 * The rendering-contract suite (`apps/forum/src/theme/contract.test.ts`) already
 * drives midnight through every stable slot, because it reads the theme list out
 * of `forum.config.ts` rather than a constant. What is here is what that suite
 * cannot see: the inheritance chain, the token contract, and the two pairs of
 * slots that have to be overridden together.
 */
describe('the midnight theme', () => {
  it('satisfies the theme-kit contract', () => {
    expect(assertThemeContract(resolveTheme(midnightTheme)).missing).toEqual([])
  })

  it('inherits from the default theme rather than copying it', () => {
    expect(resolveTheme(midnightTheme).chain).toEqual(['midnight', 'default'])
  })

  /*
   * The point of inheriting. The theme-kit contract promises a minor release may add a
   * slot; midnight fills the surfaces that carry its look and gets the rest
   * from its parent, so a slot added tomorrow renders here without this package
   * being touched. A copy would have a hole in it and nothing would say so.
   *
   * The count moves when a slot is added — `LatestThreads` and `LatestPosts`
   * took it from twenty to twenty-two — and that is the assertion doing its
   * job: it forces whoever adds one to decide whether this theme overrides it
   * or inherits it, rather than letting the answer be whichever happened.
   */
  it('fills the surfaces that carry the look and inherits the rest', () => {
    const own = Object.keys(midnightTheme.slots)
    expect(own).toHaveLength(22)
    expect(own).toContain('PostBit')
    expect(own).not.toContain('ErrorNotice')

    /* Inherited slots resolve to the default theme's own components. */
    const resolved = resolveTheme(midnightTheme)
    expect(resolved.slots.ErrorNotice).toBe(defaultTheme.slots.ErrorNotice)
    expect(resolved.slots.PostBit).not.toBe(defaultTheme.slots.PostBit)
  })

  /*
   * The coupling that lives inside a theme rather than in the contract.
   *
   * Midnight's rows are `<tr>`, so the slots that receive rendered rows must
   * supply the `<table>`. Overriding one and inheriting the other produces
   * markup browsers silently unwrap — nothing throws, the rows simply vanish
   * from the layout. Pinned as a pair so a future edit that drops one is a
   * failure rather than a discovery.
   */
  it.each([
    ['ForumRow', 'CategoryBlock'],
    ['ThreadRow', 'ForumDisplay'],
  ])('overrides %s together with its container %s', (row, container) => {
    const own = Object.keys(midnightTheme.slots)
    expect(own).toContain(row)
    expect(own).toContain(container)
  })

  it('fills nothing the registry does not name', () => {
    for (const name of Object.keys(midnightTheme.slots)) {
      expect(SLOT_NAMES).toContain(name)
    }
  })
})

describe('the midnight palette', () => {
  /*
   * The names are the contract, not the values.
   *
   * `globals.css` maps every token to a Tailwind utility, so a theme missing one
   * has utilities pointing at nothing — and nothing fails: the build is green
   * and the page renders unstyled in that one respect. Both directions, because
   * an extra token is a value the stylesheet will never read and is usually a
   * typo of a real one.
   */
  it('declares exactly the tokens the default theme does', () => {
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(Object.keys(DEFAULT_LIGHT).sort())
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(DEFAULT_DARK).sort())
  })

  /*
   * Materially different, asserted rather than claimed. A "second theme" whose
   * palette is the first one's is a colour scheme, and the acceptance criterion
   * says otherwise — so the overlap is measured. Both schemes, because matching
   * on one of them is how a dark-only reskin sneaks through.
   */
  it('shares no colour value with the default theme', () => {
    const shared = (a: Record<string, string>, b: Record<string, string>): string[] =>
      Object.keys(a).filter(
        (name) =>
          a[name] === b[name] &&
          /*
           * Geometry, the font stacks and the shadow's *shape* are not colours;
           * they may legitimately match. `shadow-tint` is deliberately not on
           * this list — it is a colour, and two themes agreeing on it would be
           * the same reskin-in-disguise the rest of this test is looking for.
           */
          ![
            'radius',
            'density-unit',
            'font-mono-stack',
            'font-sans-stack',
            'elevation',
          ].includes(name),
      )

    expect(shared(LIGHT_TOKENS, DEFAULT_LIGHT)).toEqual([])
    expect(shared(DARK_TOKENS, DEFAULT_DARK)).toEqual([])
  })

  it('differs from the default theme in geometry too', () => {
    expect(LIGHT_TOKENS.radius).not.toBe(DEFAULT_LIGHT.radius)
    expect(LIGHT_TOKENS['density-unit']).not.toBe(DEFAULT_LIGHT['density-unit'])
  })
})
