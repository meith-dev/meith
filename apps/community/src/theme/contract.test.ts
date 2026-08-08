import {
  SLOT_STABILITY,
  SLOT_NAMES,
  assertThemeContract,
  requireSlot,
  resolveTheme,
  type SlotName,
  type ThemeDefinition,
} from '@meith/theme-kit'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import forumConfig from '../../community.config'

import { SLOT_FIXTURES } from './contract.fixture'

/**
 * F77 — the rendering contract, run against every theme the board has installed.
 *
 * The freeze says a stable slot's props do not change. This is the other half:
 * that a theme handed those props renders something a reader can use. Neither
 * half is much good alone — a frozen contract nobody renders is the state
 * `SearchForm` was in until this feature, and a theme that renders beautifully
 * against props it invented is F78's most likely failure mode.
 *
 * **The list of themes comes from `community.config.ts`**, not from a constant here.
 * Registering a theme is therefore also enrolling it in this suite, which is the
 * only version of "CI covers the second theme" that cannot be forgotten — F78
 * adds one line to the config and inherits every assertion below.
 *
 * What is asserted is deliberately about *contract*, not appearance: no theme is
 * required to look like another, and the suite would be worthless — actively
 * harmful — if passing it meant matching the default theme's markup.
 */

/** Every theme in the registry, whether or not it is the active one. */
const themes: readonly { key: string; definition: ThemeDefinition }[] = Object.values(
  forumConfig.themes,
)
  .filter((installed) => installed.theme !== undefined)
  .map((installed) => ({
    key: installed.key,
    definition: installed.theme as ThemeDefinition,
  }))

/**
 * Render a slot to HTML.
 *
 * A server slot may be `async`, which `renderToStaticMarkup` cannot render — so
 * the component is called directly and its result awaited before rendering. That
 * covers one level of async, which is all a slot can have: a slot never renders
 * another slot.
 */
async function renderSlot(
  definition: ThemeDefinition,
  name: SlotName,
  model: object,
): Promise<string> {
  const Slot = requireSlot(resolveTheme(definition), name) as (props: object) => ReactNode
  const node = await Slot(model)
  return renderToStaticMarkup(createElement(() => node as never))
}

describe('the fixture set', () => {
  it('covers every slot the contract requires, and nothing else', () => {
    const covered = Object.keys(SLOT_FIXTURES).sort()
    const required = SLOT_NAMES.filter((name) => SLOT_STABILITY[name] !== 'provisional')
    expect(covered).toEqual([...required].sort())
  })

  it('finds at least one registered theme', () => {
    /*
     * A filter that silently matched nothing would make every test below pass
     * by iterating an empty list — the classic vacuous green.
     */
    expect(themes.length).toBeGreaterThan(0)
  })
})

describe.each(themes)('theme "$key"', ({ definition }) => {
  it('satisfies the slot contract', () => {
    expect(assertThemeContract(resolveTheme(definition)).missing).toEqual([])
  })

  const cases = Object.entries(SLOT_FIXTURES).map(([name, fixture]) => ({
    name: name as SlotName,
    fixture: fixture as { model: object; requires: readonly string[] },
  }))

  it.each(cases)('renders $name', async ({ name, fixture }) => {
    const html = await renderSlot(definition, name, fixture.model)

    expect(html.length).toBeGreaterThan(0)

    for (const required of fixture.requires) {
      /*
       * The assertion names the slot and the missing string, because the failure
       * a theme author gets otherwise is "expected true to be false" against a
       * page of HTML.
       */
      expect(html, `${name} must render ${JSON.stringify(required)}`).toContain(required)
    }
  })

  /*
   * Three failures that look like nothing in a screenshot.
   *
   * `[object Object]` and `undefined` in the output are a model field rendered
   * whole or a field that does not exist — the symptom of a theme written
   * against an older version of a model, which is exactly what the freeze exists
   * to make impossible and what this catches in the meantime.
   *
   * `href=""` is a link that goes to the current page: it looks like a link,
   * takes a click, and does nothing.
   */
  it.each(
    Object.entries(SLOT_FIXTURES).map(([name, fixture]) => ({
      name: name as SlotName,
      fixture: fixture as { model: object },
    })),
  )('renders $name without a dropped or empty value', async ({ name, fixture }) => {
    const html = await renderSlot(definition, name, fixture.model)

    expect(html).not.toContain('[object Object]')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('href=""')
    expect(html).not.toContain('src=""')
  })

  /*
   * A theme ships no script. Every server slot renders on the server and ships
   * no JavaScript — `slot-kinds.mjs` proves the module is not a client
   * component, and this proves the markup does not smuggle one in through
   * `dangerouslySetInnerHTML` or a literal `<script>` element, neither of which
   * that checker looks at.
   *
   * An `\son[a-z]+=` clause was written here first and deleted: React strips
   * event handlers from static markup entirely, so an `onClick` added to a
   * server slot never appears in this string and the clause could not be killed
   * by any mutation (D10). It was also redundant — a handler that does anything
   * needs a client component, which is the other checker's job.
   */
  it('emits no script from a server slot', async () => {
    for (const [name, fixture] of Object.entries(SLOT_FIXTURES)) {
      if (SLOT_STABILITY[name as SlotName] === 'provisional') continue
      const html = await renderSlot(
        definition,
        name as SlotName,
        (fixture as { model: object }).model,
      )
      expect(html, `${name} emitted a script`).not.toMatch(/<script/i)
    }
  })
})
