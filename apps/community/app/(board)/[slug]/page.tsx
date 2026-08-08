import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { hasAnyModeratorRight } from '@meith/authorization'
import { requireSlot } from '@meith/theme-kit'

import { filterView, viewerRef } from '@/server/plugin-view'
import { InlineModerationForm } from '@/components/moderation/inline-moderation-form'
import { BOARD_MEASURE } from '@/components/shell/measure'
import { liveAnnouncements } from '@/server/announcements'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { currentTheme } from '@/server/theme'
import { decodeCommunityCursor, encodeCommunityCursor } from '@/view/community-cursor'
import { FollowForm } from '@/components/account/subscription-forms'
import { ViewTabs } from '@/components/shell/view-tabs'
import { buildBreadcrumb } from '@/view/breadcrumb'
import { buildCommunityDisplayView } from '@/view/community-display'
import { identitiesFor } from '@/server/group-identity'
import { distinctUserIds } from '@/view/member-identity'
import { canonicalPath } from '@/view/metadata'
import { buildSubscriptionsView } from '@/view/subscriptions'
import {
  INLINE_FORM_ID,
  anyInlineTool,
  inlineOutcomeNotice,
  selectionFor,
} from '@/view/inline-moderation'

/**
 * F76 — one community's metadata, resolved in the viewer's scope.
 *
 * Same shape and same reasoning as the thread page's: it repeats the locate →
 * authorise sequence rather than trusting the page to have run it, because a
 * metadata function that assumed would put a private community's title into an
 * Open Graph card on any request where the two got out of step.
 *
 * The canonical carries the page number, so page 3 of a community is its own
 * document rather than a duplicate of page 1 — which is the single most common
 * way a board ends up with only its first pages in an index.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = communityId(slug)
  if (id === null) return { title: 'Community' }

  const actor = await getActor()
  const { communities, authorizer } = getContainer()

  const community = await communities.findById(id)
  if (!community || community.type !== 'community') return { title: 'Community' }

  const matrix = await authorizer.communityMatrix(actor, community.id)
  if (
    !authorizer.can(actor, 'thread.view', { communityId: community.id, community: matrix })
  ) {
    /* The same title an unknown community gets — see the thread page. */
    return { title: 'Community' }
  }

  const page = Number(query.page ?? '1')
  const canonical = canonicalPath({
    path: `/${community.id}-${community.slug}`,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  })
  const description = community.description ?? `Discussions in ${community.title}.`

  return {
    title: community.title,
    description,
    alternates: {
      canonical,
      types: {
        'application/rss+xml': `/${community.id}-${community.slug}/feed.xml`,
      },
    },
    openGraph: {
      type: 'website',
      title: community.title,
      description,
      url: canonical,
    },
    twitter: { card: 'summary', title: community.title, description },
  }
}

