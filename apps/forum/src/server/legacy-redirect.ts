import 'server-only'

/**
 * F86 — serving MyBB's URLs.
 *
 * The parsing is in `@meith/import` and table-tested there. This is the part
 * that cannot be: the setting, the id lookup, and the 301.
 *
 * ## 301, and why permanent is right
 *
 * A 301 tells crawlers and browsers to replace the old address. That is
 * correct — the old board is gone — and it is what transfers the accumulated
 * link equity that made the redirect worth building. It is also cached
 * aggressively by browsers, which is exactly why the *toggle* matters: a board
 * that switched the setting on by mistake and off again would have visitors
 * holding a permanent redirect for a while, so the default is off and turning it
 * on is a decision.
 *
 * ## A row that was never imported is a 404
 *
 * Not a redirect to the index. A soft 404 reads to a crawler as a real page, so
 * every broken old link would stay in the index forever pointing at a board's
 * front page — which is worse for the board than the honest answer and hides the
 * breakage from whoever could fix it.
 */
import { env } from '@meith/core'
import { getDb, resolveLegacyId } from '@meith/db'
import { legacyRedirectPath, resolveLegacyUrl, type LegacyTarget } from '@meith/import'
import { notFound, permanentRedirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { getContainer } from './container'
import { getSettings } from './settings'

type Kind = 'thread' | 'forum' | 'post' | 'user'

const LEGACY_KIND: Readonly<Record<Kind, 'thread' | 'forum' | 'post' | 'user'>> = {
  thread: 'thread',
  forum: 'forum',
  post: 'post',
  user: 'user',
}

/**
 * Handle one legacy URL, or 404.
 *
 * Every legacy route is three lines calling this, so the setting check and the
 * 404 behaviour cannot differ between them — which they would, given four route
 * files and one of them written later.
 */
export async function serveLegacyUrl(request: NextRequest): Promise<never> {
  const url = new URL(request.url)

  /*
   * The setting first, before any lookup. A board with the feature off must not
   * spend a query telling somebody it is off — and must answer exactly as it
   * would for any unknown path, so `/showthread.php` is not a fingerprint of
   * software this board is not running.
   */
  if (env.DATA_SOURCE !== 'postgres') notFound()
  const settings = await getSettings()
  if (settings.get('board.legacy_redirects') !== true) notFound()

  const target = resolveLegacyUrl(url.pathname, url.search)
  if (target === null) notFound()

  if (target.kind === 'home') permanentRedirect('/')

  const newId = await resolveLegacyId(getDb(), LEGACY_KIND[target.kind], target.legacyId)
  if (newId === null) notFound()

  const path = legacyRedirectPath(target, newId, await slugFor(target, newId))
  if (path === null) notFound()

  /*
   * `permanentRedirect`, not `redirect`. The latter is a 307 — temporary — and
   * its second argument is push-versus-replace rather than permanence, which is
   * an easy thing to reach for and get wrong. A temporary redirect transfers
   * none of the link equity that made this feature worth building, and a crawler
   * keeps asking the old address forever.
   */
  permanentRedirect(path)
}

/**
 * The slug for the destination, or `null`.
 *
 * Cosmetic — this board resolves by id and ignores the slug — so a lookup that
 * fails degrades to a placeholder rather than to a 404. Losing the pretty part
 * of a URL is not a reason to lose the redirect.
 */
async function slugFor(target: LegacyTarget, newId: number): Promise<string | null> {
  try {
    const { forums } = getContainer()
    if (target.kind === 'forum') {
      const all = await forums.listAll()
      return all.find((forum) => forum.id === newId)?.slug ?? null
    }
    return null
  } catch {
    return null
  }
}
