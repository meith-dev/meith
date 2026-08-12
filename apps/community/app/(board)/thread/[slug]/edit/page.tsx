import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import {
  DeletePostForm,
  EditPostForm,
  RestorePostForm,
} from '@/components/content/edit-post-form'
import { resolvePostScope } from '@/server/post-scope'
import { currentTheme } from '@/server/theme'
import { buildEditView } from '@/view/post-form'
import { leadingId } from '@/view/slug-id'

export const metadata: Metadata = { title: 'Edit post' }

function postId(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ post?: string }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const thread = leadingId(slug)
  const post = postId(query.post)
  if (thread === null || post === null) notFound()

  const scope = await resolvePostScope(thread, post)
  if (scope === null) notFound()

  const isDeleted = scope.target.post.visibility === 'deleted'
  const mayManage = isDeleted ? scope.mayRestore : scope.mayEdit || scope.mayDelete
  if (!mayManage) notFound()

  const view = buildEditView({
    thread: {
      id: scope.target.thread.id,
      title: scope.target.thread.title,
      slug: scope.target.thread.slug,
    },
    postId: post,
    isDeleted,
  })

  const PostForm = requireSlot(await currentTheme(), 'PostForm')

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
