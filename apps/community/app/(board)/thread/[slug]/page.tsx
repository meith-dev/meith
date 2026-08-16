import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { acceptsThreads, canHoldThreads } from '@meith/forums'
import { requireSlot } from '@meith/theme-kit'

import { filterView, pluginRegion, viewerRef } from '@/server/plugin-view'

import { FollowForm } from '@/components/account/subscription-forms'
import { InlineModerationForm } from '@/components/moderation/inline-moderation-form'
import { ThreadToolsForm } from '@/components/moderation/thread-tools-form'
import { ThreadSurgeryForm } from '@/components/moderation/thread-surgery-form'
import { PollForm } from '@/components/content/poll'
import { ThreadRatingForm } from '@/components/content/thread-rating'
import { ReplyForm } from '@/components/content/reply-form'
import { MultiQuoteButton } from '@/components/content/multiquote-button'
import { ThanksButton } from '@/components/content/thanks-button'
import { QuoteInPlace } from '@/components/content/quote-in-place'
import { attachmentLimits, canAttach } from '@/server/attachments'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { postbitProfileFields } from '@/server/profile-fields'
import { viewerIgnoredIds } from '@/server/relations'
import { reputationSettings, thanksForPosts } from '@/server/reputation'
import { signaturesFor } from '@/server/signatures'
import { moderatorTargetFor } from '@/server/modcp'
import { cspNonce } from '@/server/nonce'
import { currentTheme } from '@/server/theme'
import {
  INLINE_FORM_ID,
  anyInlineTool,
  inlineOutcomeNotice,
  selectionFor,
} from '@/view/inline-moderation'
import { attachmentsByPost } from '@/view/attachments'
import { attachmentsForPosts } from '@/server/attachments'
import { avatarsFor } from '@/server/avatars'
import { identitiesFor } from '@/server/group-identity'
import { activeVocabulary, activeWordFilter } from '@/server/content-admin'
import { getSettings } from '@/server/settings'
import { buildBreadcrumb } from '@/view/breadcrumb'
import { locatedHref } from '@/view/post-link'
import { leadingId } from '@/view/slug-id'
import {
  buildThreadView,
  revealedFrom,
  threadToolsHeading,
} from '@/view/thread-view'
import {
  cardDescription,
  jsonLdScript,
  pageLinks,
  threadJsonLd,
} from '@/view/metadata'
import { buildSubscriptionsView } from '@/view/subscriptions'
import { BOARD_MEASURE } from '@/components/shell/measure'
import { buildOffsetPager, offsetOf } from '@/view/pager'

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = leadingId(slug)
  if (id === null) return { title: 'Thread' }

  const actor = await getActor()
  const { forums, threads, authorizer } = getContainer()

  const located = await threads.locate(id)
  if (located === null) return { title: 'Thread' }

  const forum = await forums.findById(located.forumId)
  if (!forum || !canHoldThreads(forum.type)) return { title: 'Thread' }

  const matrix = await authorizer.forumMatrix(actor, forum.id)
  const target = await authorizer.moderatorTargetIn(actor, forum.id, matrix)
  if (
    !authorizer.can(actor, 'thread.view', {
      ...target,
      threadAuthorId: located.authorUserId,
    })
  ) {
    return { title: 'Thread' }
  }

  const thread = await threads.findById(
    id,
    authorizer.contentScope(actor, target),
    authorizer.authorFilter(actor, target),
  )
  if (!thread) return { title: 'Thread' }

  const page = Number(query.page ?? '1')
  const links = pageLinks({
    path: `/thread/${thread.id}-${thread.slug}`,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    hasNext: false,
  })

  const description = `A discussion in ${forum.title}.`

  return {
    title: thread.title,
    description,
    alternates: {
      canonical: links.canonical,
      types: {
        'application/rss+xml': `/thread/${thread.id}-${thread.slug}/feed.xml`,
      },
    },
    openGraph: {
      type: 'article',
      title: thread.title,
      description,
      url: links.canonical,
      siteName: forum.title,
    },
    twitter: { card: 'summary', title: thread.title, description },
  }
}

