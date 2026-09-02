import type { Translator } from '@meith/theme-kit'

import type { HookRuntime } from './runtime'

export interface RegionSpec {
  readonly purpose: string
  readonly context: string
}

export const PLUGIN_REGIONS = {
  'header.notice': {
    purpose: 'Directly below the board header, above the page body. Board-wide notices.',
    context: 'The viewer, with the reader’s locale and a translator.',
  },
  'index.footer': {
    purpose: 'The bottom of the board index, below the statistics block.',
    context: 'The viewer, with the reader’s locale and a translator.',
  },
  'postbit.badges': {
    purpose:
      'Beside a post author’s name. Runs once per post on every thread page — the ' +
      'most expensive region on the board, and the one to keep trivial.',
    context:
      'The viewer, the post id and the author id, with the reader’s locale and a translator.',
  },
  'postbit.footer': {
    purpose: 'Below a post body, above its actions.',
    context:
      'The viewer, the post id and the author id, with the reader’s locale and a translator.',
  },
  'thread.header': {
    purpose:
      'Above the first post of a thread, below its title. Runs once per thread page, ' +
      'so unlike postbit.* it can afford to read from the plugin’s own tables.',
    context:
      'The viewer, the thread id and the thread author’s id, with the reader’s locale and ' +
      'a translator.',
  },
  'profile.panel': {
    purpose: 'A panel on a member’s profile, below the standard fields.',
    context: 'The viewer and the profile’s member id, with the reader’s locale and a translator.',
  },
  'admin.dashboard': {
    purpose: 'A card on the admin dashboard. Only rendered for administrators.',
    context: 'The viewer, with the reader’s locale and a translator.',
  },
} as const satisfies Readonly<Record<string, RegionSpec>>

export type PluginRegion = keyof typeof PLUGIN_REGIONS

export const REGION_NAMES = Object.keys(PLUGIN_REGIONS) as readonly PluginRegion[]

export function isPluginRegion(value: string): value is PluginRegion {
  return Object.hasOwn(PLUGIN_REGIONS, value)
}

export interface PluginRegionContext {
  readonly region: PluginRegion
  readonly viewer: { readonly userId: number | null; readonly isGuest: boolean }
  readonly subjectId: number | null
  readonly authorId: number | null
  readonly locale: string
  readonly t: Translator
  readonly runtime: HookRuntime
}
