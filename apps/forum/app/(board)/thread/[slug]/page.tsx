import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@forum/theme-kit'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { activeTheme } from '@/server/theme'
import { POSTS_PER_PAGE } from '@/view/paging'
import { buildThreadView } from '@/view/thread-view'

export const metadata: Metadata = { title: 'Thread' }

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
  }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = threadId(slug)
  const after = afterId(query.after)
  const page = query.page === undefined ? 1 : Number(query.page)
  if (id === null || after === null || !Number.isSafeInteger(page) || page < 1) notFound()

  const actor = await getActor()
  const { forums, posts, threads, authorizer, threadViews, threadWrites, postWrites } =
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
  const postPage = await posts.listThread(thread.id, {
    ...(after === undefined ? {} : { afterId: after }),
    limit: POSTS_PER_PAGE,
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
  const own = { forumId: forum.id, forum: matrix, ownerId: actor.userId }
  const others = { forumId: forum.id, forum: matrix, ownerId: -1 }
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
  }

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
  })

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
        : query.post === 'deleted'
          ? 'That post has been deleted.'
          : query.post === 'unchanged'
            ? 'Nothing changed — that post was already in this state.'
            : null

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
      <ThreadView
        {...view.view}
        regions={{
          posts: view.posts.map((post) => (
            <PostBit key={post.id} post={post} regions={{ actions: <PostActions actions={post.actions} postId={post.id} /> }} />
          )),
          pagination: <Pagination {...view.pagination} />,
          quickReply: null,
        }}
      />
    </main>
  )
}
