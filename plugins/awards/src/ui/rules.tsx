import type { PluginAdminPageContext } from '@meith/plugin-kit'
import { controlVariants, surfaceVariants, textLinkVariants } from '@meith/ui'

import { asId } from '../awards'
import { type AwardRule, CRITERIA } from '../rules'
import { allAwards, awardRules } from '../store'
import {
  action,
  button,
  checkbox,
  date,
  field,
  notice,
  type TextContext,
  translated,
} from './shared'

const LABELS = {
  minPostCount: 'awards.rule.posts',
  minThreadCount: 'awards.rule.threads',
  minReputation: 'awards.rule.reputation',
  minDaysRegistered: 'awards.rule.days',
} as const
const FIELDS = {
  minPostCount: 'min_post_count',
  minThreadCount: 'min_thread_count',
  minReputation: 'min_reputation',
  minDaysRegistered: 'min_days_registered',
} as const

export function ruleSummary(context: TextContext, rule: AwardRule): string {
  return `${translated(context, 'awards.rule.all')} ${CRITERIA.filter((key) => rule[key] !== null)
    .map((key) => `${translated(context, LABELS[key])}: ${rule[key]}`)
    .join(' · ')}`
}

export async function RulesAdmin(context: PluginAdminPageContext) {
  const rules = await awardRules(context.data)
  const awards = await allAwards(context.data)
  const names = new Map(awards.map((award) => [Number(award.id), award.name]))
  const edit = rules.find((rule) => rule.id === asId(context.query.edit))
  const state = await context.data.one<{ cursor: number; completed_at: string | Date | null }>(
    `select cursor, completed_at from plugin_awards_scan where id = 1`,
  )
  return (
    <div className="flex flex-col gap-4">
      {notice(context, context.query.notice)}
      <section className={surfaceVariants({ padded: true, className: 'flex flex-col gap-3' })}>
        <p>
          {translated(context, 'awards.rule.cursor')}: {state?.cursor ?? 0}
        </p>
        <p>
          {translated(context, 'awards.rule.completed')}:{' '}
          {state?.completed_at == null
            ? translated(context, 'awards.rule.never')
            : date(context, state.completed_at)}
        </p>
        <div className="flex flex-wrap gap-3">
          {action(context, 'rules', 1, 'run', 'awards.rule.run')}
          {action(context, 'rules', 1, 'reset', 'awards.rule.reset')}
        </div>
        <p className="text-sm text-muted-foreground">{translated(context, 'awards.rule.budget')}</p>
      </section>
      <form
        method="post"
        action="/admin/api/plugins/awards/rules"
        className={surfaceVariants({ padded: true, className: 'grid gap-3 sm:grid-cols-2' })}
      >
        <h2 className="font-semibold sm:col-span-2">
          {translated(context, edit === undefined ? 'awards.rule.create' : 'awards.rule.edit')}
        </h2>
        {edit !== undefined && <input type="hidden" name="id" value={edit.id} />}
        {field(context, 'title', 'awards.rule.title', edit?.title ?? '', 'text', true)}
        <label className="flex flex-col gap-1">
          {translated(context, 'awards.award')}
          <select
            name="award_id"
            required
            defaultValue={edit?.awardId}
            className={controlVariants()}
          >
            {awards
              .filter((award) => award.archived_at === null)
              .map((award) => (
                <option key={award.id} value={award.id}>
                  {award.name}
                </option>
              ))}
          </select>
        </label>
        {CRITERIA.map((key) => (
          <div key={key}>
            {field(context, FIELDS[key], LABELS[key], edit?.[key] ?? '', 'number')}
          </div>
        ))}
        {checkbox(context, 'enabled', 'awards.rule.enabled', edit?.enabled ?? true)}
        <p className="text-sm text-muted-foreground">{translated(context, 'awards.rule.help')}</p>
        <div>{button(context, 'awards.rule.save')}</div>
      </form>
      <ul className="flex flex-col gap-3">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={surfaceVariants({ padded: true, className: 'flex flex-col gap-2' })}
          >
            <a href={`/admin/plugins/awards/rules?edit=${rule.id}`} className={textLinkVariants()}>
              {rule.title}
            </a>
            <p>{names.get(rule.awardId)}</p>
            <p className="text-sm">{ruleSummary(context, rule)}</p>
            <div className="flex gap-3">
              {action(
                context,
                'rules',
                rule.id,
                rule.enabled ? 'disable' : 'enable',
                rule.enabled ? 'awards.rule.disable' : 'awards.rule.enable',
              )}
              {action(context, 'rules', rule.id, 'delete', 'awards.delete')}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
