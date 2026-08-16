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
    expect(model({ group: 'nonsense' }).activeGroup).toBe('board')
  })

  it('offers every group as a tab whatever is being shown', () => {
    const groups = new Set(SETTING_DEFINITIONS.map((definition) => definition.group))
    expect(model({ group: 'security' }).tabs.map((tab) => tab.group).sort()).toEqual(
      [...groups].sort(),
    )
  })
})

describe('searching', () => {
  it('spans every group, and selects none', () => {
    const built = model({ query: 'flood' })
    expect(built.activeGroup).toBeNull()
    expect(new Set(built.groups.map((g) => g.group)).size).toBeGreaterThan(1)
  })

  it('matches the description, not only the key or label', () => {
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
    const secret = SETTING_DEFINITIONS.find((d) => d.secret === true)
    if (secret === undefined) {
      expect(secret).toBeUndefined()
      return
    }

    const built = model({ group: secret.group, advanced: true })
    expect(built.groups[0]?.settings.find((s) => s.key === secret.key)?.value).toBe('')
  })

  it('offers a way to clear a secret only once one is stored', () => {
    const empty = buildAdminSettingsModel({
      snapshot: SettingsSnapshot.fromOverrides(new Map()),
      group: 'mail',
      advanced: true,
    })
    const stored = buildAdminSettingsModel({
      snapshot: SettingsSnapshot.fromOverrides(new Map([['mail.http_token', 'live-key']])),
      group: 'mail',
      advanced: true,
    })

    const find = (built: ReturnType<typeof buildAdminSettingsModel>) =>
      built.groups[0]?.settings.find((s) => s.key === 'mail.http_token')

    expect(find(empty)?.clearName).toBeNull()
    expect(find(stored)?.clearName).toBe('mail.http_token__clear')
    expect(find(stored)?.value).toBe('')
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
    expect(settingsHref({ group: 'security', advanced: true })).toBe(
      '/admin/settings?group=security&advanced=1',
    )
  })

  it('is the bare path when nothing is filtered', () => {
    expect(settingsHref({})).toBe('/admin/settings')
  })
})
