/**
 * F64's view model.
 *
 * Pure, and the whole screen is a function of it. What is worth pinning:
 * a search spans every group, browsing shows one, advanced settings are hidden
 * until asked for and *counted* while they are, and a secret's value never
 * reaches the model at all.
 */
import { describe, expect, it } from 'vitest'

import { SETTING_DEFINITIONS, SettingsSnapshot } from '@meith/settings'

import { buildAdminSettingsModel, settingsHref } from './admin-settings'

function model(input: Parameters<typeof buildAdminSettingsModel>[0] | Record<string, unknown> = {}) {
  return buildAdminSettingsModel({
    snapshot: SettingsSnapshot.fromOverrides(new Map()),
    ...(input as object),
  })
}

function keysOf(built: ReturnType<typeof buildAdminSettingsModel>): string[] {
  return built.groups.flatMap((group) => group.settings.map((setting) => setting.key))
}

describe('browsing', () => {
  it('shows one group at a time, defaulting to the first', () => {
    const built = model()
    expect(built.activeGroup).toBe('board')
    expect(built.groups).toHaveLength(1)
    expect(keysOf(built).every((key) => key.startsWith('board.'))).toBe(true)
  })

  it('follows the requested group', () => {
    expect(model({ group: 'posting' }).activeGroup).toBe('posting')
  })

  it('ignores a group that does not exist rather than showing nothing', () => {
    /*
     * A URL is editable and a bookmark outlives a release. Falling back to the
     * first group beats an empty screen that looks like a broken panel.
     */
    expect(model({ group: 'nonsense' }).activeGroup).toBe('board')
  })

  it('offers every group as a tab whatever is being shown', () => {
    expect(model({ group: 'security' }).tabs).toHaveLength(8)
  })
})

describe('searching', () => {
  it('spans every group, and selects none', () => {
    /*
     * Filtering to a group *and* a term would mean somebody who typed a word
     * and saw nothing had to work out they were also filtered — which is how a
     * search box gets called broken. Kills the mutant that keeps the group.
     */
    const built = model({ query: 'flood' })
    expect(built.activeGroup).toBeNull()
    expect(new Set(built.groups.map((g) => g.group)).size).toBeGreaterThan(1)
  })

  it('matches the description, not only the key or label', () => {
    /*
     * An operator looking for "how long before somebody is locked out" types
     * words from the description, because that is the text written for them.
     */
    /* "outgoing" appears in `board.name`'s description and in no key or label. */
    const built = model({ query: 'outgoing' })
    expect(keysOf(built)).toContain('board.name')
  })

  it('is case-insensitive and trimmed', () => {
    expect(keysOf(model({ query: '  FLOOD  ' }))).toEqual(keysOf(model({ query: 'flood' })))
  })

  it('leaves out a group with no hits rather than showing an empty heading', () => {
    const built = model({ query: 'reputation' })
    expect(built.groups.every((group) => group.settings.length > 0)).toBe(true)
  })

  it('finds nothing for nonsense, and says so with an empty model', () => {
    const built = model({ query: 'zzzzz-not-a-setting' })
    expect(built.groups).toEqual([])
    expect(built.total).toBe(0)
  })
})

describe('advanced settings', () => {
  it('are hidden by default, and counted while they are', () => {
    /*
     * Counted rather than silently dropped: a screen that hides part of itself
     * without saying so is one an operator will believe is missing a setting.
     */
    const built = model({ group: 'security' })
    expect(built.hiddenAdvanced).toBeGreaterThan(0)
    expect(keysOf(built)).not.toContain('security.lockout_minutes')
  })

  it('appear when asked for', () => {
    const built = model({ group: 'security', advanced: true })
    expect(built.hiddenAdvanced).toBe(0)
    expect(keysOf(built)).toContain('security.lockout_minutes')
  })

  it('are counted only within what the current filter would have shown', () => {
    /*
     * Kills the mutant that counts every advanced setting on the board: an
     * operator on the posting group being told "4 advanced settings are hidden"
     * would go looking for four settings that are not there.
     */
    const built = model({ group: 'posting' })
    expect(built.hiddenAdvanced).toBe(0)
  })
})

describe('values', () => {
  it('carries the current value as a form holds it', () => {
    const snapshot = SettingsSnapshot.fromOverrides(new Map([['board.name', 'Test board']]))
    const built = buildAdminSettingsModel({ snapshot })
    const name = built.groups[0]?.settings.find((s) => s.key === 'board.name')

    expect(name?.value).toBe('Test board')
    expect(name?.isDefault).toBe(false)
  })

  it('marks an untouched setting as default', () => {
    const built = model()
    expect(built.groups[0]?.settings.every((setting) => setting.isDefault)).toBe(true)
  })

  it('never puts a secret’s value in the model', () => {
    /*
     * The model is rendered into HTML. A secret that reached it would be in the
     * page source of every administrator's browser — and in their history, and
     * in any proxy that logged it.
     */
    const secret = SETTING_DEFINITIONS.find((d) => d.secret === true)
    if (secret === undefined) {
      /* No stored secrets in this build. The rule still has to hold, and
         `fields.test.ts` proves the field kind; there is nothing to render. */
      expect(secret).toBeUndefined()
      return
    }

    const built = model({ group: secret.group, advanced: true })
    expect(built.groups[0]?.settings.find((s) => s.key === secret.key)?.value).toBe('')
  })

  it('reads a boolean as checked rather than as a string', () => {
    const snapshot = SettingsSnapshot.fromOverrides(new Map([['search.enabled', 'false']]))
    const built = buildAdminSettingsModel({ snapshot, group: 'search' })
    const enabled = built.groups[0]?.settings.find((s) => s.key === 'search.enabled')

    expect(enabled?.checked).toBe(false)
    expect(enabled?.field.kind).toBe('boolean')
  })
})

describe('settingsHref', () => {
  it('drops the group when there is a search, because a search spans them', () => {
    expect(settingsHref({ group: 'posting', query: 'flood' })).toBe(
      '/admin/settings?q=flood',
    )
  })

  it('keeps the advanced flag through every other change', () => {
    /*
     * An operator who asked for advanced settings and then changed group should
     * not have to ask again. Kills the mutant that drops it.
     */
    expect(settingsHref({ group: 'security', advanced: true })).toBe(
      '/admin/settings?group=security&advanced=1',
    )
  })

  it('is the bare path when nothing is filtered', () => {
    expect(settingsHref({})).toBe('/admin/settings')
  })
})
