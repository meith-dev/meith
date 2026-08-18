import type { ReactNode } from 'react'

import type { PluginAdminPageContext } from '@meith/plugin-kit'

import type { DuesConfig } from '../config'
import { formatMinor } from '../money'
import { describeBilling, isLifetime, loadPlans, MAX_PLAN_DAYS } from '../plans'
import {
  allMemberships,
  attentionCount,
  type CodeRow,
  listCodes,
  type MembershipRow,
  monthlyTotals,
  ordersNeedingAttention,
  type PlanRow,
  recentEvents,
  recentLedger,
} from '../store'
import { SUBSCRIBED_EVENT_TYPES } from '../stripe/events'

const QUIET_PANEL = 'rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground'

const CARD =
  'flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground ' +
  'shadow-elevation'
const TH = 'px-2 py-1.5 text-left text-xs font-medium text-muted-foreground'
const TD = 'px-2 py-1.5 align-top'
const INPUT =
  'rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const ACT_BUTTON =
  'inline-flex h-8 items-center justify-center rounded-md border border-transparent ' +
  'bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover'
const QUIET_BUTTON =
  'inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-sm'

function fmt(date: Date, context: PluginAdminPageContext): string {
  return context.t.parts(date, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
}

function GoodNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
      {children}
    </p>
  )
}

function BadNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
    >
      {children}
    </p>
  )
}

function Attention({ count, context }: { count: number; context: PluginAdminPageContext }) {
  if (count === 0) return null
  return (
    <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
      {context.t.t('dues.admin.status.attention', { count })}
    </p>
  )
}

