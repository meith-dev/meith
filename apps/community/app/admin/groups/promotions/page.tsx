import type { Metadata } from 'next'

import { cn } from '@meith/ui'

import {
  ApplyPromotionsForm,
  NewPromotionRuleForm,
  PromotionRuleRowForm,
} from '@/components/admin/group-forms'
import { PANEL_CARD, PANEL_LIST, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import {
  groupAdminRepository,
  previewPromotions,
  promotionRuleRepository,
} from '@/server/group-admin'
import { getTranslator, tr } from '@/server/i18n'
import { groupAdminCopy } from '@/view/admin-group-copy'
import { promotionRuleFormValues, promotionRuleSummary } from '@/view/promotion-rules'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.promotions') }
}

export default async function AdminPromotionsPage() {
  if ((await adminPageContext()) === null) return null

  const repository = groupAdminRepository()
  const rules = promotionRuleRepository()
  const result = await previewPromotions()

  if (repository === null || rules === null || result === null) {
    return (
      <PanelPage title={await tr('page.promotions')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {await tr('page.this-board-running-in-memory-sample-8')}
        </p>
      </PanelPage>
    )
  }

  const groups = await repository.list()
  const stored = await rules.listRules()
  const copy = groupAdminCopy(await getTranslator())

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
      title={await tr('page.promotions')}
      lede={
        <>
          A promotion rule moves a member into a group once they have earned it. The rules are here,
          and beneath them is what they would do right now — the same evaluation the scheduled task
          runs, with the writing turned off.
        </>
      }
      gap="loose"
    >
      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">Rules</h2>

        {stored.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rule is configured, so nothing is ever promoted. Add one below and this page will
            show who it would move.
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
                  copy={copy}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.add-rule')}</h2>
        <NewPromotionRuleForm groups={options} copy={copy} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          {await tr('page.what-would-happen-now')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {result.examined} member{result.examined === 1 ? '' : 's'} examined.
        </p>

        {result.outcomes.length === 0 ? (
          <p className={PANEL_NOTE}>
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
                    {title(outcome.fromPrimaryGroupId)} → {title(outcome.toPrimaryGroupId)} ·{' '}
                    {outcome.ruleTitle}
                  </span>
                </li>
              ))}
            </ul>

            <section className={PANEL_CARD}>
              <h3 className="font-heading text-lg font-semibold">{await tr('page.run-it')}</h3>
              <ApplyPromotionsForm count={result.outcomes.length} copy={copy} />
            </section>
          </>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        A promotion never lifts a ban, never demotes, and never re-applies to somebody already in
        the target group. Banned members and staff are skipped entirely, whatever the rules say. An
        enabled rule is also applied without anybody pressing anything, by the{' '}
        <code>promotions.apply</code> task, every six hours.
      </p>
    </PanelPage>
  )
}
