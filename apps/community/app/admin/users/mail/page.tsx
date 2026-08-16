import type { Metadata } from 'next'

import { PanelPage } from '@/components/shell/panel-page'
import { MassMailForm } from '@/components/admin/user-forms'
import { adminPageContext } from '@/server/admin'
import { userAdminRepository, userBulkRepository } from '@/server/user-admin'

export const metadata: Metadata = { title: 'Mass mail' }

export default async function AdminMassMailPage() {
  if ((await adminPageContext()) === null) return null

  const bulk = userBulkRepository()
  const users = userAdminRepository()
  if (bulk === null || users === null) {
    return (
      <PanelPage
        back={{ href: '/admin/users', label: 'All members' }}
        title="Mass mail"
        lede="This board is running on in-memory sample data, so it has nobody to mail."
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
      title="Mass mail"
      lede={
        <>
          Sends one message to every member of a group. It goes only to addresses the
          board has <strong>verified</strong> — an unverified address is as often a typo,
          or somebody else&rsquo;s mailbox, as it is the member&rsquo;s.
        </>
      }
    >
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <MassMailForm groups={audiences} audience={everybody} />
      </section>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 text-xs text-muted-foreground">
        <p>Before you press it:</p>
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>
            Nothing is sent immediately. Messages are queued and go out as the scheduled
            tick drains them.
          </li>
          <li>
            There is no unsubscribe link and no per-member opt-out, so this is for things
            every member needs to know rather than for anything promotional.
          </li>
          <li>
            A campaign that stops half way is continued, never restarted — restarting
            would mail everybody a second time.
          </li>
          <li>An email cannot be unsent.</li>
        </ul>
      </div>
    </PanelPage>
  )
}
