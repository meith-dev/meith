import type { SettingGroup } from '@meith/settings'

export const GROUP_LABELS: Record<SettingGroup, string> = {
  board: 'Board',
  registration: 'Registration',
  posting: 'Posting',
  display: 'Display',
  search: 'Search',
  mail: 'Mail',
  reputation: 'Reputation',
  security: 'Security',
  antispam: 'Anti-spam',
}

export const GROUP_ORDER: readonly SettingGroup[] = [
  'board',
  'registration',
  'posting',
  'display',
  'search',
  'reputation',
  'mail',
  'security',
  'antispam',
]

export const DEFAULT_SETTING_GROUP: SettingGroup = GROUP_ORDER[0]!

export const SETTING_GROUP_NAV: readonly {
  readonly href: string
  readonly title: string
}[] = GROUP_ORDER.map((group) => ({
  href: `/admin/settings?group=${group}`,
  title: GROUP_LABELS[group],
}))
