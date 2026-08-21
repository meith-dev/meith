import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { sourceTranslator } from '@meith/i18n'
import {
  assertThemeContract,
  requireSlot,
  resolveTheme,
  SLOT_NAMES,
  SLOT_STABILITY,
  type SlotName,
  slotCopy,
  slotKind,
  type ThemeDefinition,
} from '@meith/theme-kit'

import forumConfig from '../../community.config'
import { SLOT_FIXTURES } from './contract.fixture'

const themes: readonly { key: string; definition: ThemeDefinition }[] = Object.values(
  forumConfig.themes,
)
  .filter((installed) => installed.theme !== undefined)
  .map((installed) => ({
    key: installed.key,
    definition: installed.theme as ThemeDefinition,
  }))

const t = sourceTranslator({})

async function renderSlot(
  definition: ThemeDefinition,
  name: SlotName,
  model: object,
): Promise<string> {
  const resolved = resolveTheme(definition)
  const props = { ...model, copy: slotCopy(resolved, name, t) }

  if (slotKind(name) === 'client') {
    const Slot = requireSlot(resolved, name) as (props: object) => ReactNode
    return renderToStaticMarkup(createElement(Slot, props))
  }

  const Slot = requireSlot(resolved, name) as (props: object) => ReactNode | Promise<ReactNode>
  const node = await Slot(props)
  return renderToStaticMarkup(createElement(() => node as never))
}

describe('the fixture set', () => {
  it('covers every slot the contract requires, and nothing else', () => {
    const covered = Object.keys(SLOT_FIXTURES).sort()
    const required = SLOT_NAMES.filter((name) => SLOT_STABILITY[name] !== 'provisional')
    expect(covered).toEqual([...required].sort())
  })

  it('finds at least one registered theme', () => {
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
      expect(html, `${name} must render ${JSON.stringify(required)}`).toContain(required)
    }
  })

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

  it('emits no script from a server slot', async () => {
    for (const [name, fixture] of Object.entries(SLOT_FIXTURES)) {
      if (slotKind(name as SlotName) === 'client') continue
      const html = await renderSlot(
        definition,
        name as SlotName,
        (fixture as { model: object }).model,
      )
      expect(html, `${name} emitted a script`).not.toMatch(/<script/i)
    }
  })
})