export async function StatusPage({
  config,
  context,
}: {
  config: DuesConfig
  context: PluginAdminPageContext
}) {
  const attention = await attentionCount(context.data)
  const events = await recentEvents(context.data, 10)
  const flaggedOrders = await ordersNeedingAttention(context.data, 20)
  const plans = await loadPlans(context.data, config)

  const keySet = String(context.settings.stripe_secret_key ?? '') !== ''
  const webhookSet = String(context.settings.stripe_webhook_secret ?? '') !== ''

  return (
    <div className="flex flex-col gap-4">
      {context.query.cleared !== undefined && (
        <GoodNotice>{context.t.t('dues.admin.status.flagCleared')}</GoodNotice>
      )}
      {context.query.error !== undefined && (
        <BadNotice>{context.t.t('dues.admin.status.flagMissing')}</BadNotice>
      )}
      <Attention count={attention} context={context} />

      {flaggedOrders.length > 0 && (
        <section className={CARD}>
          <h2 className="font-heading text-lg font-semibold">
            {context.t.t('dues.admin.status.orders')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {context.t.t('dues.admin.status.ordersText')}
          </p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {flaggedOrders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {context.t.t('dues.admin.status.order', {
                    id: order.id,
                    plan: order.planName,
                    amount: formatMinor(order.amountMinor, order.currency, context.locale),
                  })}
                  <span className="block text-xs text-muted-foreground">
                    {order.needsAttention}
                  </span>
                </span>
                <form method="post" action="/admin/api/plugins/dues/attention/clear">
                  <input type="hidden" name="order" value={order.id} />
                  <button type="submit" className={QUIET_BUTTON}>
                    {context.t.t('dues.admin.status.clear')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.admin.status.working')}
        </h2>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{context.t.t('dues.admin.status.secret')}</dt>
            <dd>
              {context.t.t(keySet ? 'dues.admin.status.keySet' : 'dues.admin.status.keyUnset')}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">
              {context.t.t('dues.admin.status.webhookSecret')}
            </dt>
            <dd>
              {context.t.t(
                webhookSet ? 'dues.admin.status.keySet' : 'dues.admin.status.webhookUnset',
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{context.t.t('dues.admin.status.grace')}</dt>
            <dd>{context.t.t('dues.admin.status.days', { count: config.graceDays })}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">{context.t.t('dues.admin.status.source')}</p>
      </section>

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.admin.status.webhook')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {context.t.t('dues.admin.status.webhookText')}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          {SUBSCRIBED_EVENT_TYPES.map((type) => (
            <code key={type} className="text-xs text-muted-foreground">
              {type}
            </code>
          ))}
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.admin.status.plans')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {context.t.t('dues.admin.status.plansText')}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-96 border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>{context.t.t('dues.admin.status.plan')}</th>
                <th className={TH}>{context.t.t('dues.admin.status.price')}</th>
                <th className={TH}>{context.t.t('dues.admin.status.billing')}</th>
                <th className={TH}>{context.t.t('dues.admin.status.group')}</th>
                <th className={TH}>{context.t.t('dues.admin.status.giftable')}</th>
              </tr>
            </thead>
            <tbody>
              {plans
                .filter((plan) => !plan.archived)
                .map((plan) => (
                  <tr key={plan.key} className="border-b border-border">
                    <td className={TD}>
                      {plan.name}
                      {plan.hidden && (
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          · {context.t.t('dues.admin.status.hidden')}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      {formatMinor(plan.priceMinor, plan.currency, context.locale)}
                    </td>
                    <td className={TD}>{describeBilling(plan)}</td>
                    <td className={TD}>
                      <code className="text-xs">{plan.groupKey}</code>
                    </td>
                    <td className={TD}>
                      {context.t.t(
                        plan.giftable ? 'dues.admin.status.yes' : 'dues.admin.status.no',
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.admin.status.events')}
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{context.t.t('dues.admin.status.none')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <code className="text-xs">{event.type}</code>
                <span className="text-xs text-muted-foreground">
                  {fmt(event.receivedAt, context)} ·{' '}
                  {event.processedAt === null
                    ? context.t.t('dues.admin.status.unprocessed')
                    : (event.outcome ?? context.t.t('dues.admin.status.done'))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const STATUS_KEYS = {
  active: 'dues.admin.members.active',
  closing: 'dues.admin.members.closing',
  expired: 'dues.admin.members.expired',
  grace: 'dues.admin.members.grace',
  revoked: 'dues.admin.members.revokedStatus',
} as const

function statusChip(membership: MembershipRow, context: PluginAdminPageContext): ReactNode {
  const tone =
    membership.status === 'active'
      ? 'text-muted-foreground'
      : membership.status === 'grace' || membership.needsAttention !== null
        ? ''
        : 'text-muted-foreground'
  return <span className={tone}>{context.t.t(STATUS_KEYS[membership.status])}</span>
}

const MEMBER_NOTICE_KEYS = new Set([
  'dues.admin.members.cancelled',
  'dues.admin.members.cleared',
  'dues.admin.members.extended',
  'dues.admin.members.revoked',
])

const MEMBER_ERROR_KEYS = new Set([
  'dues.admin.members.badDays',
  'dues.admin.members.grantRefused',
  'dues.admin.members.noMembership',
  'dues.admin.members.noRenewal',
  'dues.admin.members.stripeError',
  'dues.admin.members.stripeUnconfigured',
])

function isLiveRow(membership: MembershipRow): boolean {
  return (
    membership.status === 'active' ||
    membership.status === 'grace' ||
    membership.status === 'closing'
  )
}

function MemberActions({
  membership,
  context,
}: {
  membership: MembershipRow
  context: PluginAdminPageContext
}) {
  if (!isLiveRow(membership) && membership.needsAttention === null) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  return (
    <div className="flex flex-col gap-2">
      {isLiveRow(membership) && !isLifetime(membership.currentPeriodEnd) && (
        <form
          method="post"
          action="/admin/api/plugins/dues/members/extend"
          className="flex items-center gap-2"
        >
          <input type="hidden" name="membership" value={membership.id} />
          <input
            type="number"
            name="days"
            defaultValue={30}
            min={1}
            max={366}
            aria-label={context.t.t('dues.admin.members.extendAria', { id: membership.id })}
            className={`${INPUT} w-20`}
          />
          <button type="submit" className={QUIET_BUTTON}>
            {context.t.t('dues.admin.members.extend')}
          </button>
        </form>
      )}
      {isLiveRow(membership) &&
        membership.renewalMode === 'auto' &&
        membership.status !== 'closing' &&
        membership.stripeSubscriptionId !== null && (
          <form method="post" action="/admin/api/plugins/dues/members/cancel">
            <input type="hidden" name="membership" value={membership.id} />
            <button type="submit" className={QUIET_BUTTON}>
              {context.t.t('dues.admin.members.cancel')}
            </button>
          </form>
        )}
      {isLiveRow(membership) && (
        <form method="post" action="/admin/api/plugins/dues/members/revoke">
          <input type="hidden" name="membership" value={membership.id} />
          <button type="submit" className={QUIET_BUTTON}>
            {context.t.t('dues.admin.members.revoke')}
          </button>
        </form>
      )}
      {membership.needsAttention !== null && (
        <form method="post" action="/admin/api/plugins/dues/attention/clear">
          <input type="hidden" name="membership" value={membership.id} />
          <button type="submit" className={QUIET_BUTTON}>
            {context.t.t('dues.admin.members.clear')}
          </button>
        </form>
      )}
    </div>
  )
}

export async function MembersPage({ context }: { context: PluginAdminPageContext }) {
  const memberships = await allMemberships(context.data, 200)

  const names = new Map<number, string>()
  for (const membership of memberships) {
    if (!names.has(membership.userId)) {
      const user = await context.users.byId(membership.userId)
      names.set(membership.userId, user?.username ?? `user ${membership.userId}`)
    }
  }

  const good = `dues.admin.members.${Object.keys(context.query).find((key) =>
    MEMBER_NOTICE_KEYS.has(`dues.admin.members.${key}`),
  )}`
  const bad = `dues.admin.members.${context.query.error ?? ''}`

  return (
    <div className="flex flex-col gap-4">
      {MEMBER_NOTICE_KEYS.has(good) && <GoodNotice>{context.t.t(good)}</GoodNotice>}
      {MEMBER_ERROR_KEYS.has(bad) && <BadNotice>{context.t.t(bad)}</BadNotice>}
      <p className="text-sm text-muted-foreground">
        {context.t.t('dues.admin.members.description')}
      </p>
      {memberships.length === 0 ? (
        <p className={QUIET_PANEL}>{context.t.t('dues.admin.members.none')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>{context.t.t('dues.admin.members.member')}</th>
                <th className={TH}>{context.t.t('dues.admin.members.plan')}</th>
                <th className={TH}>{context.t.t('dues.admin.members.status')}</th>
                <th className={TH}>{context.t.t('dues.admin.members.periodEnds')}</th>
                <th className={TH}>{context.t.t('dues.admin.members.graceUntil')}</th>
                <th className={TH}>{context.t.t('dues.admin.members.subscription')}</th>
                <th className={TH}>{context.t.t('dues.admin.members.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((membership) => (
                <tr key={membership.id} className="border-b border-border">
                  <td className={TD}>{names.get(membership.userId)}</td>
                  <td className={TD}>{membership.planKey}</td>
                  <td className={TD}>
                    {statusChip(membership, context)}
                    {membership.needsAttention !== null && (
                      <p className="mt-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs">
                        {membership.needsAttention}
                      </p>
                    )}
                  </td>
                  <td className={TD}>
                    {isLifetime(membership.currentPeriodEnd)
                      ? context.t.t('dues.admin.members.forGood')
                      : fmt(membership.currentPeriodEnd, context)}
                  </td>
                  <td className={TD}>
                    {isLifetime(membership.currentPeriodEnd)
                      ? '—'
                      : fmt(membership.graceUntil, context)}
                  </td>
                  <td className={TD}>
                    <code className="text-xs">{membership.stripeSubscriptionId ?? '—'}</code>
                  </td>
                  <td className={TD}>
                    <MemberActions membership={membership} context={context} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export async function LedgerPage({
  config,
  context,
}: {
  config: DuesConfig
  context: PluginAdminPageContext
}) {
  const months = await monthlyTotals(context.data, 12)
  const entries = await recentLedger(context.data, 50)

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.admin.ledger.byMonth')}
        </h2>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {context.t.t('dues.admin.ledger.noMoney')}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>{context.t.t('dues.admin.ledger.month')}</th>
                <th className={TH}>{context.t.t('dues.admin.ledger.charges')}</th>
                <th className={TH}>{context.t.t('dues.admin.ledger.gross')}</th>
                <th className={TH}>{context.t.t('dues.admin.ledger.refunded')}</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={`${month.month}-${month.currency}`} className="border-b border-border">
                  <td className={TD}>{month.month}</td>
                  <td className={TD}>{month.charges}</td>
                  <td className={TD}>
                    {formatMinor(month.grossMinor, month.currency, context.locale)}
                  </td>
                  <td className={TD}>
                    {month.refundedMinor === 0
                      ? '—'
                      : formatMinor(month.refundedMinor, month.currency, context.locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-foreground">
          {context.t.t('dues.admin.ledger.appendOnly', { currency: config.currency.toUpperCase() })}
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.admin.ledger.latest')}
        </h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{context.t.t('dues.admin.ledger.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {entry.kind}
                  {entry.note !== null && (
                    <span className="text-xs text-muted-foreground"> · {entry.note}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmt(entry.occurredAt, context)} ·{' '}
                  {formatMinor(entry.amountMinor, entry.currency, context.locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const CODE_ERROR_KEYS = {
  'bad-code': 'dues.admin.codes.badCode',
  'bad-expiry': 'dues.admin.codes.badExpiry',
  'bad-max': 'dues.admin.codes.badMax',
  'bad-percent': 'dues.admin.codes.badPercent',
  'bad-plan': 'dues.admin.codes.badPlan',
  'duplicate-code': 'dues.admin.codes.duplicate',
  'no-such-code': 'dues.admin.codes.noSuch',
} as const

function codeState(code: CodeRow, now: Date, context: PluginAdminPageContext): string {
  if (code.disabled) return context.t.t('dues.admin.codes.switchedOff')
  if (code.expiresAt !== null && code.expiresAt <= now)
    return context.t.t('dues.admin.codes.expired')
  if (code.maxRedemptions !== null && code.redeemedCount >= code.maxRedemptions) {
    return context.t.t('dues.admin.codes.usedUp')
  }
  return context.t.t('dues.admin.codes.live')
}

export async function CodesPage({
  config,
  context,
}: {
  config: DuesConfig
  context: PluginAdminPageContext
}) {
  const codes = await listCodes(context.data, 100)
  const plans = (await loadPlans(context.data, config)).filter((plan) => !plan.archived)
  const now = new Date()
  const created = context.query.created
  const toggled = context.query.disabled ?? context.query.enabled
  const error = CODE_ERROR_KEYS[context.query.error as keyof typeof CODE_ERROR_KEYS]
  const [createdLead, createdTail] = context.t
    .t('dues.admin.codes.created', { code: '{code}' })
    .split('{code}')

  return (
    <div className="flex flex-col gap-4">
      {created !== undefined && (
        <GoodNotice>
          {createdLead}
          <code className="mx-1 font-mono text-base font-semibold">{created}</code>
          {createdTail}
        </GoodNotice>
      )}
      {toggled !== undefined && (
        <GoodNotice>
          {context.query.disabled !== undefined
            ? context.t.t('dues.admin.codes.toggledOff', { code: toggled })
            : context.t.t('dues.admin.codes.toggledOn', { code: toggled })}
        </GoodNotice>
      )}
      {error !== undefined && (
        <BadNotice>
          {context.t.t(
            error,
            context.query.error === 'too-long' ? { days: MAX_PLAN_DAYS } : undefined,
          )}
        </BadNotice>
      )}

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.admin.codes.mint')}
        </h2>
        <p className="text-sm text-muted-foreground">{context.t.t('dues.admin.codes.intro')}</p>
        <form
          method="post"
          action="/admin/api/plugins/dues/codes/create"
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              {context.t.t('dues.admin.codes.codeHelp')}
            </span>
            <input name="code" autoComplete="off" placeholder="LAUNCH50" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              {context.t.t('dues.admin.codes.percentHelp')}
            </span>
            <input type="number" name="percent" min={1} max={100} required className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              {context.t.t('dues.admin.codes.planHelp')}
            </span>
            <select name="plan" className={INPUT}>
              <option value="">{context.t.t('dues.admin.codes.anyPlan')}</option>
              {plans.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              {context.t.t('dues.admin.codes.redemptionCap')}
            </span>
            <input type="number" name="max" min={1} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              {context.t.t('dues.admin.codes.expiresHelp')}
            </span>
            <input type="date" name="expires" className={INPUT} />
          </label>
          <div className="flex items-end">
            <button type="submit" className={ACT_BUTTON}>
              {context.t.t('dues.admin.codes.mintButton')}
            </button>
          </div>
        </form>
      </section>

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.admin.codes.every')}
        </h2>
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{context.t.t('dues.admin.codes.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>{context.t.t('dues.admin.codes.code')}</th>
                  <th className={TH}>{context.t.t('dues.admin.codes.off')}</th>
                  <th className={TH}>{context.t.t('dues.admin.codes.plan')}</th>
                  <th className={TH}>{context.t.t('dues.admin.codes.redeemed')}</th>
                  <th className={TH}>{context.t.t('dues.admin.codes.expires')}</th>
                  <th className={TH}>{context.t.t('dues.admin.codes.state')}</th>
                  <th className={TH}>{context.t.t('dues.admin.codes.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id} className="border-b border-border">
                    <td className={TD}>
                      <code className="font-mono">{code.code}</code>
                    </td>
                    <td className={TD}>{code.percentOff}%</td>
                    <td className={TD}>{code.planKey ?? context.t.t('dues.admin.codes.any')}</td>
                    <td className={TD}>
                      {code.redeemedCount}
                      {code.maxRedemptions !== null && ` / ${code.maxRedemptions}`}
                    </td>
                    <td className={TD}>
                      {code.expiresAt === null
                        ? context.t.t('dues.admin.codes.never')
                        : fmt(code.expiresAt, context)}
                    </td>
                    <td className={TD}>{codeState(code, now, context)}</td>
                    <td className={TD}>
                      <form method="post" action="/admin/api/plugins/dues/codes/disable">
                        <input type="hidden" name="code" value={code.id} />
                        <input type="hidden" name="disabled" value={code.disabled ? '0' : '1'} />
                        <button type="submit" className={QUIET_BUTTON}>
                          {context.t.t(
                            code.disabled
                              ? 'dues.admin.codes.switchOn'
                              : 'dues.admin.codes.switchOff',
                          )}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {context.t.t('dues.admin.codes.redemptions')}
        </p>
      </section>
    </div>
  )
}

const PLAN_ERROR_KEYS = {
  'auto-gift': 'dues.admin.plans.autoGift',
  'bad-currency': 'dues.admin.plans.badCurrency',
  'bad-group': 'dues.admin.plans.badGroup',
  'bad-interval': 'dues.admin.plans.badInterval',
  'bad-key': 'dues.admin.plans.badKey',
  'bad-length': 'dues.admin.plans.badLength',
  'bad-mode': 'dues.admin.plans.badMode',
  'bad-name': 'dues.admin.plans.badName',
  'bad-price': 'dues.admin.plans.badPrice',
  'bad-stripe-price': 'dues.admin.plans.badStripePrice',
  'duplicate-plan': 'dues.admin.plans.duplicate',
  'no-such-plan': 'dues.admin.plans.noSuch',
  'stripe-error': 'dues.admin.plans.stripeError',
  'too-long': 'dues.admin.plans.tooLong',
  unconfigured: 'dues.admin.plans.stripeUnconfigured',
} as const

const PLAN_NOTICE_KEYS = {
  archived: 'dues.admin.plans.archived',
  created: 'dues.admin.plans.created',
  restored: 'dues.admin.plans.restored',
  updated: 'dues.admin.plans.updated',
} as const

function planPeriodParts(plan: PlanRow): { length: number; unit: string } {
  const match = /^P(\d+)([YMWD])$/.exec(plan.periodSpec ?? '')
  if (match === null) return { length: 90, unit: 'days' }
  const unit =
    match[2] === 'Y' ? 'years' : match[2] === 'M' ? 'months' : match[2] === 'W' ? 'weeks' : 'days'
  return { length: Number(match[1]), unit }
}

function PlanFields({ plan, context }: { plan?: PlanRow; context: PluginAdminPageContext }) {
  const period = plan === undefined ? { length: 90, unit: 'days' } : planPeriodParts(plan)
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">
          {context.t.t('dues.admin.plans.name')}
        </span>
        <input name="name" defaultValue={plan?.name ?? ''} required className={INPUT} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">
          {context.t.t('dues.admin.plans.description')}
        </span>
        <input name="description" defaultValue={plan?.description ?? ''} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">
          {context.t.t('dues.admin.plans.giftGroup')}
        </span>
        <input name="group" defaultValue={plan?.groupKey ?? ''} required className={INPUT} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">
            {context.t.t('dues.admin.plans.price')}
          </span>
          <input
            type="number"
            name="price"
            min={1}
            defaultValue={plan?.priceMinor ?? ''}
            required
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">
            {context.t.t('dues.admin.plans.currency')}
          </span>
          <input
            name="currency"
            defaultValue={plan?.currency ?? ''}
            placeholder="gbp"
            maxLength={3}
            required
            className={INPUT}
          />
        </label>
      </div>
      {(plan === undefined || plan.mode === 'fixed') && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              {context.t.t('dues.admin.plans.length')}
            </span>
            <input
              type="number"
              name="length"
              min={1}
              defaultValue={period.length}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              {context.t.t('dues.admin.plans.unit')}
            </span>
            <select name="unit" defaultValue={period.unit} className={INPUT}>
              <option value="days">{context.t.t('dues.admin.plans.days')}</option>
              <option value="weeks">{context.t.t('dues.admin.plans.weeks')}</option>
              <option value="months">{context.t.t('dues.admin.plans.months')}</option>
              <option value="years">{context.t.t('dues.admin.plans.years')}</option>
            </select>
          </label>
        </div>
      )}
      {(plan === undefined || plan.mode === 'auto') && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">
            {context.t.t('dues.admin.plans.interval')}
          </span>
          <select name="interval" defaultValue={plan?.billingInterval ?? 'month'} className={INPUT}>
            <option value="month">{context.t.t('dues.admin.plans.month')}</option>
            <option value="year">{context.t.t('dues.admin.plans.year')}</option>
          </select>
        </label>
      )}
      {(plan === undefined || plan.mode === 'auto') && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">
            {context.t.t('dues.admin.plans.stripePrice')}
          </span>
          <input name="stripe_price" placeholder="price_…" autoComplete="off" className={INPUT} />
        </label>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="giftable"
            defaultChecked={plan === undefined ? true : plan.giftable}
          />
          {context.t.t('dues.admin.plans.canGift')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="hidden" defaultChecked={plan?.hidden ?? false} />
          {context.t.t('dues.admin.plans.hidden')}
        </label>
      </div>
    </>
  )
}

export async function PlansAdminPage({
  config,
  context,
}: {
  config: DuesConfig
  context: PluginAdminPageContext
}) {
  const plans = await loadPlans(context.data, config)
  const notice = Object.keys(PLAN_NOTICE_KEYS).find((key) => context.query[key] !== undefined)
  const error = PLAN_ERROR_KEYS[context.query.error as keyof typeof PLAN_ERROR_KEYS]

  return (
    <div className="flex flex-col gap-4">
      {notice !== undefined && (
        <GoodNotice>
          {context.t.t(PLAN_NOTICE_KEYS[notice as keyof typeof PLAN_NOTICE_KEYS], {
            key: context.query[notice],
          })}
        </GoodNotice>
      )}
      {error !== undefined && <BadNotice>{error}</BadNotice>}

      <p className="text-sm text-muted-foreground">{context.t.t('dues.admin.plans.editing')}</p>

      {plans.length > 0 && (
        <section className={CARD}>
          <h2 className="font-heading text-lg font-semibold">
            {context.t.t('dues.admin.plans.thePlans')}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {plans.map((plan) => (
              <li key={plan.id} className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    <code className="mr-2 text-xs text-muted-foreground">{plan.key}</code>
                    {plan.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatMinor(plan.priceMinor, plan.currency, context.locale)} ·{' '}
                    {describeBilling(plan)}
                    {plan.hidden && ` · ${context.t.t('dues.admin.plans.hidden')}`}
                    {plan.archived && ` · ${context.t.t('dues.admin.plans.offSale')}`}
                  </span>
                </div>
                {plan.mode === 'auto' && (
                  <p className="text-xs text-muted-foreground">
                    {context.t.t('dues.admin.plans.billing', {
                      price: plan.stripePriceId ?? context.t.t('dues.admin.plans.missingPrice'),
                    })}
                  </p>
                )}
                {!plan.archived && (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      {context.t.t('dues.admin.plans.edit')}
                    </summary>
                    <form
                      method="post"
                      action="/admin/api/plugins/dues/plans/update"
                      className="mt-3 flex flex-col gap-3"
                    >
                      <input type="hidden" name="id" value={plan.id} />
                      <PlanFields plan={plan} context={context} />
                      <div>
                        <button type="submit" className={ACT_BUTTON}>
                          {context.t.t('dues.admin.plans.save')}
                        </button>
                      </div>
                    </form>
                  </details>
                )}
                <form method="post" action="/admin/api/plugins/dues/plans/archive">
                  <input type="hidden" name="id" value={plan.id} />
                  <input type="hidden" name="archived" value={plan.archived ? '0' : '1'} />
                  <button type="submit" className={QUIET_BUTTON}>
                    {context.t.t(
                      plan.archived ? 'dues.admin.plans.putBack' : 'dues.admin.plans.takeOffSale',
                    )}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.admin.plans.add')}
        </h2>
        <p className="text-sm text-muted-foreground">{context.t.t('dues.admin.plans.addIntro')}</p>
        <form
          method="post"
          action="/admin/api/plugins/dues/plans/create"
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">
                {context.t.t('dues.admin.plans.key')}
              </span>
              <input name="key" placeholder="day-pass" required className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">
                {context.t.t('dues.admin.plans.bills')}
              </span>
              <select name="mode" className={INPUT}>
                <option value="fixed">{context.t.t('dues.admin.plans.fixed')}</option>
                <option value="auto">{context.t.t('dues.admin.plans.subscription')}</option>
                <option value="lifetime">{context.t.t('dues.admin.plans.lifetime')}</option>
              </select>
            </label>
          </div>
          <PlanFields context={context} />
          <div>
            <button type="submit" className={ACT_BUTTON}>
              {context.t.t('dues.admin.plans.onSale')}
            </button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground">{context.t.t('dues.admin.plans.footer')}</p>
      </section>
    </div>
  )
}
