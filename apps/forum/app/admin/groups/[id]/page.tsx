import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  DeleteGroupForm,
  GroupIdentityForm,
  GroupPermissionsForm,
} from '@/components/admin/group-forms'
import { requireAdmin } from '@/server/admin'
import { buildGroupPermissionView, groupAdminRepository } from '@/server/group-admin'

export const metadata: Metadata = { title: 'Group' }

/**
 * F66 — one group.
 *
 * **Every cell is two states.** F65's forum matrix has three because
 * `forum_permissions` is nullable and null means inherit (R4.1 layer 2); a
 * group's global permissions are layer 1, the bottom of the resolution, with
 * nothing above them to inherit from. A third state here would be an "inherit"
 * that resolves to nothing, which is worse than no control at all.
 *
 * The fields come from `PERMISSION_FIELDS` rather than a list written out here,
 * so a permission added to the registry appears on this screen without anybody
 * remembering to add it — the same rule F64's settings screen follows.
 */
export default async function AdminGroupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const view = await buildGroupPermissionView(Number(id))
  if (view === null) notFound()

  /* For the "move its members to" list on the delete form. */
  const groups = (await groupAdminRepository()?.list()) ?? []

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <a href="/admin/groups" className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          ← All groups
        </a>
        <h1 className="font-serif text-2xl font-semibold">{view.group.title}</h1>
        <p className="text-sm text-muted-foreground">
          <code className="text-xs">{view.group.key}</code> ·{' '}
          {view.group.memberCount} member{view.group.memberCount === 1 ? '' : 's'}
          {view.group.isSystem && ' · a system group: the board resolves it by key'}
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Details</h2>
        <GroupIdentityForm
          group={{
            id: view.group.id,
            title: view.group.title,
            description: view.group.description ?? '',
            displayOrder: view.group.displayOrder,
            isStaffGroup: view.group.isStaffGroup,
            badgeToken: view.group.badgeToken ?? '',
          }}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Permissions</h2>
        <p className="text-sm text-muted-foreground">
          These are this group&rsquo;s answers, not a forum&rsquo;s. A member in
          several groups gets the most permissive of them — a tick can only ever
          grant, never take away — except for the restrictions, where any group
          that lifts one lifts it everywhere.
        </p>
        <GroupPermissionsForm groupId={view.group.id} cells={view.cells} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Delete</h2>
        {view.group.isSystem ? (
          <p className="text-sm text-muted-foreground">
            This group is part of how the board works — registration, bans and
            the control panel resolve it by key — so it cannot be deleted. Its
            permissions are still yours to change.
          </p>
        ) : (
          <DeleteGroupForm
            groupId={view.group.id}
            groups={groups.map((group) => ({
              id: group.id,
              title: group.title,
              memberCount: group.memberCount,
            }))}
          />
        )}
      </section>
    </div>
  )
}
