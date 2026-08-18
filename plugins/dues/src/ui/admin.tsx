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

const CODE_ERRORS: Record<string, string> = {
  'bad-code':
    'Codes are 3 to 32 letters, digits and hyphens. Leave the box empty to have one invented.',
  'bad-percent': 'The discount is a whole number from 1 to 100 percent.',
  'bad-plan': 'That plan does not exist on this board.',
  'bad-max': 'The redemption cap is a whole number, at least 1 — or empty for no cap.',
  'bad-expiry': 'The expiry needs to be a date in the future, like 2027-01-31.',
  'duplicate-code': 'A code by that name already exists. Every code is unique, spelt any case.',
  'no-such-code': 'That code could not be found.',
}

function codeState(code: CodeRow, now: Date): string {
  if (code.disabled) return 'switched off'
  if (code.expiresAt !== null && code.expiresAt <= now) return 'expired'
  if (code.maxRedemptions !== null && code.redeemedCount >= code.maxRedemptions) {
    return 'used up'
  }
  return 'live'
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
  const error = CODE_ERRORS[context.query.error ?? '']

  return (
    <div className="flex flex-col gap-4">
      {created !== undefined && (
        <GoodNotice>
          The code is live:{' '}
          <code className="mx-1 font-mono text-base font-semibold">{created}</code>— hand it out
          however you like. It is shown in full below whenever you need it again.
        </GoodNotice>
      )}
      {toggled !== undefined && (
        <GoodNotice>
          <code className="font-mono">{toggled}</code>{' '}
          {context.query.disabled !== undefined
            ? 'is switched off. Anyone typing it now is told the code is not usable.'
            : 'is back on.'}
        </GoodNotice>
      )}
      {error !== undefined && <BadNotice>{error}</BadNotice>}

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">Mint a code</h2>
        <p className="text-sm text-muted-foreground">
          A code takes a percentage off at checkout: the whole price of a pass, the first payment of
          a subscription — renewals bill in full. A 100% code on a pass skips Stripe entirely, which
          is how you comp somebody.
        </p>
        <form
          method="post"
          action="/admin/api/plugins/dues/codes/create"
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              Code — leave empty to have one invented
            </span>
            <input name="code" autoComplete="off" placeholder="LAUNCH50" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Percent off, 1–100</span>
            <input type="number" name="percent" min={1} max={100} required className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Which plan it works on</span>
            <select name="plan" className={INPUT}>
              <option value="">Any plan</option>
              {plans.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              Redemption cap — empty for unlimited
            </span>
            <input type="number" name="max" min={1} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">
              Expires at end of day (UTC) — empty for never
            </span>
            <input type="date" name="expires" className={INPUT} />
          </label>
          <div className="flex items-end">
            <button type="submit" className={ACT_BUTTON}>
              Mint the code
            </button>
          </div>
        </form>
      </section>

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">Every code</h2>
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Code</th>
                  <th className={TH}>Off</th>
                  <th className={TH}>Plan</th>
                  <th className={TH}>Redeemed</th>
                  <th className={TH}>Expires</th>
                  <th className={TH}>State</th>
                  <th className={TH}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id} className="border-b border-border">
                    <td className={TD}>
                      <code className="font-mono">{code.code}</code>
                    </td>
                    <td className={TD}>{code.percentOff}%</td>
                    <td className={TD}>{code.planKey ?? 'any'}</td>
                    <td className={TD}>
                      {code.redeemedCount}
                      {code.maxRedemptions !== null && ` of ${code.maxRedemptions}`}
                    </td>
                    <td className={TD}>
                      {code.expiresAt === null ? 'never' : fmt(code.expiresAt, context)}
                    </td>
                    <td className={TD}>{codeState(code, now)}</td>
                    <td className={TD}>
                      <form method="post" action="/admin/api/plugins/dues/codes/disable">
                        <input type="hidden" name="code" value={code.id} />
                        <input type="hidden" name="disabled" value={code.disabled ? '0' : '1'} />
                        <button type="submit" className={QUIET_BUTTON}>
                          {code.disabled ? 'Switch on' : 'Switch off'}
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
          Redemptions count when a payment settles, not when a checkout starts. A code is never
          deleted — switching it off keeps the history of what it sold.
        </p>
      </section>
    </div>
  )
}

const PLAN_ERRORS: Record<string, string> = {
  'bad-key': 'Plan keys are lower-case letters, digits and hyphens, like day-pass.',
  'bad-name': 'The plan needs a name members will read.',
  'bad-group': 'That is not a valid group key.',
  'bad-price': 'The price is a positive whole number of minor units — 500 is £5.00.',
  'bad-currency': 'The currency is a three-letter ISO code, like gbp, usd or eur.',
  'bad-mode': 'Pick how the plan bills.',
  'bad-length': 'The length is a whole number of days, weeks, months or years — at least 1.',
  'too-long': `A pass plus its grace window cannot reach past two years (${MAX_PLAN_DAYS} days) — that is the board's cap on a plugin grant. Sell lifetime instead.`,
  'bad-interval': 'A subscription bills every month or every year.',
  'auto-gift': 'A subscription cannot be giftable — it would bill the buyer forever.',
  'duplicate-plan': 'A plan with that key already exists. Keys are forever; pick another.',
  'no-such-plan': 'That plan could not be found.',
  'bad-stripe-price': 'A pasted Stripe price id starts with price_.',
  unconfigured:
    'Stripe is not configured, so a subscription price cannot be minted. Set the secret ' +
    'key first, or paste a price id made in the Stripe dashboard.',
  'stripe-error': 'Stripe could not be reached. Nothing was saved — try again shortly.',
}