function communityId(value: string): number | null {
  const match = /^(\d+)(?:-|$)/.exec(value)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    after?: string
    page?: string
    sort?: string
    posted?: string
    /* F52's outcome, written by the inline-moderation action's redirect. */
    did?: string
    n?: string
    refused?: string
    gone?: string
    skipped?: string
  }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = communityId(slug)
  const after = decodeCommunityCursor(query.after)
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
    communities,
    threads,
    authorizer,
    readState,
    threadWrites,
    inlineModeration,
  } = getContainer()
  const [rows, visible, read] = await Promise.all([
    communities.listListing(),
    authorizer.visibleCommunityIds(actor),
    actor.userId === null || readState === null
      ? Promise.resolve(null)
      : readState.forUser(actor.userId),
  ])
  const community = rows.find((row) => row.id === id)
  if (!community || community.type !== 'community' || !visible.includes(id)) notFound()
  const matrix = await authorizer.communityMatrix(actor, id)
  if (!authorizer.can(actor, 'thread.view', { communityId: id, community: matrix }))
    notFound()

  /*
   * F47: what this actor may see, decided once by the permission model. The
   * listing does not know the word "visible" — it is handed the states it may
   * return, which is what makes "does this page leak the queue" a question with
   * one answer instead of one per query.
   */
  const scope = authorizer.contentScope(actor, { communityId: id, community: matrix })
  /*
   * F57. The member's own page size, falling back to the board setting and then
   * to the module constant — resolved *before* the read, because the page size
   * is the read's `limit` and a preference applied after the query would be a
   * setting that does nothing.
   */
  const preferences = await getViewerPreferences()
  const threadPage = await threads.listCommunity(id, {
    ...(after === undefined ? {} : { after }),
    limit: preferences.threadsPerPage,
    scope,
    sort,
  })
  const nextHref = threadPage.nextCursor
    ? `/${id}-${community.slug}?after=${encodeCommunityCursor(threadPage.nextCursor)}&page=${page + 1}${sort === 'rating' ? '&sort=rating' : ''}`
    : null
  /*
   * The composer link appears only when this actor may actually use it, and
   * only when the board can accept a post at all (fixture mode cannot). A link
   * to a page that 404s is worse than no link.
   */
  const canPost =
    threadWrites !== null &&
    community.type === 'community' &&
    authorizer.can(actor, 'thread.post', { communityId: id, community: matrix })

  /*
   * F52's tools, resolved once for this community. `moderatorRightsIn` reads the
   * appointment and `can()` turns it into a decision that also honours the
   * staff bypasses — the same route F50's bar takes, and the same route the
   * action takes again for itself. A checkbox is not authorisation.
   */
  const moderatorRights = await authorizer.moderatorRightsIn(actor, id)
  const inlineTarget = {
    communityId: id,
    community: matrix,
    moderatorRights,
    isCommunityModerator: hasAnyModeratorRight(moderatorRights),
  }
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
  /* Two extra queries for a moderator who may move, none for anybody else. */
  const inlineMoveTargets = !inlineRights.move
    ? []
    : (await authorizer.communityIdsWhere(actor, 'thread.move')).flatMap(
        (communityId) => {
          const row = rows.find((r) => r.id === communityId)
          return row === undefined || row.type !== 'community' || row.id === id
            ? []
            : [{ id: row.id, title: row.title }]
        },
      )

  /*
   * Two names per row — who started the thread, and who posted in it last — in
   * one query for the page rather than one per row.
   */
  const identities = await identitiesFor(
    distinctUserIds(
      threadPage.rows.flatMap((row) => [row.authorUserId, row.lastPost?.userId ?? null]),
    ),
  )

  const view = buildCommunityDisplayView({
    community,
    newThreadHref: canPost ? `/${id}-${community.slug}/new` : null,
    subcommunities: rows.filter(
      (row) => row.parentId === id && visible.includes(row.id),
    ),
    page: threadPage,
    pageNumber: page,
    nextHref,
    readState: read,
    markReadAction: read === null ? null : `/api/read/community/${id}`,
    now: new Date(),
    timeZone: preferences.timezone,
    identities,
  })

  /* F56, same shape as the thread page's control. */
  const { subscriptions } = getContainer()
  const followMode =
    subscriptions === null || actor.userId === null
      ? null
      : await subscriptions.modeFor(actor.userId, 'community', community.id)
  const followOffered = subscriptions !== null && actor.userId !== null
  const followModes = buildSubscriptionsView({
    rows: [],
    now: new Date(),
  }).modes

  /*
   * F71. This community's announcements *and* the board-wide ones — an announcement
   * that appeared only on the index would be invisible to everybody who arrives
   * from a search engine, which is most people.
   *
   * `visible` is the same set the page has already used to decide the viewer may
   * be here at all, so the scoped read costs no extra permission work.
   */
  const announcements = await liveAnnouncements({
    visibleCommunityIds: visible,
    scope: id,
    now: new Date(),
    timeZone: preferences.timezone,
  })

  const Announcement = requireSlot(await currentTheme(), 'Announcement')
  const CommunityDisplay = requireSlot(await currentTheme(), 'CommunityDisplay')
  const Navigation = requireSlot(await currentTheme(), 'Navigation')
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const ThreadRow = requireSlot(await currentTheme(), 'ThreadRow')
  const SubcommunityList = requireSlot(await currentTheme(), 'SubcommunityList')
  const Pagination = requireSlot(await currentTheme(), 'Pagination')

  const notice =
    query.posted === 'moderated'
      ? 'Your thread was posted and is waiting for a moderator to approve it.'
      : inlineOutcomeNotice(query)

  /* F80. `view.thread-row` runs once per row; see the index page for the cost. */
  const pluginContext = { ...viewerRef(actor), communityId: id }

  /* F80's wiring for F71's slot; see the board index for the shape. */
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

  const subcommunities =
    view.subcommunities === null
      ? null
      : await filterView('view.subcommunity-list', view.subcommunities, pluginContext)

  const pagination = await filterView(
    'view.pagination',
    view.pagination,
    viewerRef(actor),
  )

  /*
   * The two orderings, as a control somebody can see.
   *
   * These were bare `<a>`s separated by a middot, and Tailwind's preflight
   * renders those as plain body text — a navigation nobody could tell was a
   * navigation, whose current item was marked only by an `aria-current` that
   * no sighted reader receives. They are anchors and stay anchors (an ordering
   * is a URL, and paging has to work with scripting off), and they are the
   * same `ViewTabs` the inbox and the discovery views draw, so "the one you
   * are looking at" means one thing across the board.
   *
   * They are also *under the community's name* now, through theme API 1.3's
   * `tools` region. Rendered above `<CommunityDisplay>`, as they were, the first
   * thing on a community page was a sort control with nothing above it saying what
   * was being sorted.
   */
  const orderTabs = (
    <ViewTabs
      label="Thread order"
      tabs={[
        {
          href: `/${id}-${community.slug}`,
          label: 'Latest',
          isCurrent: sort === 'activity',
        },
        {
          href: `/${id}-${community.slug}?sort=rating`,
          label: 'Top rated',
          isCurrent: sort === 'rating',
        },
      ]}
    />
  )

  const communityDisplayModel = await filterView(
    'view.community-display',
    {
      ...view.display,
      regions: {
        tools: orderTabs,
        /*
         * Following the community, under the threads (theme API 1.4). It was above
         * them, which put a subscription panel between a reader and the list
         * they had come for — and asked whether they wanted to hear about a
         * community before showing them what was in it.
         */
        ...(followOffered
          ? {
              afterContent: (
                <FollowForm
                  target="community"
                  targetId={community.id}
                  mode={followMode}
                  modes={followModes}
                  back={`/${id}-${community.slug}`}
                  label="Follow this community"
                />
              ),
            }
          : {}),
        subcommunities: subcommunities === null ? null : <SubcommunityList {...subcommunities} />,
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

  /*
   * The trail, from the rows and the visibility set this page already holds —
   * so it is string work, not a query. Outside `<main>` on purpose: it is
   * navigation, and "skip to content" should skip it.
   */
  const trail = buildBreadcrumb({
    communities: rows,
    communityId: id,
    visibleCommunityIds: new Set(visible),
  })

  return (
    <>
      <Navigation items={trail} />
      <main id="board-content" tabIndex={-1} className="flex-1">
      {/*
        Where a held thread lands, and where F52 reports what a bulk action did.
        The author cannot be sent to a thread nobody can see, so the community tells
        them what happened; dismissal is the same link without the parameter,
        which needs no JavaScript and no state.
      */}
      {notice !== null && (
        <div className={`${BOARD_MEASURE} pt-6`}>
          <Notice
            kind="info"
            message={notice}
            dismissHref={`/${id}-${community.slug}`}
          />
        </div>
      )}
      <CommunityDisplay {...communityDisplayModel} />
      {/*
        Below the listing, not around it: the checkboxes reach this form by id
        (see `SelectionModel`), so it does not have to contain them — and it
        could not, because `CommunityDisplay` renders a mark-read form of its own.
      */}
      {inlineOffered && (
        <InlineModerationForm
          formId={INLINE_FORM_ID}
          scope="threads"
          rights={inlineRights}
          moveTargets={inlineMoveTargets}
          returnTo={`/${id}-${community.slug}`}
        />
      )}
      </main>
    </>
  )
}
