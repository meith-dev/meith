import type { Metadata } from 'next'

import { PanelPage } from '@/components/shell/panel-page'
import { ApplyPromotionsForm } from '@/components/admin/group-forms'
import { requireAdmin } from '@/server/admin'
import { groupAdminRepository, previewPromotions } from '@/server/group-admin'

export const metadata: Metadata = { title: 'Promotions' }

/**
 * F66 — the promotion dry run.
 *
 * This screen is a *caller* of `PromotionService.preview()`, not a second
 * implementation of it. `preview()` and `apply()` are the same evaluation
 * differing only in whether the outcomes are written, which is what stops a
 * preview from ever disagreeing with the run it previewed — a screen that
 * computed the list itself would eventually lie, and the thing it would lie
 * about is who is about to be moved between groups.
 *
 * The dry run is unconditional: opening this page runs it. It writes nothing,
 * and a promotions screen that showed rules without their consequences would be
 * asking an operator to evaluate the rules in their head.
 */
export default async function AdminPromotionsPage() {
  await requireAdmin()

  const repository = groupAdminRepository()
  const result = await previewPromotions()

  if (repository === null || result === null) {
    return (
      <PanelPage title="Promotions">
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so promotions cannot run.
        </p>
      </PanelPage>
    )
  }

  const titles = new Map(
    (await repository.list()).map((group) => [group.id, group.title]),
  )
  const title = (id: number | null): string =>
    id === null ? 'no group' : (titles.get(id) ?? `group ${id}`)

  return (
    <PanelPage
      back={{ href: '/admin/groups', label: 'All groups' }}
      title="Promotions"
      lede={
        <>
          What the promotion rules would do right now. Nothing on this page has been
          written — it is the same evaluation the scheduled task runs, with the writing
          turned off.
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {result.examined} member{result.examined === 1 ? '' : 's'} examined.
      </p>

      {result.outcomes.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Nobody would be promoted. Either no rule is configured, or everyone who
          qualifies is already where the rules would put them.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
            {result.outcomes.map((outcome) => (
              <li
                key={`${outcome.userId}:${outcome.ruleId}`}
                className="flex flex-wrap items-baseline gap-2 px-4 py-2"
              >
                <span className="font-medium">member {outcome.userId}</span>
                <span className="text-muted-foreground">
                  {title(outcome.fromPrimaryGroupId)} → {title(outcome.toPrimaryGroupId)}{' '}
                  · {outcome.ruleTitle}
                </span>
              </li>
            ))}
          </ul>

          <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <h2 className="font-heading text-lg font-semibold">Run it</h2>
            <ApplyPromotionsForm count={result.outcomes.length} />
          </section>
        </>
      )}

      {/*
        Named, because the guards are the reason this list is shorter than an
        operator might expect — and an unexplained absence reads as a bug.
      */}
      <p className="text-xs text-muted-foreground">
        A promotion never lifts a ban, never demotes, and never re-applies to somebody
        already in the target group. Banned members and staff are skipped entirely,
        whatever the rules say.
      </p>
    </PanelPage>
  )
}
