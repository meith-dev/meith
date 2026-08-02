import type { Metadata } from 'next'

import { CreateGroupForm } from '@/components/admin/group-forms'
import { requireAdmin } from '@/server/admin'
import { groupAdminRepository } from '@/server/group-admin'

export const metadata: Metadata = { title: 'Groups' }

/**
 * F66 — the group grid.
 *
 * Member counts are on it because the two dangerous operations on this screen —
 * deleting a group, and moving a group's members — are both "how many people
 * does this affect?" questions, and a screen that cannot answer that is one an
 * operator has to guess at.
 *
 * System groups are marked rather than hidden. Their permissions are editable
 * (that is most of what this panel is for); it is only *deleting* them that is
 * refused, because the board's own code resolves them by key.
 */
export default async function AdminGroupsPage() {
  /* Re-run, because a layout is not a security boundary (see the ACP layout). */
  await requireAdmin()

  const repository = groupAdminRepository()
  if (repository === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">Groups</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so its groups cannot
          be edited.
        </p>
      </div>
    )
  }

  const groups = await repository.list()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Groups</h1>
        <p className="text-sm text-muted-foreground">
          A group is a set of permissions and the members who hold it. What a
          group allows here is the <em>default</em> for every forum — a forum
          may override it, and{' '}
          <a href="/admin/forums" className="text-primary hover:underline">
            forum permissions
          </a>{' '}
          is where that happens.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {groups.map((group) => (
          <li key={group.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
              className="shrink-0 text-sm text-primary hover:underline"
            >
              Edit
            </a>
          </li>
        ))}
      </ul>

      <nav className="flex flex-wrap gap-4 text-sm">
        <a href="/admin/groups/promotions" className="text-primary hover:underline">
          Promotions
        </a>
        <a href="/admin/groups/memberships" className="text-primary hover:underline">
          Mass membership change
        </a>
      </nav>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Add a group</h2>
        <CreateGroupForm
          groups={groups.map((group) => ({
            id: group.id,
            title: group.title,
            memberCount: group.memberCount,
          }))}
        />
      </section>
    </div>
  )
}
