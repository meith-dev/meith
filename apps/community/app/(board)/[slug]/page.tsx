import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { acceptsThreads, canHoldThreads } from '@meith/forums'
import { requireSlot } from '@meith/theme-kit'

import { filterView, viewerRef } from '@/server/plugin-view'
import { InlineModerationForm } from '@/components/moderation/inline-moderation-form'
import { BOARD_MEASURE } from '@/components/shell/measure'
import { liveAnnouncements } from '@/server/announcements'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { moderatorTargetFor } from '@/server/modcp'
import { currentTheme } from '@/server/theme'
import { decodeForumCursor, encodeForumCursor } from '@/view/forum-cursor'
import { FollowForm } from '@/components/account/subscription-forms'
import { ViewTabs } from '@/components/shell/view-tabs'
import { getSettings } from '@/server/settings'
import { buildBreadcrumb } from '@/view/breadcrumb'
import { SectionPage } from '@/components/board/section-page'
import { buildForumDisplayView } from '@/view/forum-display'
import { identitiesFor } from '@/server/group-identity'
import { distinctUserIds } from '@/view/member-identity'
import { canonicalPath } from '@/view/metadata'
import { leadingId } from '@/view/slug-id'
import { buildSubscriptionsView } from '@/view/subscriptions'
import {
  INLINE_FORM_ID,
  anyInlineTool,
  inlineOutcomeNotice,
  selectionFor,
} from '@/view/inline-moderation'

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = leadingId(slug)
  if (id === null) return { title: 'Forum' }

  const actor = await getActor()
  const { forums, authorizer } = getContainer()

  const forum = await forums.findById(id)
  if (!forum || forum.type === 'link') return { title: 'Forum' }

  if (forum.type === 'category') {
    const visible = await authorizer.visibleForumIds(actor)
    if (!visible.includes(forum.id)) return { title: 'Forum' }
    return {
      title: forum.title,
      description: forum.description ?? `Forums in ${forum.title}.`,
      alternates: { canonical: canonicalPath({ path: `/${forum.id}-${forum.slug}`, page: 1 }) },
    }
  }

  const matrix = await authorizer.forumMatrix(actor, forum.id)
  if (
    !authorizer.can(actor, 'thread.view', { forumId: forum.id, forum: matrix })
  ) {
    return { title: 'Forum' }
  }

  const page = Number(query.page ?? '1')
  const canonical = canonicalPath({
    path: `/${forum.id}-${forum.slug}`,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  })
  const description = forum.description ?? `Discussions in ${forum.title}.`

  return {
    title: forum.title,
    description,
    alternates: {
      canonical,
      types: {
        'application/rss+xml': `/${forum.id}-${forum.slug}/feed.xml`,
      },
    },
    openGraph: {
      type: 'website',
      title: forum.title,
      description,
      url: canonical,
    },
    twitter: { card: 'summary', title: forum.title, description },
  }
}

