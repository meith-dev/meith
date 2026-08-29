import type { Metadata } from 'next'

import {
  ApplyPromotionsForm,
  NewPromotionRuleForm,
  PromotionRuleRowForm,
} from '@/components/admin/group-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
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
  const translator = await getTranslator()
  const copy = groupAdminCopy(translator)

  const titles = new Map(groups.map((group) => [group.id, group.title]))
  const title = (id: number | null): string =>
    id === null
      ? translator.t('adminGroups.noGroup')
      : (titles.get(id) ?? translator.t('adminGroups.group', { id }))

  const options = groups.map((group) => ({
    id: group.id,
    title: group.title,
    memberCount: group.memberCount,
  }))

  return (
    <PanelPage
      back={{ href: '/admin/groups', label: translator.t('adminGroups.all') }}
      title={await tr('page.promotions')}
      lede={translator.t('adminGroups.promotionsLede')}
      gap="loose"
    >
      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminGroups.rules')}</h2>

        {stored.length === 0 ? (
          <p className="text-sm text-muted-foreground">{translator.t('adminGroups.noRules')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {stored.map((rule) => (
              <div key={rule.id} className="flex flex-col gap-1">
                <p className="pt-4 text-xs text-muted-foreground">
                  {promotionRuleSummary(rule, title)}
                  {rule.enabled ? '' : translator.t('adminGroups.disabled')}
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

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {await tr('page.what-would-happen-now')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translator.t('adminGroups.examined', { count: result.examined })}
        </p>

        {result.complete ? null : (
          <p className="text-sm text-muted-foreground">
            {translator.t('adminGroups.previewCapped', { count: result.examined })}
          </p>
        )}

        {result.outcomes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {stored.length === 0
              ? translator.t('adminGroups.nobodyNoRules')
              : translator.t('adminGroups.nobodyQualified')}
          </p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-border text-sm">
              {result.outcomes.map((outcome) => (
                <li
                  key={`${outcome.userId}:${outcome.ruleId}`}
                  className="flex flex-wrap items-baseline gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <span className="font-medium">
                    {translator.t('adminGroups.member', { id: outcome.userId })}
                  </span>
                  <span className="text-muted-foreground">
                    {title(outcome.fromPrimaryGroupId)} → {title(outcome.toPrimaryGroupId)} ·{' '}
                    {outcome.ruleTitle}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <h3 className="font-heading text-base font-semibold">{await tr('page.run-it')}</h3>
              <ApplyPromotionsForm count={result.outcomes.length} copy={copy} />
            </div>
          </>
        )}

        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          {translator.t('adminGroups.promotionNoteBefore')} <code>promotions.apply</code>
          {translator.t('adminGroups.promotionNoteEnd')}
        </p>
      </section>
    </PanelPage>
  )
}
