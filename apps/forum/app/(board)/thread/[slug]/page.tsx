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
  searchParams: Promise<{ after?: string; page?: string; replied?: string; posted?: string }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = threadId(slug)
  const after = afterId(query.after)
  const page = query.page === undefined ? 1 : Number(query.page)
  if (id === null || after === null || !Number.isSafeInteger(page) || page < 1) notFound()

  const actor = await getActor()
  const { forums, posts, threads, authorizer, threadViews, threadWrites } = getContainer()
  const thread = await threads.findVisibleById(id)
  if (!thread) notFound()

  const forum = await forums.findById(thread.forumId)
  if (!forum || forum.type !== 'forum') notFound()
  const matrix = await authorizer.forumMatrix(actor, forum.id)
  if (!authorizer.can(actor, 'thread.view', { forumId: forum.id, forum: matrix })) notFound()

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

  const postPage = await posts.listThread(
    thread.id,
    after === undefined ? { limit: POSTS_PER_PAGE } : { afterId: after, limit: POSTS_PER_PAGE },
  )
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

  const view = buildThreadView({
    thread,
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
        ? 'Your reply was posted and is waiting for a moderator to approve it.'
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