export default async function ForumPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    after?: string
    page?: string
    sort?: string
    posted?: string
    did?: string
    n?: string
    refused?: string
    gone?: string
    skipped?: string
  }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = leadingId(slug)
  const after = decodeForumCursor(query.after)
  const sort = query.sort === 'rating' ? 'rating' : 'activity'
  const page = query.page === undefined ? 1 : Number(query.page)
  if (
    id === null ||
    after === null ||
    (after !== undefined && after.sort !== sort) ||
    !Number.isSafeInteger(page) ||
    page < 1
  )
    notFound()

  const actor = await getActor()
  const {
    forums,
    threads,
    authorizer,
    readState,
    threadWrites,
    inlineModeration,
  } = getContainer()
  const [rows, visible, read] = await Promise.all([
    forums.listListing(),
    authorizer.visibleForumIds(actor),
    actor.userId === null || readState === null
      ? Promise.resolve(null)
      : readState.forUser(actor.userId),
  ])
  const forum = rows.find((row) => row.id === id)
  if (!forum || !visible.includes(id)) notFound()

  if (forum.type === 'category' && !acceptsThreads(forum)) {
    return (
      <SectionPage
        category={forum}
        rows={rows}
        visibleForumIds={new Set(visible)}
        {...(read === null ? {} : { unreadForumIds: read.unreadForumIds })}
        homeLabel={(await getSettings()).get('board.name')}
      />
    )
  }

  if (!canHoldThreads(forum.type)) notFound()
  const matrix = await authorizer.forumMatrix(actor, id)
  if (!authorizer.can(actor, 'thread.view', { forumId: id, forum: matrix }))
    notFound()

  const inlineTarget = await moderatorTargetFor(actor, id, matrix)
  const scope = authorizer.contentScope(actor, inlineTarget)
  const preferences = await getViewerPreferences()
  const threadPage = await threads.listForum(id, {
    ...(after === undefined ? {} : { after }),
    limit: preferences.threadsPerPage,
    scope,
    sort,
  })
  const nextHref = threadPage.nextCursor
    ? `/${id}-${forum.slug}?after=${encodeForumCursor(threadPage.nextCursor)}&page=${page + 1}${sort === 'rating' ? '&sort=rating' : ''}`
    : null
  const canPost =
    threadWrites !== null &&
    acceptsThreads(forum) &&
    authorizer.can(actor, 'thread.post', { forumId: id, forum: matrix })

  const inlineRights = {
    approve:
      inlineModeration !== null &&
      authorizer.can(actor, 'content.approve', inlineTarget),
    lock:
      inlineModeration !== null &&
      authorizer.can(actor, 'thread.lock', inlineTarget),
    stick:
      inlineModeration !== null &&
      authorizer.can(actor, 'thread.stick', inlineTarget),
    move:
      inlineModeration !== null &&
      authorizer.can(actor, 'thread.move', inlineTarget),
    delete:
      inlineModeration !== null &&
      authorizer.can(actor, 'thread.delete', inlineTarget),
  }
  const inlineOffered = anyInlineTool(inlineRights)
  const inlineMoveTargets = !inlineRights.move
    ? []
    : (await authorizer.forumIdsWhere(actor, 'thread.move')).flatMap(
        (forumId) => {
          const row = rows.find((r) => r.id === forumId)
          return row === undefined || row.type !== 'forum' || row.id === id
            ? []
            : [{ id: row.id, title: row.title }]
        },
      )

  const identities = await identitiesFor(
    distinctUserIds(
      threadPage.rows.flatMap((row) => [row.authorUserId, row.lastPost?.userId ?? null]),
    ),
  )

  const view = buildForumDisplayView({
    forum,
    newThreadHref: canPost ? `/${id}-${forum.slug}/new` : null,
    subforums: rows.filter(
      (row) => row.parentId === id && visible.includes(row.id),
    ),
    page: threadPage,
    pageNumber: page,
    nextHref,
    readState: read,
    markReadAction: read === null ? null : `/api/read/forum/${id}`,
    now: new Date(),
    timeZone: preferences.timezone,
    identities,
  })

  const { subscriptions } = getContainer()
  const followMode =
    subscriptions === null || actor.userId === null
      ? null
      : await subscriptions.modeFor(actor.userId, 'forum', forum.id)
  const followOffered = subscriptions !== null && actor.userId !== null
  const followModes = buildSubscriptionsView({
    rows: [],
    now: new Date(),
  }).modes

  const announcements = await liveAnnouncements({
    visibleForumIds: visible,
    scope: id,
    now: new Date(),
    timeZone: preferences.timezone,
  })

  const Announcement = requireSlot(await currentTheme(), 'Announcement')
  const ForumDisplay = requireSlot(await currentTheme(), 'ForumDisplay')
  const Navigation = requireSlot(await currentTheme(), 'Navigation')
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const ThreadRow = requireSlot(await currentTheme(), 'ThreadRow')
  const SubforumList = requireSlot(await currentTheme(), 'SubforumList')
  const Pagination = requireSlot(await currentTheme(), 'Pagination')

  const notice =
    query.posted === 'moderated'
      ? 'Your thread was posted and is waiting for a moderator to approve it.'
      : inlineOutcomeNotice(query)

  const pluginContext = { ...viewerRef(actor), forumId: id }

  const filteredAnnouncements = await Promise.all(
    announcements.map((announcement) =>
      filterView('view.announcement', announcement, viewerRef(actor)),
    ),
  )

  const threadRows = await Promise.all(
    view.threads.map((thread) =>
      filterView(
        'view.thread-row',
        {
          thread,
          select: selectionFor(
            'thread',
            thread.id,
            `“${thread.title}”`,
            inlineOffered,
          ),
        },
        pluginContext,
      ),
    ),
  )

  const subforums =
    view.subforums === null
      ? null
      : await filterView('view.subforum-list', view.subforums, pluginContext)

  const pagination = await filterView(
    'view.pagination',
    view.pagination,
    viewerRef(actor),
  )

  const orderTabs = (
    <ViewTabs
      label="Thread order"
      tabs={[
        {
          href: `/${id}-${forum.slug}`,
          label: 'Latest',
          isCurrent: sort === 'activity',
        },
        {
          href: `/${id}-${forum.slug}?sort=rating`,
          label: 'Top rated',
          isCurrent: sort === 'rating',
        },
      ]}
    />
  )

  const forumDisplayModel = await filterView(
    'view.forum-display',
    {
      ...view.display,
      regions: {
        tools: orderTabs,
        ...(followOffered
          ? {
              afterContent: (
                <FollowForm
                  target="forum"
                  targetId={forum.id}
                  mode={followMode}
                  modes={followModes}
                  back={`/${id}-${forum.slug}`}
                  label="Follow this forum"
                />
              ),
            }
          : {}),
        subforums: subforums === null ? null : <SubforumList {...subforums} />,
        threads: threadRows.map((row) => (
          <ThreadRow key={row.thread.id} {...row} />
        )),
        pagination: <Pagination {...pagination} />,
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

  const trail = buildBreadcrumb({
    forums: rows,
    forumId: id,
    visibleForumIds: new Set(visible),
    homeLabel: (await getSettings()).get('board.name'),
  })

  return (
    <>
      <Navigation items={trail} />
      <main id="board-content" tabIndex={-1} className="flex-1">
      {notice !== null && (
        <div className={`${BOARD_MEASURE} pt-6`}>
          <Notice
            kind="info"
            message={notice}
            dismissHref={`/${id}-${forum.slug}`}
          />
        </div>
      )}
      <ForumDisplay {...forumDisplayModel} />
      {inlineOffered && (
        <InlineModerationForm
          formId={INLINE_FORM_ID}
          scope="threads"
          rights={inlineRights}
          moveTargets={inlineMoveTargets}
          returnTo={`/${id}-${forum.slug}`}
        />
      )}
      </main>
    </>
  )
}
