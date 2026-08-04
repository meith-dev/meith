import type { Metadata } from 'next'

import { MoveMembersForm } from '@/components/admin/group-forms'
import { requireAdmin } from '@/server/admin'
import { groupAdminRepository } from '@/server/group-admin'

export const metadata: Metadata = { title: 'Mass membership change' }

/**
 * F66 — the chunked mass move.
 *
 * The chunking is the feature. Moving every member of a group in one statement
 * holds row locks on `users` — the table every request on the board reads —
 * for as long as the update takes, which on a board with five figures of
 * members is long enough to look like an outage. Bounded batches on a keyset
 * cursor mean the run is interruptible, resumable, and never blocks the board.
 *
 * The cursor travels in the form, so a run continues across presses **with no
 * JavaScript** (D06). That is also why the screen does not have a progress bar:
 * a bar would be an island, and this works without one.
 */
export default async function AdminMembershipsPage() {
  await requireAdmin()

  const repository = groupAdminRepository()
  if (repository === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">Mass membership change</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so its memberships
          cannot be edited.
        </p>
      </div>
    )
  }

  const groups = await repository.list()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <a href="/admin/groups" className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          ← All groups
        </a>
        <h1 className="font-serif text-2xl font-semibold">Mass membership change</h1>
        <p className="text-sm text-muted-foreground">
          Moves every member of one group into another, a batch at a time. The
          counts beside each group are how many members it holds now.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <MoveMembersForm
          groups={groups.map((group) => ({
            id: group.id,
            title: group.title,
            memberCount: group.memberCount,
          }))}
        />
      </section>

      <p className="text-xs text-muted-foreground">
        This changes members&rsquo; <strong>primary</strong> group, which is
        what decides their permissions and the badge beside their name. It is
        not reversible except by moving them back.
      </p>
    </div>
  )
}
