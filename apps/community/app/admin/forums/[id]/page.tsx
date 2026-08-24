import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MODERATOR_RIGHTS } from '@meith/db'

import { ForumOptionsForm, ModeratorsPanel, MoveForumForm } from '@/components/admin/forum-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getContainer } from '@/server/container'
import { forumAdminRepository } from '@/server/forum-admin'
import { getTranslator, tr } from '@/server/i18n'
import { forumAdminCopy } from '@/view/admin-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.forum-options') }
}

export default async function AdminForumPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await adminPageContext()) === null) return null

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const forums = await getContainer().forums.listAll()
  const forum = forums.find((row) => row.id === Number(id))
  if (forum === undefined) notFound()

  const repository = forumAdminRepository()
  const options = await repository?.readOptions(forum.id)
  if (options === null || options === undefined || repository === null) notFound()

  const [t, moderators, groupRows] = await Promise.all([
    getTranslator(),
    repository.listModerators(forum.id),
    repository.listGroups(),
  ])
  const groups = groupRows.map((group) => ({
    groupId: group.id,
    title: group.title,
  }))

  return (
    <PanelPage
      back={{ href: '/admin/forums', label: t.t('adminForums.all') }}
      title={forum.title}
      lede={t.t('adminForums.optionsLede')}
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
        copy={forumAdminCopy(t)}
      />

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{t.t('adminForums.move')}</h2>
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
          copy={forumAdminCopy(t)}
        />
      </section>

      <ModeratorsPanel
        forumId={forum.id}
        rights={[...MODERATOR_RIGHTS]}
        moderators={moderators}
        groups={groups}
        copy={forumAdminCopy(t)}
      />
    </PanelPage>
  )
}
