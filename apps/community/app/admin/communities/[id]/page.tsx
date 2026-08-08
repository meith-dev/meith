import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MODERATOR_RIGHTS } from '@meith/db'

import {
  CommunityOptionsForm,
  ModeratorsPanel,
  MoveCommunityForm,
} from '@/components/admin/community-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { requireAdmin } from '@/server/admin'
import { getContainer } from '@/server/container'
import { communityAdminRepository } from '@/server/community-admin'

export const metadata: Metadata = { title: 'Community options' }

/** F65 — one community's options. The tree position is `move`'s, not this form's. */
export default async function AdminCommunityPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const communities = await getContainer().communities.listAll()
  const community = communities.find((row) => row.id === Number(id))
  if (community === undefined) notFound()

  /*
   * The options come from their own read rather than from the listing row: the
   * board's community query deliberately does not carry eight posting toggles it
   * never renders.
   */
  const repository = communityAdminRepository()
  const options = await repository?.readOptions(community.id)
  if (options === null || options === undefined || repository === null) notFound()

  const moderators = await repository.listModerators(community.id)
  const groups = (await repository.listGroups()).map((group) => ({
    groupId: group.id,
    title: group.title,
  }))

  return (
    <PanelPage
      back={{ href: '/admin/communities', label: 'All communities' }}
      title={community.title}
      lede={
        <>
          Position in the tree is not edited here — moving a community re-parents a whole
          subtree and takes the forest lock.
        </>
      }
      gap="loose"
    >
      <CommunityOptionsForm
        community={{
          id: community.id,
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
        <MoveCommunityForm
          communityId={community.id}
          currentParentId={community.parentId}
          parents={communities
            .filter(
              (row) =>
                row.type !== 'link' &&
                row.id !== community.id &&
                /* Not into its own subtree: `move` refuses it under the forest
                   lock, and offering the option would be offering an error. */
                !row.path.startsWith(`${community.path}.`),
            )
            .map((row) => ({ id: row.id, title: row.title, depth: row.depth }))}
        />
      </section>

      <ModeratorsPanel
        communityId={community.id}
        rights={[...MODERATOR_RIGHTS]}
        moderators={moderators}
        groups={groups}
      />
    </PanelPage>
  )
}
