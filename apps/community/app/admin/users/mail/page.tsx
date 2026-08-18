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
        back={{ href: '/admin/users', label: 'All members' }}
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

  return (
    <PanelPage
      back={{ href: '/admin/users', label: 'All members' }}
      title={await tr('page.mass-mail')}
      lede={
        <>
          Sends one message to every member of a group. It goes only to addresses the board has{' '}
          <strong>verified</strong> — an unverified address is as often a typo, or somebody
          else&rsquo;s mailbox, as it is the member&rsquo;s.
        </>
      }
    >
      <section className={PANEL_CARD}>
        <MassMailForm
          groups={audiences}
          copy={userMassMailCopy(everybody, await getTranslator())}
        />
      </section>

      <div className={cn(PANEL_CARD, 'gap-2 text-xs text-muted-foreground')}>
        <p>{await tr('page.before-press-it')}</p>
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>
            Nothing is sent immediately. Messages are queued and go out as the scheduled tick drains
            them.
          </li>
          <li>
            There is no unsubscribe link and no per-member opt-out, so this is for things every
            member needs to know rather than for anything promotional.
          </li>
          <li>
            A campaign that stops half way is continued, never restarted — restarting would mail
            everybody a second time.
          </li>
          <li>{await tr('page.email-cannot-be-unsent')}</li>
        </ul>
      </div>
    </PanelPage>
  )
}
