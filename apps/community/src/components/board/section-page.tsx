import 'server-only'

import type { ForumListingRow } from '@meith/forums'
import { requireSlot, slotCopy } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { identitiesFor } from '@/server/group-identity'
import { getTranslator } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildSectionView } from '@/view/board-index'
import { buildBreadcrumb } from '@/view/breadcrumb'
import { distinctUserIds } from '@/view/member-identity'

export async function SectionPage({
  category,
  rows,
  visibleForumIds,
  ownThreadsOnlyForumIds,
  unreadForumIds,
  homeLabel,
}: {
  category: ForumListingRow
  rows: readonly ForumListingRow[]
  visibleForumIds: ReadonlySet<number>
  ownThreadsOnlyForumIds?: ReadonlySet<number>
  unreadForumIds?: ReadonlySet<number>
  homeLabel?: string
}) {
  const actor = await getActor()
  const _preferences = await getViewerPreferences()
  const identities = await identitiesFor(
    distinctUserIds(rows.map((row) => row.lastPost?.userId ?? null)),
  )

  const section = buildSectionView({
    rows,
    visibleForumIds,
    ...(ownThreadsOnlyForumIds === undefined ? {} : { ownThreadsOnlyForumIds }),
    ...(unreadForumIds === undefined ? {} : { unreadForumIds }),
    categoryId: category.id,
    now: new Date(),
    t: await getTranslator(),
    identities,
  })

  const pluginContext = viewerRef(actor)
  const forums = await Promise.all(
    (section?.forums ?? []).map((forum) => filterView('view.forum-row', { forum }, pluginContext)),
  )

  const theme = await currentTheme()
  const Navigation = requireSlot(theme, 'Navigation')
  const BoardIndex = requireSlot(theme, 'BoardIndex')
  const CategoryBlock = requireSlot(theme, 'CategoryBlock')
  const ForumRow = requireSlot(theme, 'ForumRow')
  const translator = await getTranslator()

  const trail = buildBreadcrumb({
    forums: rows,
    forumId: category.id,
    visibleForumIds,
    ...(homeLabel === undefined ? {} : { homeLabel }),
  })

  const index = await filterView(
    'view.board-index',
    {
      markAllReadAction: null,
      regions: {
        categories:
          section === null ? null : (
            <CategoryBlock
              category={section.block.category}
              copy={slotCopy(theme, 'CategoryBlock', translator)}
            >
              {forums.map((row) => (
                <ForumRow
                  key={row.forum.id}
                  {...row}
                  copy={slotCopy(theme, 'ForumRow', translator)}
                />
              ))}
            </CategoryBlock>
          ),
        stats: null,
        online: null,
      },
    },
    pluginContext,
  )

  return (
    <>
      <Navigation items={trail} copy={slotCopy(theme, 'Navigation', translator)} />
      <main id="board-content" tabIndex={-1} className="flex-1">
        <BoardIndex {...index} copy={slotCopy(theme, 'BoardIndex', translator)} />
      </main>
    </>
  )
}
