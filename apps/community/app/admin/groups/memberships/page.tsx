import type { Metadata } from 'next'

import { MoveMembersForm } from '@/components/admin/group-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { groupAdminRepository } from '@/server/group-admin'
import { getTranslator, tr } from '@/server/i18n'
import { groupAdminCopy } from '@/view/admin-group-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.mass-membership-change') }
}

export default async function AdminMembershipsPage() {
  if ((await adminPageContext()) === null) return null

  const repository = groupAdminRepository()
  if (repository === null) {
    return (
      <PanelPage title={await tr('page.mass-membership-change')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {await tr('page.this-board-running-in-memory-sample-7')}
        </p>
      </PanelPage>
    )
  }

  const groups = await repository.list()

  return (
    <PanelPage
      back={{ href: '/admin/groups', label: 'All groups' }}
      title={await tr('page.mass-membership-change')}
      lede={
        <>
          Moves every member of one group into another, a batch at a time. The counts beside each
          group are how many members it holds now.
        </>
      }
    >
      <section className={PANEL_CARD}>
        <MoveMembersForm
          groups={groups.map((group) => ({
            id: group.id,
            title: group.title,
            memberCount: group.memberCount,
          }))}
          copy={groupAdminCopy(await getTranslator())}
        />
      </section>

      <p className="text-xs text-muted-foreground">
        This changes members&rsquo; <strong>primary</strong> group, which is what decides their
        permissions and the badge beside their name. It is not reversible except by moving them
        back.
      </p>
    </PanelPage>
  )
}
