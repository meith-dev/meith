import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@forum/theme-kit'

import {
  DeletePostForm,
  EditPostForm,
  RestorePostForm,
} from '@/components/content/edit-post-form'
import { resolvePostScope } from '@/server/post-scope'
import { activeTheme } from '@/server/theme'
import { buildEditView } from '@/view/post-form'

export const metadata: Metadata = { title: 'Edit post' }

function threadId(value: string): number | null {
  const match = /^(\d+)(?:-|$)/.exec(value)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function postId(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

/**
 * F41 — managing one post.
 *
 * Both of the post's manageable states live here, because they are the same
 * decision seen from either side and a second route would 404 whenever another
 * moderator acted first. Which forms appear is decided by `resolvePostScope`,
 * the same function the three actions re-run before writing — this page offers
 * controls, it does not grant anything.
 */
export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ post?: string }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const thread = threadId(slug)
  const post = postId(query.post)
  if (thread === null || post === null) notFound()

  const scope = await resolvePostScope(thread, post)
  if (scope === null) notFound()

  const isDeleted = scope.target.post.visibility === 'deleted'
  /*
   * Nothing on offer is a 404, not an empty page. A member who cannot edit a
   * post has no more business knowing this screen exists for it than they have
   * knowing about a forum they cannot see.
   */
  const mayManage = isDeleted ? scope.mayRestore : scope.mayEdit || scope.mayDelete
  if (!mayManage) notFound()

  /*
   * No second read of the thread. `resolvePostScope` already resolved it with
   * the post, and reading it again would be a second visibility decision made
   * somewhere else — which is exactly what F47 exists to stop.
   */
  const view = buildEditView({
    thread: {
      id: scope.target.thread.id,
      title: scope.target.thread.title,
      slug: scope.target.thread.slug,
    },
    postId: post,
    isDeleted,
  })

  const PostForm = requireSlot(activeTheme, 'PostForm')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <PostForm
        {...view}
        regions={{
          form: isDeleted ? (
            <RestorePostForm threadId={thread} postId={post} />
          ) : (
            <>
              {scope.mayEdit && (
                <EditPostForm
                  threadId={thread}
                  postId={post}
                  message={scope.target.post.message}
                  reason={null}
                />
              )}
              {scope.mayDelete && <DeletePostForm threadId={thread} postId={post} />}
            </>
          ),
          toolbar: null,
        }}
      />
    </main>
  )
}
