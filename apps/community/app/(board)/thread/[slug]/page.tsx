import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

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
import { buildThreadView, revealedFrom } from '@/view/thread-view'
import {
  cardDescription,
  jsonLdScript,
  pageLinks,
  threadJsonLd,
} from '@/view/metadata'
import { buildSubscriptionsView } from '@/view/subscriptions'
import { BOARD_MEASURE } from '@/components/shell/measure'

/**
 * F76 — the thread's own metadata, resolved in the viewer's scope.
 *
 * Next calls this alongside the page, and it repeats the page's locate →
 * authorise → read sequence rather than sharing state with it. That is not
 * duplication to remove: a metadata function that trusted the page to have
 * checked first would emit a private thread's title into an Open Graph card on
 * any request where the two got out of step, and the reads are cached per
 * request anyway.
 *
 * The **canonical points at the page being read**, not at page 1 — see
 * `view/metadata.ts`. What it drops is the surplus: `?post=`, `?after=` and
 * `?reveal=` are three URLs for one document, and only the page number
 * survives.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = threadId(slug)
  if (id === null) return { title: 'Thread' }

  const actor = await getActor()
  const { communities, threads, authorizer } = getContainer()

  const communityId = await threads.locateCommunity(id)
  if (communityId === null) return { title: 'Thread' }

  const community = await communities.findById(communityId)
  if (!community || community.type !== 'community') return { title: 'Thread' }

  const matrix = await authorizer.communityMatrix(actor, community.id)
  if (
    !authorizer.can(actor, 'thread.view', { communityId: community.id, community: matrix })
  ) {
    /*
     * The same title an unknown thread gets. A metadata function that said
     * "Private thread" would answer, in the page title of a 404, a question the
     * 404 exists to refuse.
     */
    return { title: 'Thread' }
  }

  const thread = await threads.findById(
    id,
    authorizer.contentScope(actor, { communityId: community.id, community: matrix }),
  )
  if (!thread) return { title: 'Thread' }

  const page = Number(query.page ?? '1')
  const links = pageLinks({
    path: `/thread/${thread.id}-${thread.slug}`,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    hasNext: false,
  })

  /*
   * The community, not the opening post. This function runs beside the page rather
   * than inside it, and reading the first post here would be a second post
   * query on every thread view to fill a description only a link unfurler
   * sees. The page itself has the posts already and puts the real text into
   * the JSON-LD, which is where a crawler reads it.
   */
  const description = `A discussion in ${community.title}.`

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
      siteName: community.title,
    },
    twitter: { card: 'summary', title: thread.title, description },
  }
}

/** What each tool says when it worked. Unknown values fall through to null. */
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

