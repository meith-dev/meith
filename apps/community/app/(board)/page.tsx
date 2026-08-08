import type { Metadata } from "next"

import { requireSlot } from "@meith/theme-kit"

import { boardRegion, filterView, viewerRef } from "@/server/plugin-view"

import { liveAnnouncements } from "@/server/announcements"
import { LATEST_REFRESH_SECONDS, renderLatestPanels } from "@/server/board-latest"
import { refreshLatestPanels } from "@/server/board-latest-actions"
import { LiveRegion } from "@/components/board/live-region"
import { getContainer } from "@/server/container"
import { getActor } from "@/server/context"
import { getViewerPreferences } from "@/server/viewer-preferences"
import { currentTheme } from "@/server/theme"
import { buildBoardIndexView } from "@/view/board-index"
import { identitiesFor } from "@/server/group-identity"
import { distinctUserIds } from "@/view/member-identity"
import { presenceRepository, readOnline } from "@/server/presence"
import { readTotals } from "@/server/stats"
import { buildBoardStatsModel, buildWhoIsOnlineModel } from "@/view/presence"

export const metadata: Metadata = { title: "Communities" }

/**
 * The board index (F29).
 *
 * The shape every page in this phase copies:
 *
 *   1. resolve the actor;
 *   2. read data through the container — never `@meith/db`, which
 *      dependency-cruiser enforces for everything under `app/`;
 *   3. build a view model with a pure function in `src/view/`;
 *   4. resolve slots and compose them.
 *
 * ## Two reads, and why not one
 *
 * `listListing()` returns every community with its counters in one query.
 * `visibleCommunityIds(actor)` is a constant three (it was a 32-query N+1 until D26).
 * Filtering in the database instead would mean expressing the four-level
 * permission resolution as SQL, which is the model F20/F21 exist to keep out of
 * queries — and the community table is tens of rows, not millions.
 *
 * ## Why this page is not cached
 *
 * Every row depends on who is asking: `visibleCommunityIds` differs per actor, and
 * F32's unread marks differ per user. `cachedGlobal` is for global data only, and
 * a cached permission-filtered index is precisely how a private community leaks —
 * the failure the caching harness was built to prevent. The cacheable part is the
 * community *structure*, which is already cached a layer down (F16).
 */
