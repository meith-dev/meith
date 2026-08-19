import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot, slotCopy } from '@meith/theme-kit'

import { DeletePostForm, EditPostForm, RestorePostForm } from '@/components/content/edit-post-form'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { resolvePostScope } from '@/server/post-scope'
import { currentTheme } from '@/server/theme'
import { editPostFormCopy } from '@/view/content-copy'
import { buildEditView } from '@/view/post-form'
import { leadingId } from '@/view/slug-id'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.edit-post') }
}

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
    t: await getTranslator(),
    thread: {
      id: scope.target.thread.id,
      title: scope.target.thread.title,
      slug: scope.target.thread.slug,
    },
    postId: post,
    isDeleted,
  })

  const theme = await currentTheme()
  const PostForm = requireSlot(theme, 'PostForm')
  const translator = await getTranslator()
  const formCopy = editPostFormCopy(translator)

  const formModel = await filterView(
    'view.post-form',
    {
      ...view,
      regions: {
        form: isDeleted ? (
          <RestorePostForm copy={formCopy} threadId={thread} postId={post} />
        ) : (
          <>
            {scope.mayEdit && (
              <EditPostForm
                copy={formCopy}
                threadId={thread}
                postId={post}
                message={scope.target.post.message}
                reason={null}
              />
            )}
            {scope.mayDelete && <DeletePostForm copy={formCopy} threadId={thread} postId={post} />}
          </>
        ),
        toolbar: null,
      },
    },
    viewerRef(await getActor()),
  )

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <PostForm {...formModel} copy={slotCopy(theme, 'PostForm', translator)} />
    </main>
  )
}
