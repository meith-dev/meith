import type { Metadata } from 'next'

import { cn } from '@meith/ui'

import { MassMailForm } from '@/components/admin/user-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { userAdminRepository, userBulkRepository } from '@/server/user-admin'
import { userMassMailCopy } from '@/view/admin-user-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.mass-mail') }
}

export default async function AdminMassMailPage() {
  if ((await adminPageContext()) === null) return null

  const bulk = userBulkRepository()
  const users = userAdminRepository()
  if (bulk === null || users === null) {
    return (
      <PanelPage
        back={{ href: '/admin/users', label: (await getTranslator()).t('adminUsers.allMembers') }}
        title={await tr('page.mass-mail')}
        lede={await tr('page.this-board-running-in-memory-sample')}
      >
        {null}
      </PanelPage>
    )
  }

  const [groups, everybody, byGroup] = await Promise.all([
    users.listGroups(),
    bulk.massMailAudience(null),
    bulk.massMailAudienceByGroup(),
  ])

  const audiences = groups.map((group) => ({
    id: group.id,
    title: group.title,
    audience: byGroup.get(group.id) ?? 0,
  }))
  const translator = await getTranslator()

  return (
    <PanelPage
      back={{ href: '/admin/users', label: translator.t('adminUsers.allMembers') }}
      title={await tr('page.mass-mail')}
      lede={translator.t('adminUsers.massMailLede')}
    >
      <section className={PANEL_CARD}>
        <MassMailForm groups={audiences} copy={userMassMailCopy(everybody, translator)} />
      </section>

      <div className={cn(PANEL_CARD, 'gap-2 text-xs text-muted-foreground')}>
        <p>{await tr('page.before-press-it')}</p>
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>{translator.t('adminUsers.massMailQueued')}</li>
          <li>{translator.t('adminUsers.massMailOptIn')}</li>
          <li>{translator.t('adminUsers.massMailContinues')}</li>
          <li>{await tr('page.email-cannot-be-unsent')}</li>
        </ul>
      </div>
    </PanelPage>
  )
}