const PLAN_NOTICES: Record<string, (key: string) => string> = {
  created: (key) => `The plan ${key} is on sale from this moment.`,
  updated: (key) =>
    `${key} is updated. Existing memberships and running subscriptions keep what they ` +
    'bought; the change is for the next buyer.',
  archived: (key) =>
    `${key} is off sale. Everyone who holds it keeps it — archiving stops new purchases, ` +
    'nothing else.',
  restored: (key) => `${key} is back on sale.`,
}

function planPeriodParts(plan: PlanRow): { length: number; unit: string } {
  const match = /^P(\d+)([YMWD])$/.exec(plan.periodSpec ?? '')
  if (match === null) return { length: 90, unit: 'days' }
  const unit =
    match[2] === 'Y' ? 'years' : match[2] === 'M' ? 'months' : match[2] === 'W' ? 'weeks' : 'days'
  return { length: Number(match[1]), unit }
}

function PlanFields({ plan }: { plan?: PlanRow }) {
  const period = plan === undefined ? { length: 90, unit: 'days' } : planPeriodParts(plan)
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Name</span>
        <input name="name" defaultValue={plan?.name ?? ''} required className={INPUT} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Description — optional</span>
        <input name="description" defaultValue={plan?.description ?? ''} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">
          Group it grants (marked plugin-grantable under Admin → Groups)
        </span>
        <input name="group" defaultValue={plan?.groupKey ?? ''} required className={INPUT} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Price in minor units — 500 is £5.00</span>
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
          <span className="text-xs text-muted-foreground">Currency</span>
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
            <span className="text-xs text-muted-foreground">Pass length</span>
            <input
              type="number"
              name="length"
              min={1}
              defaultValue={period.length}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">…counted in</span>
            <select name="unit" defaultValue={period.unit} className={INPUT}>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
          </label>
        </div>
      )}
      {(plan === undefined || plan.mode === 'auto') && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Subscription bills every</span>
          <select name="interval" defaultValue={plan?.billingInterval ?? 'month'} className={INPUT}>
            <option value="month">month</option>
            <option value="year">year</option>
          </select>
        </label>
      )}
      {(plan === undefined || plan.mode === 'auto') && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">
            Stripe price id — leave empty and one is minted to match
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
          Can be bought for another member
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="hidden" defaultChecked={plan?.hidden ?? false} />
          Hidden from the shop
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
  const notice = Object.keys(PLAN_NOTICES).find((key) => context.query[key] !== undefined)
  const error = PLAN_ERRORS[context.query.error ?? '']

  return (
    <div className="flex flex-col gap-4">
      {notice !== undefined && (
        <GoodNotice>{PLAN_NOTICES[notice]!(context.query[notice]!)}</GoodNotice>
      )}
      {error !== undefined && <BadNotice>{error}</BadNotice>}

      <p className="text-sm text-muted-foreground">
        Every purchase snapshots its plan — the name, the price, the currency, the length — so
        editing here never rewrites what anyone already bought. A subscription price change mints a
        new Stripe price: running subscriptions keep billing what they signed up for, and only the
        next buyer sees the new number.
      </p>

      {plans.length > 0 && (
        <section className={CARD}>
          <h2 className="font-heading text-lg font-semibold">The plans</h2>
          <ul className="flex flex-col divide-y divide-border">
            {plans.map((plan) => (
              <li key={plan.id} className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    <code className="mr-2 text-xs text-muted-foreground">{plan.key}</code>
                    {plan.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatMinor(plan.priceMinor, plan.currency)} · {describeBilling(plan)}
                    {plan.hidden && ' · hidden'}
                    {plan.archived && ' · off sale'}
                  </span>
                </div>
                {plan.mode === 'auto' && (
                  <p className="text-xs text-muted-foreground">
                    Billing against{' '}
                    <code>{plan.stripePriceId ?? 'no price yet — not buyable'}</code>
                  </p>
                )}
                {!plan.archived && (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      Edit this plan
                    </summary>
                    <form
                      method="post"
                      action="/admin/api/plugins/dues/plans/update"
                      className="mt-3 flex flex-col gap-3"
                    >
                      <input type="hidden" name="id" value={plan.id} />
                      <PlanFields plan={plan} />
                      <div>
                        <button type="submit" className={ACT_BUTTON}>
                          Save the plan
                        </button>
                      </div>
                    </form>
                  </details>
                )}
                <form method="post" action="/admin/api/plugins/dues/plans/archive">
                  <input type="hidden" name="id" value={plan.id} />
                  <input type="hidden" name="archived" value={plan.archived ? '0' : '1'} />
                  <button type="submit" className={QUIET_BUTTON}>
                    {plan.archived ? 'Put it back on sale' : 'Take it off sale'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">Add a plan</h2>
        <p className="text-sm text-muted-foreground">
          A <strong>pass</strong> is one payment for a fixed stretch — a day to two years. A{' '}
          <strong>subscription</strong> renews by itself until cancelled. <strong>Lifetime</strong>{' '}
          is one payment, forever. The key is the plan&rsquo;s permanent name in records and cannot
          be changed later; everything else can.
        </p>
        <form
          method="post"
          action="/admin/api/plugins/dues/plans/create"
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Key — permanent</span>
              <input name="key" placeholder="day-pass" required className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">How it bills</span>
              <select name="mode" className={INPUT}>
                <option value="fixed">a pass — one payment, fixed length</option>
                <option value="auto">a subscription — renews itself</option>
                <option value="lifetime">lifetime — one payment, forever</option>
              </select>
            </label>
          </div>
          <PlanFields />
          <div>
            <button type="submit" className={ACT_BUTTON}>
              Put it on sale
            </button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground">
          Pass length and billing interval apply to the mode that uses them; the others ignore them.
          A subscription needs Stripe configured, or a pasted price id.
        </p>
      </section>
    </div>
  )
}
