import 'server-only'

/**
 * The index sidebar's live pair, from the query to the rendered region.
 *
 * Everything about "latest threads / latest posts" that is not markup lives
 * here, and it is one module rather than three because of who calls it: the
 * board index renders this region on the way out, and a Server Action renders
 * **the same region again** every minute for as long as somebody has the page
 * open. Two code paths producing the same two panels would drift, and the drift
 * would be invisible — the page would be right and the refresh would be subtly
 * wrong, or the other way round, and only for people who left a tab open.
 *
 * So `renderLatestPanels()` is the whole thing, and the page and the action
 * both call exactly it.
 *
 * ## Absent, rather than faked
 *
 * `latestRepository()` is null in fixture mode, the same refusal `readOnline`
 * and `readTotals` make on the same page (D38). A board with no thread index
 * renders an index with no sidebar rather than a sidebar with nothing in it,
 * and both are better than five invented rows. The reads swallow their own
 * failures for the same reason those two do: the index must render when the
 * sidebar cannot.
 *
 * ## The names cost one query, and it is not folded into the page's
 *
 * `BoardIndexPage` reads every group colour on the index in a single query and
 * says so. This asks for its own, because the refresh has no page around it to
 * ask on its behalf — and a function that needed one would be a function the
 * action could not call. One extra indexed lookup on the index, one on each
 * refresh, in exchange for a single implementation of the panels.
 */
import type { Actor } from '@meith/authorization'
import { contentScopeFrom } from '@meith/core'
import { PostgresLatestRepository, getDb, type LatestScope } from '@meith/db'
import { requireSlot } from '@meith/theme-kit'

import { buildLatestPostsModel, buildLatestThreadsModel } from '@/view/board-latest'
import { distinctUserIds } from '@/view/member-identity'

import { getContainer } from './container'
import { getActor } from './context'
import { identitiesFor } from './group-identity'
import { filterView, viewerRef } from './plugin-view'
import { currentTheme } from './theme'
import { getViewerPreferences } from './viewer-preferences'

/**
 * How many rows each panel shows.
 *
 * Five, because the panel is a sidebar and a sidebar is a glance. Ten would
 * push the board's statistics below the fold on a laptop, which is the thing
 * moving them into the sidebar was meant to stop.
 */
export const LATEST_ROWS = 5

/**
 * How often the region refreshes itself, in seconds.
 *
 * A minute. Fast enough that a board with a conversation happening on it feels
 * live, slow enough that a tab left open overnight costs the board sixty
 * queries an hour rather than seven hundred — and the island skips the tick
 * entirely while the tab is hidden, so an abandoned tab costs nothing at all.
 */
export const LATEST_REFRESH_SECONDS = 60

export function latestRepository(): PostgresLatestRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresLatestRepository(getDb())
    : null
}

/**
 * What this actor may see, in the shape the repository takes.
 *
 * The same scope search (F72) and discovery (F74) build, and deliberately built
 * again here rather than imported from one of them: each surface owns its own
 * scope so that narrowing one cannot silently widen another.
 */
export async function latestScopeFor(actor: Actor): Promise<LatestScope> {
  const { authorizer } = getContainer()
  const staff = actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    forumIds: await authorizer.forumIdsWhere(actor, 'thread.view'),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
  }
}

/**
 * The two panels, rendered, or `null` on a board that cannot answer.
 *
 * Both reads run together: they are independent, and the region cannot render
 * until both are back, so serialising them would put a round trip on the index
 * for nothing.
 */
export async function renderLatestPanels(): Promise<React.ReactNode> {
  const repo = latestRepository()
  if (repo === null) return null

  const actor = await getActor()
  const now = new Date()

  let threadRows
  let postRows
  try {
    const scope = await latestScopeFor(actor)
    ;[threadRows, postRows] = await Promise.all([
      repo.threads(LATEST_ROWS, scope),
      repo.posts(LATEST_ROWS, scope),
    ])
  } catch {
    /* See the header: the index must render when this does not. */
    return null
  }

  const preferences = await getViewerPreferences()
  const identities = await identitiesFor(
    distinctUserIds([
      ...threadRows.map((row) => row.authorUserId),
      ...postRows.map((row) => row.authorUserId),
    ]),
  )

  const theme = await currentTheme()
  const LatestThreads = requireSlot(theme, 'LatestThreads')
  const LatestPosts = requireSlot(theme, 'LatestPosts')

  const context = viewerRef(actor)
  const [threads, posts] = await Promise.all([
    filterView(
      'view.latest-threads',
      buildLatestThreadsModel({
        rows: threadRows,
        now,
        timeZone: preferences.timezone,
        identities,
      }),
      context,
    ),
    filterView(
      'view.latest-posts',
      buildLatestPostsModel({
        rows: postRows,
        now,
        timeZone: preferences.timezone,
        identities,
      }),
      context,
    ),
  ])

  return (
    <>
      <LatestThreads {...threads} />
      <LatestPosts {...posts} />
    </>
  )
}