const TOOL_NOTICE: Readonly<Record<string, string>> = {
  lock: 'Thread locked.',
  unlock: 'Thread unlocked.',
  stick: 'Thread pinned.',
  unstick: 'Thread unpinned.',
  move: 'Thread moved.',
  copy: 'Thread copied. You are looking at the copy.',
  restore: 'Thread restored.',
  split: 'Thread split. You are looking at the new one.',
  merge: 'Threads merged. You are looking at the one that survived.',
}

function afterId(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function requestedPostId(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    after?: string
    page?: string
    replied?: string
    posted?: string
    post?: string
    removed?: string
    unchanged?: string
    tool?: string
    did?: string
    n?: string
    refused?: string
    gone?: string
    skipped?: string
    reveal?: string | string[]
  }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = leadingId(slug)
  const after = afterId(query.after)
  const page = query.page === undefined ? 1 : Number(query.page)
  if (id === null || after === null || !Number.isSafeInteger(page) || page < 1)
    notFound()

  const actor = await getActor()
  const {
    forums,
    posts,
    threads,
    authorizer,
    threadViews,
    threadWrites,
    postWrites,
    threadTools,
    threadSurgery,
    inlineModeration,
    polls,
    drafts,
  } = getContainer()
  const located = await threads.locate(id)
  if (located === null) notFound()

  const forum = await forums.findById(located.forumId)
  if (!forum || !canHoldThreads(forum.type)) notFound()
  const matrix = await authorizer.forumMatrix(actor, forum.id)

  const appointment = await moderatorTargetFor(actor, forum.id, matrix)
  if (
    !authorizer.can(actor, 'thread.view', {
      ...appointment,
      threadAuthorId: located.authorUserId,
    })
  )
    notFound()

  const scope = authorizer.contentScope(actor, appointment)
  const thread = await threads.findById(
    id,
    scope,
    authorizer.authorFilter(actor, appointment),
  )
  if (!thread) notFound()

  const preferences = await getViewerPreferences()

  const requested = requestedPostId(query.post)
  if (requested !== null) {
    const location = await posts.locate(thread.id, requested, {
      scope,
      pageSize: preferences.postsPerPage,
    })
    if (location !== null) {
      redirect(locatedHref(`/thread/${thread.id}-${thread.slug}`, query, location))
    }
  }

  if (threadViews && after === undefined) {
    await threadViews.record(thread.id).catch(() => undefined)
  }

  const postPage = await posts.listThread(thread.id, {
    ...(after === undefined
      ? { offset: offsetOf(page, preferences.postsPerPage) }
      : { afterId: after }),
    limit: preferences.postsPerPage,
    scope,
  })

  const pager = buildOffsetPager({
    path: `/thread/${thread.id}-${thread.slug}`,
    params: query,
    page,
    pageSize: preferences.postsPerPage,
    total: thread.replyCount + 1,
  })

  const nextHref = pager.nextHref
  const canReply =
    threadWrites !== null &&
    authorizer.can(actor, 'reply.post', { forumId: forum.id, forum: matrix }) &&
    (!thread.isLocked ||
      authorizer.can(actor, 'content.viewUnapproved', {
        forumId: forum.id,
        forum: matrix,
      }))

  const own = { ...appointment, ownerId: actor.userId }
  const others = { ...appointment, ownerId: -1 }
  const writable = postWrites !== null
  const reputation = await reputationSettings()
  const capabilities = {
    viewerUserId: actor.userId,
    editOwn: writable && authorizer.can(actor, 'post.editOwn', own),
    editOthers: writable && authorizer.can(actor, 'post.editOthers', others),
    softDelete: writable && authorizer.can(actor, 'post.softDelete', own),
    restore: writable && authorizer.can(actor, 'post.restore', own),
    editWindowMinutes: Number(matrix.editTimeLimitMinutes ?? 0),
    bypassesWindow:
      authorizer.can(actor, 'post.editOthers', others) ||
      authorizer.can(actor, 'content.viewUnapproved', own),
    canReport: postWrites !== null && authorizer.can(actor, 'content.report'),
    canWarn:
      getContainer().warnings !== null && authorizer.can(actor, 'user.warn'),
    canRate:
      getContainer().reputation !== null &&
      authorizer.can(actor, 'reputation.give') &&
      reputation.enabled,
    ratingNeedsForm: reputation.commentRequired || reputation.allowNegative,
  }

  const thanksOffered =
    capabilities.canRate === true && !reputation.commentRequired && actor.userId !== null
  const thanks = thanksOffered
    ? await thanksForPosts(postPage.rows.map((row) => row.id))
    : new Map()

  const movableInto =
    threadTools === null
      ? []
      : await authorizer.moderatedForumIds(actor, 'canMoveThreads')
  const toolTarget = { ...appointment, threadAuthorId: located.authorUserId }
  const toolRights = {
    lock:
      threadTools !== null && authorizer.can(actor, 'thread.lock', toolTarget),
    stick:
      threadTools !== null && authorizer.can(actor, 'thread.stick', toolTarget),
    move:
      threadTools !== null && authorizer.can(actor, 'thread.move', toolTarget),
    delete:
      threadTools !== null &&
      authorizer.can(actor, 'thread.delete', toolTarget),
  }
  const surgeryRights = {
    merge:
      threadSurgery !== null &&
      authorizer.can(actor, 'thread.merge', toolTarget),
    split:
      threadSurgery !== null &&
      authorizer.can(actor, 'thread.split', toolTarget),
  }
  const splitPoints = !surgeryRights.split
    ? []
    : postPage.rows
        .filter((row) => !row.isFirstPost && row.visibility === 'visible')
        .map((row) => ({
          id: row.id,
          number: row.number,
          author: row.authorUsername,
        }))
  const moveTargets = !toolRights.move
    ? []
    : (await forums.listListing())
        .filter(
          (row) =>
            acceptsThreads(row) &&
            row.id !== forum.id &&
            movableInto.includes(row.id),
        )
        .map((row) => ({ id: row.id, title: row.title }))

  const inlineRights = {
    approve:
      inlineModeration !== null &&
      authorizer.can(actor, 'content.approve', toolTarget),
    lock: false,
    stick: false,
    move: false,
    delete:
      inlineModeration !== null &&
      authorizer.can(actor, 'post.softDelete', toolTarget),
    restore:
      inlineModeration !== null &&
      authorizer.can(actor, 'post.restore', toolTarget),
  }
  const inlineOffered = anyInlineTool(inlineRights) || surgeryRights.split

  const authorIds = [
    ...new Set(
      postPage.rows
        .map((row) => row.authorUserId)
        .filter((id): id is number => id !== null),
    ),
  ]
  const authorFields = new Map(
    await Promise.all(
      authorIds.map(
        async (id) => [id, await postbitProfileFields(id)] as const,
      ),
    ),
  )

  const ignoredIds = await viewerIgnoredIds()

  const signatures = await signaturesFor(authorIds)

  const avatars = await avatarsFor(authorIds)

  const identities = await identitiesFor(authorIds)

  const attachments = attachmentsByPost(
    await attachmentsForPosts(postPage.rows.map((row) => row.id)),
  )

  const wordFilter = await activeWordFilter()

  const view = buildThreadView({
    thread,
    wordFilter,
    vocabulary: await activeVocabulary(),
    capabilities,
    replyHref: canReply ? `/thread/${thread.id}-${thread.slug}/reply` : null,
    forum,
    page: postPage,
    pageNumber: pager.page,
    nextHref,
    pagination: pager,
    markReadAction:
      actor.userId === null || postPage.rows.at(-1) === undefined
        ? null
        : `/api/read/thread/${thread.id}?post=${postPage.rows.at(-1)!.id}`,
    now: new Date(),
    timeZone: preferences.timezone,
    authorFields,
    signatures,
    attachments,
    avatars,
    identities,
    ignoredIds,
    revealedPostIds: revealedFrom(query.reveal),
    currentHref:
      `/thread/${thread.id}-${thread.slug}` +
      (after === undefined ? `?page=${page}` : `?after=${after}&page=${page}`),
  })

  const { subscriptions } = getContainer()
  const followMode =
    subscriptions === null || actor.userId === null
      ? null
      : await subscriptions.modeFor(actor.userId, 'thread', thread.id)
  const followOffered = subscriptions !== null && actor.userId !== null
  const followModes = buildSubscriptionsView({
    rows: [],
    now: new Date(),
  }).modes

  const ThreadView = requireSlot(await currentTheme(), 'ThreadView')
  const Navigation = requireSlot(await currentTheme(), 'Navigation')
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const PostBit = requireSlot(await currentTheme(), 'PostBit')
  const PostActions = requireSlot(await currentTheme(), 'PostActions')
  const Pagination = requireSlot(await currentTheme(), 'Pagination')

  const notice =
    query.replied === 'race'
      ? 'Somebody else replied while you were writing. Your reply was posted below theirs.'
      : query.posted === 'moderated'
        ? 'Your post is waiting for a moderator to approve it.'
        : query.tool !== undefined
          ? (TOOL_NOTICE[query.tool] ?? null)
          : query.removed === 'post'
            ? 'That post has been deleted.'
            : query.unchanged === 'post'
              ? 'Nothing changed — that post was already in this state.'
              : inlineOutcomeNotice(query)

  const opening = postPage.rows.find((row) => row.isFirstPost) ?? null
  const jsonLd =
    opening === null
      ?
        null
      : threadJsonLd({
          title: thread.title,
          url: `/thread/${thread.id}-${thread.slug}`,
          author: thread.authorUsername,
          published: opening.createdAt,
          modified: thread.lastPostAt,
          replyCount: thread.replyCount,
          forumTitle: forum.title,
          description: cardDescription(
            opening.message,
            `A discussion in ${forum.title}.`,
            wordFilter,
          ),
        })

  const pluginContext = {
    ...viewerRef(actor),
    threadId: thread.id,
    forumId: forum.id,
  }

  const postModels = await Promise.all(
    view.posts.map(async (post) => {
      const actions = await filterView(
        'view.post-actions',
        { actions: post.actions, postId: post.id },
        pluginContext,
      )
      return filterView(
        'view.post-bit',
        {
          post,
          select: selectionFor(
            'post',
            post.id,
            `post #${post.number}`,
            inlineOffered,
          ),
          regions: {
            actions: (
              <PostActions {...actions}>
                {thanksOffered &&
                post.author.userId !== null &&
                post.author.userId !== actor.userId &&
                post.ignored === null &&
                post.visibility === 'visible' ? (
                  <ThanksButton
                    postId={post.id}
                    authorUserId={post.author.userId}
                    returnTo={`/thread/${thread.id}-${thread.slug}`}
                    thanked={thanks.get(post.id)?.thanked ?? false}
                    count={thanks.get(post.id)?.count ?? 0}
                  />
                ) : null}
                {post.actions.quoteHref === null ? null : (
                  <MultiQuoteButton postId={post.id} />
                )}
              </PostActions>
            ),
            pluginBadges: await pluginRegion('postbit.badges', {
              viewer: viewerRef(actor),
              subjectId: post.id,
              authorId: post.author.userId,
            }),
            pluginFooter: await pluginRegion('postbit.footer', {
              viewer: viewerRef(actor),
              subjectId: post.id,
              authorId: post.author.userId,
            }),
          },
        },
        pluginContext,
      )
    }),
  )

  const pagination = await filterView(
    'view.pagination',
    view.pagination,
    viewerRef(actor),
  )
  const poll = polls === null ? null : await polls.find(thread.id, actor.userId)
  const canVotePoll =
    polls !== null &&
    actor.userId !== null &&
    authorizer.can(actor, 'poll.vote', { forumId: forum.id, forum: matrix })
  const ratingsEnabled = (await getSettings()).get(
    'posting.thread_ratings_enabled',
  )
  const rating =
    polls === null ? null : await polls.findRating(thread.id, actor.userId)
  const canRateThread =
    ratingsEnabled &&
    polls !== null &&
    actor.userId !== null &&
    authorizer.can(actor, 'thread.rate', { forumId: forum.id, forum: matrix })
  const replyRules =
    threadWrites === null || !canReply
      ? null
      : await threadWrites.postingRules(forum.id)
  const replyTarget = {
    forumId: forum.id,
    forum: matrix,
    allowsAttachments: replyRules?.allowAttachments === true,
  }
  const quickReply = !canReply ? null : (
    <>
      <QuoteInPlace threadId={thread.id} />
      <ReplyForm
        threadId={thread.id}
        seenLastPostId={thread.lastPost?.postId ?? null}
        prefill=""
        canSubscribe={authorizer.can(actor, 'forum.subscribe', replyTarget)}
        attachmentLimits={canAttach(actor, replyTarget) ? attachmentLimits(replyTarget) : null}
        draft={actor.userId === null || drafts === null ? null : await drafts.find(actor.userId, forum.id, thread.id)}
        collapsible
      />
    </>
  )

  const anyTool =
    toolRights.lock ||
    toolRights.stick ||
    toolRights.move ||
    toolRights.delete ||
    surgeryRights.merge ||
    surgeryRights.split
  const tools =
    !anyTool && poll === null ? undefined : (
      <>
        {anyTool && (
          <ThreadToolsForm
            threadId={thread.id}
            isLocked={thread.isLocked}
            isSticky={thread.isSticky}
            rights={toolRights}
            moveTargets={moveTargets}
            heading={threadToolsHeading(appointment.isForumModerator)}
          >
            <ThreadSurgeryForm
              threadId={thread.id}
              rights={surgeryRights}
              splitPoints={splitPoints}
            />
          </ThreadToolsForm>
        )}
        {poll !== null && (
          <PollForm poll={poll} threadId={thread.id} canVote={canVotePoll} />
        )}
      </>
    )

  const showRating = rating !== null && ratingsEnabled
  const afterContent =
    !showRating && !followOffered ? undefined : (
      <>
        {showRating && (
          <ThreadRatingForm
            threadId={thread.id}
            rating={rating}
            canRate={canRateThread}
          />
        )}
        {followOffered && (
          <FollowForm
            target="thread"
            targetId={thread.id}
            mode={followMode}
            modes={followModes}
            back={`/thread/${thread.id}-${thread.slug}`}
            label="Follow this thread"
          />
        )}
      </>
    )

  const threadViewModel = await filterView(
    'view.thread-view',
    {
      ...view.view,
      regions: {
        ...(tools === undefined ? {} : { tools }),
        posts: postModels.map((model) => (
          <PostBit key={model.post.id} {...model} />
        )),
        pagination: <Pagination {...pagination} />,
        ...(afterContent === undefined ? {} : { afterContent }),
        quickReply,
      },
    },
    pluginContext,
  )

  const [allForums, visibleIds] = await Promise.all([
    forums.listAll(),
    authorizer.visibleForumIds(actor),
  ])
  const trail = buildBreadcrumb({
    forums: allForums,
    forumId: forum.id,
    visibleForumIds: new Set(visibleIds),
    leaf: thread.title,
    homeLabel: (await getSettings()).get('board.name'),
  })

  return (
    <>
      <Navigation items={trail} />
      <main id="board-content" tabIndex={-1} className="flex-1">
      {jsonLd !== null && (
        <script
          type="application/ld+json"
          nonce={await cspNonce()}
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      )}
      {notice !== null && (
        <div className={`${BOARD_MEASURE} pt-6`}>
          <Notice
            kind="info"
            message={notice}
            dismissHref={`/thread/${thread.id}-${thread.slug}`}
          />
        </div>
      )}
      <ThreadView {...threadViewModel} />
      {inlineOffered && (
        <InlineModerationForm
          formId={INLINE_FORM_ID}
          scope="posts"
          rights={inlineRights}
          moveTargets={[]}
          returnTo={`/thread/${thread.id}-${thread.slug}`}
          splitFrom={surgeryRights.split ? thread.id : null}
        />
      )}
      </main>
    </>
  )
}
