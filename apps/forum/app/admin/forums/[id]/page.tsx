import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ForumOptionsForm } from '@/components/admin/forum-forms'
import { requireAdmin } from '@/server/admin'
import { getContainer } from '@/server/container'
import { forumAdminRepository } from '@/server/forum-admin'

export const metadata: Metadata = { title: 'Forum options' }

/** F65 — one forum's options. The tree position is `move`'s, not this form's. */
export default async function AdminForumPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const forums = await getContainer().forums.listAll()
  const forum = forums.find((row) => row.id === Number(id))
  if (forum === undefined) notFound()

  /*
   * The options come from their own read rather than from the listing row: the
   * board's forum query deliberately does not carry eight posting toggles it
   * never renders.
   */
  const options = await forumAdminRepository()?.readOptions(forum.id)
  if (options === null || options === undefined) notFound()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <a href="/admin/forums" className="text-sm text-primary hover:underline">
          ← All forums
        </a>
        <h1 className="font-serif text-2xl font-semibold">{forum.title}</h1>
        <p className="text-sm text-muted-foreground">
          Position in the tree is not edited here — moving a forum re-parents a
          whole subtree and takes the forest lock.
        </p>
      </div>

      <ForumOptionsForm
        forum={{
          id: forum.id,
          title: options.title,
          slug: options.slug,
          description: options.description ?? '',
          linkUrl: options.linkUrl ?? '',
          displayOrder: options.displayOrder,
          flags: {
            isOpen: options.isOpen,
            allowThreads: options.allowThreads,
            allowReplies: options.allowReplies,
            allowPolls: options.allowPolls,
            allowAttachments: options.allowAttachments,
            requiresPrefix: options.requiresPrefix,
            moderateNewThreads: options.moderateNewThreads,
            moderateNewPosts: options.moderateNewPosts,
          },
        }}
      />
    </div>
  )
}
