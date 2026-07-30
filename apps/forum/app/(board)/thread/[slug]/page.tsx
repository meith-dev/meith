import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@forum/theme-kit'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { activeTheme } from '@/server/theme'
import { buildThreadView } from '@/view/thread-view'

const POSTS_PER_PAGE = 20

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
  searchParams: Promise<{ after?: string; page?: string }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const id = threadId(slug)
  const after = afterId(query.after)
  const page = query.page === undefined ? 1 : Number(query.page)
  if (id === null || after === null || !Number.isSafeInteger(page) || page < 1) notFound()

  const actor = await getActor()
  const { forums, posts, threads, authorizer, threadViews } = getContainer()
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
  const view = buildThreadView({
    thread,
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
  const PostBit = requireSlot(activeTheme, 'PostBit')
  const PostActions = requireSlot(activeTheme, 'PostActions')
  const Pagination = requireSlot(activeTheme, 'Pagination')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
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
