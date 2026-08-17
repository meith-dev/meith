import type { Metadata } from 'next'

import { requireSlot } from '@meith/theme-kit'

import { LiveRegion } from '@/components/board/live-region'
import { liveAnnouncements } from '@/server/announcements'
import { LATEST_REFRESH_SECONDS, renderLatestPanels } from '@/server/board-latest'
import { refreshLatestPanels } from '@/server/board-latest-actions'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { identitiesFor } from '@/server/group-identity'
import { getTranslator, tr } from '@/server/i18n'
import { boardRegion, filterView, viewerRef } from '@/server/plugin-view'
import { presenceRepository, readOnline } from '@/server/presence'
import { readTotals } from '@/server/stats'
import { currentTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildBoardIndexView } from '@/view/board-index'
import { distinctUserIds } from '@/view/member-identity'
import { buildBoardStatsModel, buildWhoIsOnlineModel } from '@/view/presence'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.forums') }
}

export default async function BoardIndexPage() {
  const actor = await getActor()
  const { forums, authorizer, readState } = getContainer()

  const [rows, listing, read, _preferences] = await Promise.all([
    forums.listListing(),
    authorizer.listingVisibility(actor),
    actor.userId === null || readState === null
      ? Promise.resolve(null)
      : readState.forUser(actor.userId),
    getViewerPreferences(),
  ])

  const now = new Date()

  const translator = await getTranslator()
  const [online, totals, record, latest] = await Promise.all([
    readOnline(actor, now),
    readTotals(),
    presenceRepository()?.readRecord() ?? Promise.resolve({ count: 0, at: null }),
    renderLatestPanels(),
  ])

  const identities = await identitiesFor(
    distinctUserIds([
      ...rows.map((row) => row.lastPost?.userId ?? null),
      totals?.newestUserId ?? null,
      ...(online?.members ?? []).map((member) => member.userId),
    ]),
  )

  const view = buildBoardIndexView({
    rows,
    visibleForumIds: new Set(listing.visibleForumIds),
    ownThreadsOnlyForumIds: new Set(listing.ownThreadsOnlyForumIds),
    ...(read === null ? {} : { unreadForumIds: read.unreadForumIds }),
    markAllReadAction: read === null ? null : '/api/read/all',
    now,
    t: translator,
    identities,
  })

  const announcements = await liveAnnouncements({
    visibleForumIds: listing.visibleForumIds,
    now,
    t: translator,
  })

  const Announcement = requireSlot(await currentTheme(), 'Announcement')
  const BoardIndex = requireSlot(await currentTheme(), 'BoardIndex')
  const CategoryBlock = requireSlot(await currentTheme(), 'CategoryBlock')
  const ForumRow = requireSlot(await currentTheme(), 'ForumRow')
  const BoardStats = requireSlot(await currentTheme(), 'BoardStats')
  const WhoIsOnline = requireSlot(await currentTheme(), 'WhoIsOnline')

  const pluginContext = viewerRef(actor)

  const filteredAnnouncements = await Promise.all(
    announcements.map((announcement) =>
      filterView('view.announcement', announcement, pluginContext),
    ),
  )

  const blocks = await Promise.all(
    view.blocks.map(async (entry) => ({
      block: entry.block,
      forums: await Promise.all(
        entry.forums.map((forum) => filterView('view.forum-row', { forum }, pluginContext)),
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
            t: translator,
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
            t: translator,
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
            {entry.forums.map((row) => (
              <ForumRow key={row.forum.id} {...row} />
            ))}
          </CategoryBlock>
        )),
        stats: stats === null ? null : <BoardStats {...stats} />,
        online: whoIsOnline === null ? null : <WhoIsOnline {...whoIsOnline} />,
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
        plugins: await boardRegion('index.footer', actor),
        ...(announcements.length === 0
          ? {}
          : {
              announcements: filteredAnnouncements.map((announcement, position) => (
                <Announcement
                  // biome-ignore lint/suspicious/noArrayIndexKey: the position is the identity — this list is server-rendered in order and never reordered on the client
                  key={position}
                  {...announcement}
                />
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
