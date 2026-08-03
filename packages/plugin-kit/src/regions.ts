/**
 * F79 — where a plugin may put markup.
 *
 * ## Regions are not theme slots, and the distinction is deliberate
 *
 * A theme owns its slots. If a plugin could fill one, an installed plugin would
 * decide what a post looks like, two plugins filling the same slot would have to
 * be resolved somehow, and a theme author would have no way to know what their
 * page will actually render. Themes and plugins would be competing for the same
 * surface.
 *
 * A **region** is the other arrangement: an explicit "plugins may add something
 * here" point that a *theme* chooses to render. The theme keeps control of where
 * plugin output appears and whether it appears at all; the plugin keeps control
 * of what it is. Several plugins contributing to one region compose by
 * concatenation in a deterministic order, which is a sane answer — unlike two
 * plugins both claiming to *be* the postbit.
 *
 * The list is short on purpose. Every region is a commitment: a theme that does
 * not render it silently drops plugin output, so adding one means asking every
 * theme to render it. Six is enough to place a badge, a notice, a panel and a
 * page footer, which is what plugin UI actually consists of.
 */

export interface RegionSpec {
  /** Where it is, in a sentence a theme author can act on. */
  readonly purpose: string
  /** What the region is handed. Documented per region because it differs. */
  readonly context: string
}

export const PLUGIN_REGIONS = {
  'header.notice': {
    purpose: 'Directly below the board header, above the page body. Board-wide notices.',
    context: 'The viewer.',
  },
  'index.footer': {
    purpose: 'The bottom of the board index, below the statistics block.',
    context: 'The viewer.',
  },
  'postbit.badges': {
    purpose:
      'Beside a post author’s name. Runs once per post on every thread page — the ' +
      'most expensive region on the board, and the one to keep trivial.',
    context: 'The viewer, the post id and the author id.',
  },
  'postbit.footer': {
    purpose: 'Below a post body, above its actions.',
    context: 'The viewer, the post id and the author id.',
  },
  'profile.panel': {
    purpose: 'A panel on a member’s profile, below the standard fields.',
    context: 'The viewer and the profile’s member id.',
  },
  'admin.dashboard': {
    purpose: 'A card on the admin dashboard. Only rendered for administrators.',
    context: 'The viewer.',
  },
} as const satisfies Readonly<Record<string, RegionSpec>>

export type PluginRegion = keyof typeof PLUGIN_REGIONS

export const REGION_NAMES = Object.keys(PLUGIN_REGIONS) as readonly PluginRegion[]

export function isPluginRegion(value: string): value is PluginRegion {
  return Object.hasOwn(PLUGIN_REGIONS, value)
}

/**
 * What a contribution is handed.
 *
 * One shape for every region rather than a type per region: a contribution is
 * markup, and a plugin that needs more than "who is looking and what is this
 * about" should be filtering a view model instead, where the data actually is.
 *
 * `subjectId` is the post, member or thread the region is attached to, and
 * `null` for the board-wide ones. Its meaning per region is in `PLUGIN_REGIONS`.
 */
export interface PluginRegionContext {
  readonly region: PluginRegion
  readonly viewer: { readonly userId: number | null; readonly isGuest: boolean }
  readonly subjectId: number | null
  /** For `postbit.*`: whose post it is. `null` elsewhere. */
  readonly authorId: number | null
}
