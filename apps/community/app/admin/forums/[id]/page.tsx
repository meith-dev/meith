import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MODERATOR_RIGHTS } from '@meith/db'

import {
  ForumOptionsForm,
  ModeratorsPanel,
  MoveForumForm,
} from '@/components/admin/forum-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getContainer } from '@/server/container'
import { forumAdminRepository } from '@/server/forum-admin'

export const metadata: Metadata = { title: 'Forum options' }

export default async function AdminForumPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if ((await adminPageContext()) === null) return null

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const forums = await getContainer().forums.listAll()
  const forum = forums.find((row) => row.id === Number(id))
  if (forum === undefined) notFound()

  const repository = forumAdminRepository()
  const options = await repository?.readOptions(forum.id)
  if (options === null || options === undefined || repository === null) notFound()

  const moderators = await repository.listModerators(forum.id)
  const groups = (await repository.listGroups()).map((group) => ({
    groupId: group.id,
    title: group.title,
  }))

  return (
    <PanelPage
      back={{ href: '/admin/forums', label: 'All forums' }}
      title={forum.title}
      lede={
        <>
          Everything this forum is, apart from where it sits. Order is arranged on the
          tree screen; the move below is the long way round, for a destination too far to
          drag to.
        </>
      }
      gap="loose"
    >
      <ForumOptionsForm
        forum={{
          id: forum.id,
          type: forum.type,
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

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Move</h2>
        <MoveForumForm
          forumId={forum.id}
          currentParentId={forum.parentId}
          parents={forums
            .filter(
              (row) =>
                row.type !== 'link' &&
                row.id !== forum.id &&
                !row.path.startsWith(`${forum.path}.`),
            )
            .map((row) => ({ id: row.id, title: row.title, depth: row.depth }))}
        />
      </section>

      <ModeratorsPanel
        forumId={forum.id}
        rights={[...MODERATOR_RIGHTS]}
        moderators={moderators}
        groups={groups}
      />
    </PanelPage>
  )
}
