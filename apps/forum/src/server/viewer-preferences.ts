import 'server-only'

/**
 * F57 — the viewer's own display settings, resolved once per request.
 *
 * Three things depend on this: the zone every timestamp is formatted in, and
 * the two page sizes. All three used to be constants — `view/time.ts` said UTC
 * and said so in the footer, `view/paging.ts` held two numbers — and the whole
 * point of F57 is that a member decides them.
 *
 * ## Why it is cached per request rather than read per page section
 *
 * A thread page formats a timestamp for every post, its breadcrumb and its
 * pagination; if each of those resolved the viewer, the row would be read a
 * dozen times. `React.cache` gives the same request one read, which is exactly
 * how `getActor()` already works (F17).
 *
 * ## Why it is not on the Actor
 *
 * `Actor` carries permissions and group ids, deliberately (F20): it is built by
 * the authorization source, it is cached against `permission_version`, and a
 * member changing their timezone must not invalidate a permission cache. These
 * are display preferences, they change often, and they matter to nothing that
 * makes a decision.
 *
 * ## Falling back is always safe
 *
 * A guest, fixture mode, or a failed read all produce the board defaults. This
 * is rendering, not authorisation — the worst outcome of getting it wrong is a
 * timestamp in the wrong zone, and taking a page down for that would be
 * absurd.
 */
import { cache } from 'react'

import { DEFAULT_TIMEZONE } from '@/view/time'

import { getContainer } from './container'
import { getActor } from './context'
import { getSettings } from './settings'

export interface ViewerPreferences {
  /** IANA zone name. `UTC` for a guest. */
  readonly timezone: string
  /** Already resolved against the board setting — never null at this point. */
  readonly postsPerPage: number
  readonly threadsPerPage: number
}

/**
 * The board's answers, for a guest or for a member who has overridden nothing.
 *
 * Read from F08's settings rather than from a constant, so an operator's
 * `display.posts_per_page` is the default everybody who has not chosen gets —
 * which is what makes storing `null` for "follow the board" meaningful.
 */
async function boardDefaults(): Promise<ViewerPreferences> {
  const settings = await getSettings()
  return {
    timezone: DEFAULT_TIMEZONE,
    postsPerPage: settings.get('display.posts_per_page'),
    threadsPerPage: settings.get('display.threads_per_page'),
  }
}

export const getViewerPreferences = cache(async (): Promise<ViewerPreferences> => {
  const defaults = await boardDefaults()

  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) return defaults

  try {
    const settings = await memberSettings.read(actor.userId)
    if (settings === null) return defaults

    return {
      timezone: settings.timezone,
      postsPerPage: settings.postsPerPage ?? defaults.postsPerPage,
      threadsPerPage: settings.threadsPerPage ?? defaults.threadsPerPage,
    }
  } catch {
    /* See the header: a preference is never worth failing a page over. */
    return defaults
  }
})