export default async function BoardIndexPage() {
  const actor = await getActor()
  const { communities, authorizer, readState } = getContainer()

  const [rows, visible, read, preferences] = await Promise.all([
    communities.listListing(),
    authorizer.visibleCommunityIds(actor),
    actor.userId === null || readState === null ? Promise.resolve(null) : readState.forUser(actor.userId),
    /* F57. One read per request, cached, and the board's defaults for a guest. */
    getViewerPreferences(),
  ])

  /*
   * F75. Both panels, and both are allowed to be absent: `readOnline` and
   * `readTotals` answer null on a board with no store and swallow their own
   * failures, because the index must render when statistics do not. Rendering
   * nothing beats rendering a zero — "0 members online" on a page somebody is
   * reading is visibly false.
   */
  const now = new Date()
  const [online, totals, record, latest] = await Promise.all([
    readOnline(actor, now),
    readTotals(),
    presenceRepository()?.readRecord() ?? Promise.resolve({ count: 0, at: null }),
    /*
     * The sidebar's live pair, already rendered — the same function the refresh
     * action calls, so the page and every subsequent minute produce the same
     * two panels from one implementation. Null on a board with no thread index,
     * exactly like the two above it.
     */
    renderLatestPanels(),
  ])

  /*
   * The group colour behind every name the index shows: one last-poster per
   * community, the newest member, and everybody in "who is online". One query for
   * all three rather than one per panel — they overlap heavily on a busy board,
   * and `identitiesFor` dedupes the ids before it asks.
   */
  const identities = await identitiesFor(
    distinctUserIds([
      ...rows.map((row) => row.lastPost?.userId ?? null),
      totals?.newestUserId ?? null,
      ...(online?.members ?? []).map((member) => member.userId),
    ]),
  )

  const view = buildBoardIndexView({
    rows,
    visibleCommunityIds: new Set(visible),
    ...(read === null ? {} : { unreadCommunityIds: read.unreadCommunityIds }),
    markAllReadAction: read === null ? null : '/api/read/all',
    /*
     * One clock for the whole render. Calling `new Date()` per row would let a
     * page straddle midnight and render "Today" above "Yesterday" for posts a
     * second apart.
     */
    now,
    timeZone: preferences.timezone,
    identities,
  })

  /*
   * F71. Permission-filtered in SQL against the same visible set the tree was
   * built from, so a board-wide notice reaches everybody and a community's reaches
   * only the people who can see that community.
   */
  const announcements = await liveAnnouncements({
    visibleCommunityIds: visible,
    now,
    timeZone: preferences.timezone,
  })

  const Announcement = requireSlot(await currentTheme(), "Announcement")
  const BoardIndex = requireSlot(await currentTheme(), "BoardIndex")
  const CategoryBlock = requireSlot(await currentTheme(), "CategoryBlock")
  const CommunityRow = requireSlot(await currentTheme(), "CommunityRow")
  const BoardStats = requireSlot(await currentTheme(), "BoardStats")
  const WhoIsOnline = requireSlot(await currentTheme(), "WhoIsOnline")

  /*
   * F80. `view.community-row` runs once per row, which is the reason its purpose
   * line says "keep it cheap" — a board index is fifty rows, and a plugin doing
   * a query in this filter turns one page into fifty.
   *
   * The rows are filtered before the blocks are rendered rather than inside the
   * JSX, so the await is a single pass over data the page already has rather
   * than fifty awaits interleaved with rendering.
   */
  const pluginContext = viewerRef(actor)

  /*
   * F80's wiring for F71's slot. Filtered before rendering rather than inside
   * the JSX, so the awaits are one pass over data the page already has.
   */
  const filteredAnnouncements = await Promise.all(
    announcements.map((announcement) =>
      filterView('view.announcement', announcement, pluginContext),
    ),
  )

  const blocks = await Promise.all(
    view.blocks.map(async (entry) => ({
      block: entry.block,
      communities: await Promise.all(
        entry.communities.map((community) => filterView('view.community-row', { community }, pluginContext)),
      ),
    })),
  )

  const stats =
    totals === null
      ? null
      : await filterView(
          'view.board-stats',
          buildBoardStatsModel({
            ...totals,
            now,
            timeZone: preferences.timezone,
            identities,
          }),
          pluginContext,
        )

  const whoIsOnline =
    online === null
      ? null
      : await filterView(
          'view.who-is-online',
          buildWhoIsOnlineModel({
            members: online.members,
            guestCount: online.guestCount,
            recordCount: record.count,
            recordAt: record.at,
            now,
            timeZone: preferences.timezone,
            identities,
          }),
          pluginContext,
        )

  const index = await filterView(
    'view.board-index',
    {
      ...view.index,
      regions: {
        categories: blocks.map((entry) => (
          <CategoryBlock key={entry.block.category.id} category={entry.block.category}>
            {entry.communities.map((row) => (
              <CommunityRow key={row.community.id} {...row} />
            ))}
          </CategoryBlock>
        )),
        stats: stats === null ? null : <BoardStats {...stats} />,
        online: whoIsOnline === null ? null : <WhoIsOnline {...whoIsOnline} />,
        /*
         * The island wraps the panels rather than replacing them: what is here
         * on the first response is the server's render, and with scripting off
         * that is all this ever is. The action it polls returns the same two
         * slots rendered again — see `board-latest-actions.ts` for why markup
         * rather than JSON, and why not `router.refresh()`.
         */
        latest:
          latest === null ? null : (
            <LiveRegion
              refresh={refreshLatestPanels}
              seconds={LATEST_REFRESH_SECONDS}
              label="Latest activity"
            >
              {latest}
            </LiveRegion>
          ),
        /* F80's `index.footer` region, rendered by the theme at the foot of the body. */
        plugins: boardRegion('index.footer', actor),
        /*
         * Absent rather than an empty fragment when there are none, so a theme
         * writing `{regions.announcements}` does not leave a gap on the page
         * every board without an announcement would see.
         */
        ...(announcements.length === 0
          ? {}
          : {
              announcements: filteredAnnouncements.map((announcement, position) => (
                <Announcement key={position} {...announcement} />
              )),
            }),
      },
    },
    pluginContext,
  )

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <BoardIndex {...index} />
    </main>
  )
}
