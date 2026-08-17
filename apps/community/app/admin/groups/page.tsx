import type { Metadata } from 'next'

import { PanelPage } from '@/components/shell/panel-page'
import { CreateGroupForm } from '@/components/admin/group-forms'
import { adminPageContext } from '@/server/admin'
import { groupAdminRepository } from '@/server/group-admin'
import { PANEL_CARD, PANEL_LIST, PANEL_ROW, PanelActionLink } from '@/components/shell/panel-list'

export const metadata: Metadata = { title: 'Groups' }

export default async function AdminGroupsPage() {
  if ((await adminPageContext()) === null) return null

  const repository = groupAdminRepository()
  if (repository === null) {
    return (
      <PanelPage title="Groups">
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so its groups cannot be edited.
        </p>
      </PanelPage>
    )
  }

  const groups = await repository.list()

  return (
    <PanelPage
      title="Groups"
      lede={
        <>
          A group is a set of permissions and the members who hold it. What a group allows
          here is the <em>default</em> for every forum — a forum may override it, and{' '}
          <a
            href="/admin/forums"
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            forum permissions
          </a>{' '}
          is where that happens.
        </>
      }
    >
      <ul className={PANEL_LIST}>
        {groups.map((group) => (
          <li
            key={group.id}
            className={PANEL_ROW}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {group.title}
                {group.isSystem && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    system
                  </span>
                )}
                {group.isStaffGroup && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    staff
                  </span>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {group.key} · {group.memberCount} member
                {group.memberCount === 1 ? '' : 's'}
                {group.description === null ? '' : ` · ${group.description}`}
              </span>
            </span>
            <a
              href={`/admin/groups/${group.id}`}
              aria-label={`Edit ${group.title}`}
              className="shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              Edit
            </a>
          </li>
        ))}
      </ul>

      <nav className="flex flex-wrap gap-2">
        <PanelActionLink href="/admin/groups/promotions">Promotions</PanelActionLink>
        <PanelActionLink href="/admin/groups/memberships">Mass membership change</PanelActionLink>
      </nav>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">Add a group</h2>
        <CreateGroupForm
          groups={groups.map((group) => ({
            id: group.id,
            title: group.title,
            memberCount: group.memberCount,
          }))}
        />
      </section>
    </PanelPage>
  )
}
