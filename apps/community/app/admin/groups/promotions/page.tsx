import type { Metadata } from 'next'

import { PanelPage } from '@/components/shell/panel-page'
import {
  ApplyPromotionsForm,
  NewPromotionRuleForm,
  PromotionRuleRowForm,
} from '@/components/admin/group-forms'
import { adminPageContext } from '@/server/admin'
import {
  groupAdminRepository,
  previewPromotions,
  promotionRuleRepository,
} from '@/server/group-admin'
import { promotionRuleFormValues, promotionRuleSummary } from '@/view/promotion-rules'
import { PANEL_LIST } from '@/components/shell/panel-list'
import { cn } from '@meith/ui'

export const metadata: Metadata = { title: 'Promotions' }

export default async function AdminPromotionsPage() {
  if ((await adminPageContext()) === null) return null

  const repository = groupAdminRepository()
  const rules = promotionRuleRepository()
  const result = await previewPromotions()

  if (repository === null || rules === null || result === null) {
    return (
      <PanelPage title="Promotions">
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so promotions cannot run.
        </p>
      </PanelPage>
    )
  }

  const groups = await repository.list()
  const stored = await rules.listRules()

  const titles = new Map(groups.map((group) => [group.id, group.title]))
  const title = (id: number | null): string =>
    id === null ? 'no group' : (titles.get(id) ?? `group ${id}`)

  const options = groups.map((group) => ({
    id: group.id,
    title: group.title,
    memberCount: group.memberCount,
  }))

  return (
    <PanelPage
      back={{ href: '/admin/groups', label: 'All groups' }}
      title="Promotions"
      lede={
        <>
          A promotion rule moves a member into a group once they have earned it. The rules
          are here, and beneath them is what they would do right now — the same evaluation
          the scheduled task runs, with the writing turned off.
        </>
      }
      gap="loose"
    >
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Rules</h2>

        {stored.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rule is configured, so nothing is ever promoted. Add one below and this
            page will show who it would move.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {stored.map((rule) => (
              <div key={rule.id} className="flex flex-col gap-1">
                <p className="pt-4 text-xs text-muted-foreground">
                  {promotionRuleSummary(rule, title)}
                  {rule.enabled ? '' : ' · disabled'}
                </p>
                <PromotionRuleRowForm
                  rule={promotionRuleFormValues(rule)}
                  groups={options}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Add a rule</h2>
        <NewPromotionRuleForm groups={options} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">What would happen now</h2>
        <p className="text-sm text-muted-foreground">
          {result.examined} member{result.examined === 1 ? '' : 's'} examined.
        </p>

        {result.outcomes.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            {stored.length === 0
              ? 'Nobody would be promoted, because there is no rule to promote them by.'
              : 'Nobody would be promoted. Everyone who qualifies is already where these rules would put them.'}
          </p>
        ) : (
          <>
            <ul className={cn(PANEL_LIST, 'text-sm')}>
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
              <h3 className="font-heading text-lg font-semibold">Run it</h3>
              <ApplyPromotionsForm count={result.outcomes.length} />
            </section>
          </>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        A promotion never lifts a ban, never demotes, and never re-applies to somebody
        already in the target group. Banned members and staff are skipped entirely,
        whatever the rules say. An enabled rule is also applied without anybody pressing
        anything, by the <code>promotions.apply</code> task, every six hours.
      </p>
    </PanelPage>
  )
}
