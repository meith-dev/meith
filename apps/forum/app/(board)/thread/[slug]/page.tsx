import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@forum/theme-kit'

import { FollowForm } from '@/components/account/subscription-forms'
import { InlineModerationForm } from '@/components/moderation/inline-moderation-form'
import { ThreadToolsForm } from '@/components/moderation/thread-tools-form'
import { ThreadSurgeryForm } from '@/components/moderation/thread-surgery-form'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { postbitProfileFields } from '@/server/profile-fields'
import { viewerIgnoredIds } from '@/server/relations'
import { moderatorTargetFor } from '@/server/modcp'
import { activeTheme } from '@/server/theme'
import {
  INLINE_FORM_ID,
  anyInlineTool,
  inlineOutcomeNotice,
  selectionFor,
} from '@/view/inline-moderation'
import { buildThreadView, revealedFrom } from '@/view/thread-view'
import { buildSubscriptionsView } from '@/view/subscriptions'

export const metadata: Metadata = { title: 'Thread' }

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
  if (id === null || after === null || !Number.isSafeInteger(page) || page < 1) notFound()

  const actor = await getActor()
  const { forums, posts, threads, authorizer, threadViews, threadWrites, postWrites, threadTools, threadSurgery, inlineModeration } =
    getContainer()
  /*
   * Locate, authorise, then read — in that order, and the order is the whole
   * point. The scope cannot be built before the forum is known and the forum
   * cannot be known before the thread is located, so `locateForum` returns the
   * one field permissions need and nothing else. The thread itself is read
   * exactly once, inside the scope this actor turns out to have, so a moderator
   * sees a hidden thread and nobody else learns it exists.
   */
  const forumId = await threads.locateForum(id)
  if (forumId === null) notFound()

  const forum = await forums.findById(forumId)
  if (!forum || forum.type !== 'forum') notFound()
  const matrix = await authorizer.forumMatrix(actor, forum.id)
  if (!authorizer.can(actor, 'thread.view', { forumId: forum.id, forum: matrix })) notFound()

  const scope = authorizer.contentScope(actor, { forumId: forum.id, forum: matrix })
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
  const nextHref = postPage.nextAfterId === null
    ? null
    : `/thread/${thread.id}-${thread.slug}?after=${postPage.nextAfterId}&page=${page + 1}`
  /*
   * The reply link is offered only where the actor may actually use it, and a
   * locked thread offers it to nobody but a moderator — the same answer the
   * action gives, computed twice because a link is not authorisation.
   */
  const canReply =
    threadWrites !== null &&
    authorizer.can(actor, 'reply.post', { forumId: forum.id, forum: matrix }) &&
    (!thread.isLocked || authorizer.can(actor, 'content.viewUnapproved', { forumId: forum.id, forum: matrix }))

  /*
   * F41's affordances, resolved once. `post.editOwn` and `post.deleteOwn` are
   * asked with the *viewer* as owner so the matrix answers the own-content
   * question; the per-post decision of whether this actually is their post is
   * the view model's, and every one of these is re-asked by the action that
   * acts on it.
   */
  /*
   * F54's debt, paid. `Target.isForumModerator` has existed since F48 and was
   * never set on a per-page `can()` call, so outside the queue a per-forum
   * appointee had only their group's rights — `post.editOthers` and
   * `post.softDelete` both read the flag and both saw `undefined`. Every
   * affordance below is now built on the appointment-aware target.
   */
  const appointment = await moderatorTargetFor(actor, forum.id, matrix)
  const own = { ...appointment, ownerId: actor.userId }
  const others = { ...appointment, ownerId: -1 }
  /*
   * Every affordance is also gated on there being somewhere to write, the same
   * way the reply link is: fixture mode has no post writer (D38), and an Edit
   * link that leads to a 404 is worse than no link at all.
   */
  const writable = postWrites !== null
  const capabilities = {
    viewerUserId: actor.userId,
    editOwn: writable && authorizer.can(actor, 'post.editOwn', own),
    editOthers: writable && authorizer.can(actor, 'post.editOthers', others),
    softDelete: writable && authorizer.can(actor, 'post.softDelete', own),
    editWindowMinutes: Number(matrix.editTimeLimitMinutes ?? 0),
    bypassesWindow:
      authorizer.can(actor, 'post.editOthers', others) ||
      authorizer.can(actor, 'content.viewUnapproved', own),
    /* Global (F49): reporting is a board capability, not a per-forum grant. */
    canReport: postWrites !== null && authorizer.can(actor, 'content.report'),
    /* F53. Global too, and gated on there being a warning store at all (D38). */
    canWarn: getContainer().warnings !== null && authorizer.can(actor, 'user.warn'),
  }

  /*
   * F50's tools, and the only place on a reading page that resolves appointment
   * rights. Gated on `threadTools` so fixture mode offers nothing, and the move
   * destinations are only fetched when the actor may actually move — two extra
   * queries for a moderator, none for everybody else.
   */
  const movableInto =
    threadTools === null ? [] : await authorizer.moderatedForumIds(actor, 'canMoveThreads')
  const toolTarget = appointment
  const toolRights = {
    lock: threadTools !== null && authorizer.can(actor, 'thread.lock', toolTarget),
    stick: threadTools !== null && authorizer.can(actor, 'thread.stick', toolTarget),
    move: threadTools !== null && authorizer.can(actor, 'thread.move', toolTarget),
    delete: threadTools !== null && authorizer.can(actor, 'thread.delete', toolTarget),
  }
  /*
   * F51's two, gated on their own repository. The split points are the posts on
   * *this page* minus the thread's opening post — the one post a split may not
   * start from, because taking everything from it is a move (F51).
   */
  const surgeryRights = {
    merge: threadSurgery !== null && authorizer.can(actor, 'thread.merge', toolTarget),
    split: threadSurgery !== null && authorizer.can(actor, 'thread.split', toolTarget),
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
            row.type === 'forum' &&
            row.id !== forum.id &&
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
      inlineModeration !== null && authorizer.can(actor, 'content.approve', toolTarget),
    lock: false,
    stick: false,
    move: false,
    /* `toolTarget` already carries `isForumModerator` (see `appointment`). */
    delete:
      inlineModeration !== null && authorizer.can(actor, 'post.softDelete', toolTarget),
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

  const view = buildThreadView({
    thread,
    capabilities,
    replyHref: canReply ? `/thread/${thread.id}-${thread.slug}/reply` : null,
    forum,
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
  const followModes = buildSubscriptionsView({ rows: [], now: new Date() }).modes

  const ThreadView = requireSlot(activeTheme, 'ThreadView')
  const Notice = requireSlot(activeTheme, 'Notice')
  const PostBit = requireSlot(activeTheme, 'PostBit')
  const PostActions = requireSlot(activeTheme, 'PostActions')
  const Pagination = requireSlot(activeTheme, 'Pagination')

  const notice =
    query.replied === 'race'
      ? 'Somebody else replied while you were writing. Your reply was posted below theirs.'
      : query.posted === 'moderated'
        ? 'Your post is waiting for a moderator to approve it.'
        : query.tool !== undefined
          ? TOOL_NOTICE[query.tool] ?? null
          : query.post === 'deleted'
          ? 'That post has been deleted.'
          : query.post === 'unchanged'
            ? 'Nothing changed — that post was already in this state.'
            : inlineOutcomeNotice(query)

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      {notice !== null && (
        <div className="px-6 pt-6">
          <Notice
            kind="info"
            message={notice}
            dismissHref={`/thread/${thread.id}-${thread.slug}`}
          />
        </div>
      )}
      {(toolRights.lock ||
        toolRights.stick ||
        toolRights.move ||
        toolRights.delete ||
        surgeryRights.merge ||
        surgeryRights.split) && (
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
      {followOffered && (
        <div className="px-6 pt-4">
          <FollowForm
            target="thread"
            targetId={thread.id}
            mode={followMode}
            modes={followModes}
            back={`/thread/${thread.id}-${thread.slug}`}
            label="Follow this thread"
          />
        </div>
      )}
      <ThreadView
        {...view.view}
        regions={{
          posts: view.posts.map((post) => (
            <PostBit
              key={post.id}
              post={post}
              select={selectionFor('post', post.id, `post #${post.number}`, inlineOffered)}
              regions={{ actions: <PostActions actions={post.actions} postId={post.id} /> }}
            />
          )),
          pagination: <Pagination {...view.pagination} />,
          quickReply: null,
        }}
      />
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
  )
}
