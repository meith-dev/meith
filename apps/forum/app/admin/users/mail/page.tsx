import type { Metadata } from 'next'

import { MassMailForm } from '@/components/admin/user-forms'
import { requireAdmin } from '@/server/admin'
import { userAdminRepository, userBulkRepository } from '@/server/user-admin'

export const metadata: Metadata = { title: 'Mass mail' }

/**
 * F67 — mass mail.
 *
 * Nothing is sent from this screen. Pressing the button creates the campaign
 * and enqueues **one job per recipient**; the message is handed to a driver
 * only inside the tick, which is F55's rule and the reason a provider hanging
 * for ten seconds is a task's problem rather than a ten-second button press.
 * One job per member also means a rejected address costs that member's message
 * a retry rather than the whole batch's.
 *
 * The audience count is shown before anything happens, and it is smaller than
 * the membership on purpose: **only verified addresses**. An unverified address
 * is as likely to be a typo — or somebody else's mailbox — as it is to be the
 * member's, and a board that mails thousands of them is a board whose domain
 * stops being delivered anywhere. That is in the query rather than in a
 * checkbox, because it is not a preference.
 */
export default async function AdminMassMailPage() {
  await requireAdmin()

  const bulk = userBulkRepository()
  const users = userAdminRepository()
  if (bulk === null || users === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">Mass mail</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so it has nobody to
          mail.
        </p>
      </div>
    )
  }

  const [groups, audience] = await Promise.all([
    users.listGroups(),
    bulk.massMailAudience(null),
  ])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <a href="/admin/users" className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          ← All members
        </a>
        <h1 className="font-serif text-2xl font-semibold">Mass mail</h1>
        <p className="text-sm text-muted-foreground">
          Sends one message to every member of a group. It goes only to
          addresses the board has <strong>verified</strong> — an unverified
          address is as often a typo, or somebody else&rsquo;s mailbox, as it is
          the member&rsquo;s.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <MassMailForm groups={groups} audience={audience} />
      </section>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 text-xs text-muted-foreground">
        <p>Before you press it:</p>
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>
            Nothing is sent immediately. Messages are queued and go out as the
            scheduled tick drains them.
          </li>
          <li>
            There is no unsubscribe link and no per-member opt-out, so this is
            for things every member needs to know rather than for anything
            promotional.
          </li>
          <li>
            A campaign that stops half way is continued, never restarted —
            restarting would mail everybody a second time.
          </li>
          <li>An email cannot be unsent.</li>
        </ul>
      </div>
    </div>
  )
}