function threadId(value: string): number | null {
  // Index last-post links carry only the stable id; thread listings add a slug.
  const match = /^(\d+)(?:-|$)/.exec(value)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function afterId(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined
  if (!/^[1-9]\d*$/.test(value)) return null
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
    tool?: string
    /* F52's outcome, written by the inline-moderation action's redirect. */
    did?: string
    n?: string
    refused?: string
    gone?: string
    skipped?: string
    /* F61. Repeatable: `?reveal=12&reveal=15`. */
    reveal?: string | string[]
  }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = threadId(slug)
  const after = afterId(query.after)
  const page = query.page === undefined ? 1 : Number(query.page)
  if (id === null || after === null || !Number.isSafeInteger(page) || page < 1)
    notFound()

  const actor = await getActor()
  const {
    communities,
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
  /*
   * Locate, authorise, then read — in that order, and the order is the whole
   * point. The scope cannot be built before the community is known and the community
   * cannot be known before the thread is located, so `locateCommunity` returns the
   * one field permissions need and nothing else. The thread itself is read
   * exactly once, inside the scope this actor turns out to have, so a moderator
   * sees a hidden thread and nobody else learns it exists.
   */
  const communityId = await threads.locateCommunity(id)
  if (communityId === null) notFound()

  const community = await communities.findById(communityId)
  if (!community || community.type !== 'community') notFound()
  const matrix = await authorizer.communityMatrix(actor, community.id)
  if (
    !authorizer.can(actor, 'thread.view', { communityId: community.id, community: matrix })
  )
    notFound()

  const scope = authorizer.contentScope(actor, {
    communityId: community.id,
    community: matrix,
  })
  const thread = await threads.findById(id, scope)
  if (!thread) notFound()

  /*
   * Count the view only after the permission check, and only on the first page:
   * paging through a long thread is one visit, and a viewer who cannot see the
   * thread has not viewed it. The write is buffered (F38) rather than applied to
   * `threads`, and a failure is swallowed — a view counter is never a reason to
   * fail a page that has already been authorised and read.
   */
  if (threadViews && after === undefined) {
    await threadViews.record(thread.id).catch(() => undefined)
  }

  /*
   * The same scope the thread was read with. Everyone else's page never
   * contains the row — filtering in the theme would put the body in the HTML
   * and hide it with CSS, which F33 already refused to do for profile fields.
   */
  /* F57's per-member page size, resolved before the read that uses it. */
  const preferences = await getViewerPreferences()
  const postPage = await posts.listThread(thread.id, {
    ...(after === undefined ? {} : { afterId: after }),
    limit: preferences.postsPerPage,
    scope,
  })
  const nextHref =
    postPage.nextAfterId === null
      ? null
      : `/thread/${thread.id}-${thread.slug}?after=${postPage.nextAfterId}&page=${page + 1}`
  /*
   * The reply link is offered only where the actor may actually use it, and a
   * locked thread offers it to nobody but a moderator — the same answer the
   * action gives, computed twice because a link is not authorisation.
   */
  const canReply =
    threadWrites !== null &&
    authorizer.can(actor, 'reply.post', { communityId: community.id, community: matrix }) &&
    (!thread.isLocked ||
      authorizer.can(actor, 'content.viewUnapproved', {
        communityId: community.id,
        community: matrix,
      }))

  /*
   * F41's affordances, resolved once. `post.editOwn` and `post.deleteOwn` are
   * asked with the *viewer* as owner so the matrix answers the own-content
   * question; the per-post decision of whether this actually is their post is
   * the view model's, and every one of these is re-asked by the action that
   * acts on it.
   */
  /*
   * F54's debt, paid. `Target.isCommunityModerator` has existed since F48 and was
   * never set on a per-page `can()` call, so outside the queue a per-community
   * appointee had only their group's rights — `post.editOthers` and
   * `post.softDelete` both read the flag and both saw `undefined`. Every
   * affordance below is now built on the appointment-aware target.
   */
  const appointment = await moderatorTargetFor(actor, community.id, matrix)
  const own = { ...appointment, ownerId: actor.userId }
  const others = { ...appointment, ownerId: -1 }
  /*
   * Every affordance is also gated on there being somewhere to write, the same
   * way the reply link is: fixture mode has no post writer (D38), and an Edit
   * link that leads to a 404 is worse than no link at all.
   */
  const writable = postWrites !== null
  /*
   * Read once. Three things below ask the board what it has decided about
   * reputation, and three separate awaits of a cached read is three chances for
   * one of them to be asking a different question than it looks like.
   */
  const reputation = await reputationSettings()
  const capabilities = {
    viewerUserId: actor.userId,
    editOwn: writable && authorizer.can(actor, 'post.editOwn', own),
    editOthers: writable && authorizer.can(actor, 'post.editOthers', others),
    softDelete: writable && authorizer.can(actor, 'post.softDelete', own),
    editWindowMinutes: Number(matrix.editTimeLimitMinutes ?? 0),
    bypassesWindow:
      authorizer.can(actor, 'post.editOthers', others) ||
      authorizer.can(actor, 'content.viewUnapproved', own),
    /* Global (F49): reporting is a board capability, not a per-community grant. */
    canReport: postWrites !== null && authorizer.can(actor, 'content.report'),
    /* F53. Global too, and gated on there being a warning store at all (D38). */
    canWarn:
      getContainer().warnings !== null && authorizer.can(actor, 'user.warn'),
    /*
     * F62. Global as well, gated on a reputation store *and* on the board
     * setting — a Rate link that leads to a 404 because reputation is switched
     * off is worse than no link.
     */
    canRate:
      getContainer().reputation !== null &&
      authorizer.can(actor, 'reputation.give') &&
      reputation.enabled,
    /*
     * Whether the form has anything the Thanks button has not. On a board that
     * requires no comment and allows no negatives it does not, and the link
     * beside the button would lead to a page for pressing the same thing.
     */
    ratingNeedsForm: reputation.commentRequired || reputation.allowNegative,
  }

  /*
   * The Thanks state for the page, in two queries rather than two per post.
   * Only asked for where the control will actually be offered — a guest, a
   * board with reputation off, and a board that requires a comment all skip it.
   */
  const thanksOffered =
    capabilities.canRate === true && !reputation.commentRequired && actor.userId !== null
  const thanks = thanksOffered
    ? await thanksForPosts(postPage.rows.map((row) => row.id))
    : new Map()

  /*
   * F50's tools, and the only place on a reading page that resolves appointment
   * rights. Gated on `threadTools` so fixture mode offers nothing, and the move
   * destinations are only fetched when the actor may actually move — two extra
   * queries for a moderator, none for everybody else.
   */
  const movableInto =
    threadTools === null
      ? []
      : await authorizer.moderatedCommunityIds(actor, 'canMoveThreads')
  const toolTarget = appointment
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
  /*
   * F51's two, gated on their own repository. The split points are the posts on
   * *this page* minus the thread's opening post — the one post a split may not
   * start from, because taking everything from it is a move (F51).
   */
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
    : (await communities.listListing())
        .filter(
          (row) =>
            row.type === 'community' &&
            row.id !== community.id &&
            movableInto.includes(row.id),
        )
        .map((row) => ({ id: row.id, title: row.title }))

  /*
   * F52 on the thread page selects *posts*, so the bar offers only the tools
   * that mean something for one: approve, delete, restore. Lock, pin and move
   * act on the thread as a unit and already have F50's bar above.
   */
  const inlineRights = {
    approve:
      inlineModeration !== null &&
      authorizer.can(actor, 'content.approve', toolTarget),
    lock: false,
    stick: false,
    move: false,
    /* `toolTarget` already carries `isCommunityModerator` (see `appointment`). */
    delete:
      inlineModeration !== null &&
      authorizer.can(actor, 'post.softDelete', toolTarget),
  }
  /*
   * Split alone is enough to want the checkboxes: a moderator appointed only to
   * split threads holds none of the bulk tools, and without this the surface
   * they need would not render at all.
   */
  const inlineOffered = anyInlineTool(inlineRights) || surgeryRights.split

  /*
   * F59. One resolution per *distinct author* on the page, not per post: a
   * thread is mostly the same few people, and the rules themselves are read
   * once per request and cached. A board with no custom fields pays one cached
   * lookup and gets an empty map.
   */
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

  /*
   * F61's ignore list, resolved once per request. Empty for a guest, for a
   * board with no relation store, and if the read fails — a thread page is not
   * worth failing over a preference.
   */
  const ignoredIds = await viewerIgnoredIds()

  /*
   * F58. One query for the whole page, keyed by author — a signature per post
   * would be an N+1 on the board's heaviest page, which is exactly what the
   * repository's `readMany` exists to avoid.
   */
  const signatures = await signaturesFor(authorIds)

  /*
   * F42. One query for every attachment on the page, for the same reason as the
   * signatures above. `attachmentsByPost` drops anything that is not
   * downloadable, so a re-encode that has not finished is simply absent rather
   * than rendered as a link that would 404.
   */
  /* F58. Same one-query-per-page shape as the signatures above. */
  const avatars = await avatarsFor(authorIds)

  /*
   * The group standing behind every name on the page — title, colour, badge and
   * reputation — in one query, for the same reason. This is what fills
   * `PostAuthorModel.title`, which has been in the theme contract since F27 and
   * hardcoded `null` at the only place that builds it.
   */
  const identities = await identitiesFor(authorIds)

  const attachments = attachmentsByPost(
    await attachmentsForPosts(postPage.rows.map((row) => row.id)),
  )

  const view = buildThreadView({
    thread,
    /*
     * F71. Compiled once for the page rather than per post, and `undefined` on
     * a board with no filters — which is most of them, and they pay nothing.
     */
    wordFilter: await activeWordFilter(),
    /* F71. Into the render, unlike the filter — see `thread-view.ts`. */
    vocabulary: await activeVocabulary(),
    capabilities,
    replyHref: canReply ? `/thread/${thread.id}-${thread.slug}/reply` : null,
    community,
    page: postPage,
    pageNumber: page,
    nextHref,
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
    /*
     * The page's own URL, with the page number kept: a reveal link that dropped
     * it would send the reader back to page 1 of a long thread, which is worse
     * than not offering one.
     */
    currentHref:
      `/thread/${thread.id}-${thread.slug}` +
      (after === undefined ? `?page=${page}` : `?after=${after}&page=${page}`),
  })

  /*
   * F56's follow control. Two reads for a signed-in member — the current mode,
   * and nothing else — and none at all for a guest or on a board with no
   * subscription store, where the control is absent rather than offered and
   * then refused.
   */
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
          : query.post === 'deleted'
            ? 'That post has been deleted.'
            : query.post === 'unchanged'
              ? 'Nothing changed — that post was already in this state.'
              : inlineOutcomeNotice(query)

  /*
   * F76. JSON-LD, from rows this page has already read **inside the viewer's
   * scope** — which is what makes the leak impossible rather than unlikely:
   * there is no private post in scope here for it to describe.
   *
   * Serialised by `jsonLdScript`, not `JSON.stringify`. The difference is not
   * cosmetic: `stringify` does not escape the forward slash, so a thread titled
   * `</script>` would end this block and turn the rest of the document into
   * markup. A test found that; see `view/metadata.ts`.
   */
  const opening = postPage.rows.find((row) => row.isFirstPost) ?? null
  const jsonLd =
    opening === null
      ? /*
         * Only where the opening post is on the page — which is page one. The
         * structured record describes the *thread*, and page four has neither
         * its opening text nor its creation date without a second read. A
         * crawler reading page four already has the record from page one, and
         * the canonical here still points at page four because that is the
         * document it is looking at.
         */
        null
      : threadJsonLd({
          title: thread.title,
          url: `/thread/${thread.id}-${thread.slug}`,
          author: thread.authorUsername,
          published: opening.createdAt,
          modified: thread.lastPostAt,
          replyCount: thread.replyCount,
          communityTitle: community.title,
          description: cardDescription(
            opening.message,
            `A discussion in ${community.title}.`,
          ),
        })

  /*
   * F80. The busiest hooks on the board: `view.post-bit` and `view.post-actions`
   * run once per post, so twenty posts is forty filter chains. Both are built
   * here in one pass rather than inside the JSX, so the awaits happen over data
   * the page already has instead of interleaving with rendering.
   *
   * The postbit's two regions are handed the post *and* its author, because the
   * commonest plugin badge — a role marker, a country flag, a post-count tier —
   * is about the person rather than the post.
   */
  const pluginContext = {
    ...viewerRef(actor),
    threadId: thread.id,
    communityId: community.id,
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
            /*
             * The multi-quote island goes *into* the actions (theme API 1.3),
             * not into the plugin footer beside them. It sat in the footer
             * because that was the only region reachable from here, which cost
             * every post on the board a second bordered row holding one
             * control. It is a post action; it lives with the post actions.
             *
             * The condition is the same one that decides whether the post can
             * be quoted at all — collecting a quote you may not use is a
             * control that does nothing.
             */
            actions: (
              <PostActions {...actions}>
                {/*
                  Thanks first, because it is the one control on this row most
                  readers will ever press. Offered on the same terms the Rate
                  link used to carry alone — not your own post, not a deleted
                  author, not a post you have chosen to hide — plus one more:
                  the board must not require a comment, because one press
                  cannot carry a reason. Where it does, the Rate link is still
                  here and is the honest affordance.
                */}
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
            pluginBadges: pluginRegion('postbit.badges', {
              viewer: viewerRef(actor),
              subjectId: post.id,
              authorId: post.author.userId,
            }),
            pluginFooter: pluginRegion('postbit.footer', {
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
    authorizer.can(actor, 'poll.vote', { communityId: community.id, community: matrix })
  const ratingsEnabled = (await getSettings()).get(
    'posting.thread_ratings_enabled',
  )
  const rating =
    polls === null ? null : await polls.findRating(thread.id, actor.userId)
  const canRateThread =
    ratingsEnabled &&
    polls !== null &&
    actor.userId !== null &&
    authorizer.can(actor, 'thread.rate', { communityId: community.id, community: matrix })
  const replyTarget = { communityId: community.id, community: matrix }
  const quickReply = !canReply ? null : (
    <>
      {/*
        Turns every `?quote=` link on the page into an in-place quote — see
        `quote-in-place.tsx`. It renders nothing; it is here rather than beside
        the posts because it is only useful when there is a box for the quote to
        land in. A reader who cannot reply still gets the link, and the link
        still works.
      */}
      <QuoteInPlace threadId={thread.id} />
      <ReplyForm
        threadId={thread.id}
        seenLastPostId={thread.lastPost?.postId ?? null}
        prefill=""
        canSubscribe={authorizer.can(actor, 'community.subscribe', replyTarget)}
        attachmentLimits={canAttach(actor, replyTarget) ? attachmentLimits(replyTarget) : null}
        draft={actor.userId === null || drafts === null ? null : await drafts.find(actor.userId, community.id, thread.id)}
        /*
         * Folded and shrunk, because inline this is the quick reply rather than
         * the page — see `ReplyForm`. `/thread/…/reply` passes nothing and gets
         * the full-size, always-open form.
         */
        collapsible
      />
    </>
  )

  /*
   * The thread's controls, at the two ends of it (theme API 1.3 and 1.4).
   *
   * All four used to be siblings of `<ThreadView>` rendered *before* it,
   * because the contract had nowhere else to put them — so a thread opened
   * with a moderator's tool bar, a follow control, a poll and a star rating,
   * and the `<h1>` saying which thread was a screen below all of it.
   *
   * They split by when somebody wants them. **Before** the posts: the
   * moderator's bar, and the poll — a poll is content, and it is part of what
   * the opening post is asking. **After** them: rating the thread and
   * following it, which are both verdicts on something you have to have read.
   * A star rating above the first post was asking what a reader thought of a
   * discussion they had not started reading.
   *
   * They stay app-rendered: each one is a `<form>` bound to a Server Action,
   * and an action reference is the one thing that never crosses into a theme.
   */
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

  /*
   * The trail: Communities › Category › Community › this thread.
   *
   * Both reads are already paid for on this request — `listAll` is what the
   * shell's jump box calls and `CachedCommunityRepository` serves once, and the
   * visibility set is memoised by the authorizer. Rendered outside `<main>`,
   * because it is navigation and "skip to content" should skip it.
   */
  const [allCommunities, visibleIds] = await Promise.all([
    communities.listAll(),
    authorizer.visibleCommunityIds(actor),
  ])
  const trail = buildBreadcrumb({
    communities: allCommunities,
    communityId: community.id,
    visibleCommunityIds: new Set(visibleIds),
    leaf: thread.title,
  })

  return (
    <>
      <Navigation items={trail} />
      <main id="board-content" tabIndex={-1} className="flex-1">
      {jsonLd !== null && (
        <script
          type="application/ld+json"
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
          /* F51's split over F52's checkboxes; null when they may not split. */
          splitFrom={surgeryRights.split ? thread.id : null}
        />
      )}
      </main>
    </>
  )
}
