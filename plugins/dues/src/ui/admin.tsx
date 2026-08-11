import type { ReactNode } from 'react'

import type { PluginAdminPageContext } from '@meith/plugin-kit'

import type { DuesConfig } from '../config'
import { formatMinor } from '../money'
import { describePeriod } from '../period'
import {
  allMemberships,
  attentionCount,
  listCodes,
  monthlyTotals,
  ordersNeedingAttention,
  recentEvents,
  recentLedger,
  type CodeRow,
  type MembershipRow,
} from '../store'
import { SUBSCRIBED_EVENT_TYPES } from '../stripe/events'

const CARD = 'flex flex-col gap-3 rounded-lg border border-border p-4'
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

function fmt(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ')
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

function Attention({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
      <strong>{count}</strong> record{count === 1 ? ' needs' : 's need'} attention —
      a payment that could not become a membership, or an amount that did not match its
      order. The members screen lists {count === 1 ? 'it' : 'them'} first.
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

  const keySet = String(context.settings.stripe_secret_key ?? '') !== ''
  const webhookSet = String(context.settings.stripe_webhook_secret ?? '') !== ''

  return (
    <div className="flex flex-col gap-4">
      {context.query.cleared !== undefined && <GoodNotice>Flag cleared.</GoodNotice>}
      {context.query.error !== undefined && (
        <BadNotice>That flag could not be found — it may already be cleared.</BadNotice>
      )}
      <Attention count={attention} />

      {flaggedOrders.length > 0 && (
        <section className={CARD}>
          <h2 className="font-heading text-lg font-semibold">Orders needing attention</h2>
          <p className="text-sm text-muted-foreground">
            Money moved but the order could not settle cleanly — most often an amount
            that did not match. Check the payment in Stripe&rsquo;s dashboard, put it
            right there, then clear the flag here.
          </p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {flaggedOrders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  Order {order.id} — {order.planName},{' '}
                  {formatMinor(order.amountMinor, order.currency)}
                  <span className="block text-xs text-muted-foreground">
                    {order.needsAttention}
                  </span>
                </span>
                <form method="post" action="/admin/api/plugins/dues/attention/clear">
                  <input type="hidden" name="order" value={order.id} />
                  <button type="submit" className={QUIET_BUTTON}>
                    Clear the flag
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">Is it working?</h2>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Stripe secret key</dt>
            <dd>{keySet ? 'set' : 'not set — nothing can be bought'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Webhook signing secret</dt>
            <dd>{webhookSet ? 'set' : 'not set — payments cannot confirm'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Currency</dt>
            <dd>{config.currency.toUpperCase()}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Grace after a failed renewal</dt>
            <dd>{config.graceDays} days</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Keys resolve environment-first: the settings form below this page shows which
          source is winning.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">The webhook to create</h2>
        <p className="text-sm text-muted-foreground">
          In the Stripe dashboard, add an endpoint at
          <code className="mx-1 text-xs">/api/plugins/dues/hook/stripe</code>
          on this board&rsquo;s public address, subscribed to exactly these events, and
          put its signing secret in the settings:
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
        <h2 className="font-heading text-lg font-semibold">Plans, as deployed</h2>
        <p className="text-sm text-muted-foreground">
          Plans are configuration in code — <code className="text-xs">community.plugins.ts</code>
          {' '}decides them, and a change is a deploy. Each grants membership of its group
          only while that group is marked &ldquo;may be granted by plugins&rdquo; under
          Admin → Groups; a purchase against a group that refuses shows up above as
          needing attention, with the payment kept and the reason recorded.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-96 border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>Plan</th>
                <th className={TH}>Price</th>
                <th className={TH}>Billing</th>
                <th className={TH}>Group</th>
                <th className={TH}>Giftable</th>
              </tr>
            </thead>
            <tbody>
              {config.plans.map((plan) => (
                <tr key={plan.key} className="border-b border-border">
                  <td className={TD}>
                    {plan.name}
                    {plan.hidden && (
                      <span className="text-xs text-muted-foreground"> · hidden</span>
                    )}
                  </td>
                  <td className={TD}>{formatMinor(plan.price, config.currency)}</td>
                  <td className={TD}>
                    {plan.billing.mode === 'auto'
                      ? `every ${plan.billing.interval}`
                      : describePeriod(plan.billing.parsed)}
                  </td>
                  <td className={TD}>
                    <code className="text-xs">{plan.group}</code>
                  </td>
                  <td className={TD}>{plan.giftable ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">Latest webhook events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. The first purchase, or Stripe&rsquo;s &ldquo;send test event&rdquo;
            button, will put a row here — which is how you prove the endpoint works.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <code className="text-xs">{event.type}</code>
                <span className="text-xs text-muted-foreground">
                  {fmt(event.receivedAt)} ·{' '}
                  {event.processedAt === null
                    ? 'unprocessed — the reconcile task retries it'
                    : (event.outcome ?? 'done')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function statusChip(membership: MembershipRow): ReactNode {
  const tone =
    membership.status === 'active'
      ? 'text-muted-foreground'
      : membership.status === 'grace' || membership.needsAttention !== null
        ? ''
        : 'text-muted-foreground'
  return <span className={tone}>{membership.status}</span>
}

const MEMBER_NOTICES: Record<string, string> = {
  extended: 'Membership extended. The member holds their group until the new date.',
  cancelled: 'Renewal cancelled. They keep what they paid for until the period ends.',
  revoked: 'Membership revoked. Their access is gone as of now.',
  cleared: 'Flag cleared.',
}

const MEMBER_ERRORS: Record<string, string> = {
  'bad-days': 'Extensions are 1 to 366 days.',
  'not-live': 'That membership is not live any more, so there is nothing to act on.',
  'not-cancellable': 'Only a live subscription has a renewal to cancel.',
  unconfigured: 'Stripe is not configured, so the subscription cannot be reached.',
  'stripe-error': 'Stripe could not be reached. Nothing changed — try again shortly.',
  'grant-refused':
    'The extension was recorded, but the board refused the group grant — the row is ' +
    'flagged with the reason.',
}

function isLiveRow(membership: MembershipRow): boolean {
  return (
    membership.status === 'active' ||
    membership.status === 'grace' ||
    membership.status === 'closing'
  )
}

function MemberActions({ membership }: { membership: MembershipRow }) {
  if (!isLiveRow(membership) && membership.needsAttention === null) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  return (
    <div className="flex flex-col gap-2">
      {isLiveRow(membership) && (
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
            aria-label={`Days to extend membership ${membership.id} by`}
            className={`${INPUT} w-20`}
          />
          <button type="submit" className={QUIET_BUTTON}>
            Extend
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
              Cancel renewal
            </button>
          </form>
        )}
      {isLiveRow(membership) && (
        <form method="post" action="/admin/api/plugins/dues/members/revoke">
          <input type="hidden" name="membership" value={membership.id} />
          <button type="submit" className={QUIET_BUTTON}>
            Revoke now
          </button>
        </form>
      )}
      {membership.needsAttention !== null && (
        <form method="post" action="/admin/api/plugins/dues/attention/clear">
          <input type="hidden" name="membership" value={membership.id} />
          <button type="submit" className={QUIET_BUTTON}>
            Clear the flag
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

  const good = Object.keys(MEMBER_NOTICES).find((key) => context.query[key] !== undefined)
  const bad = MEMBER_ERRORS[context.query.error ?? '']

  return (
    <div className="flex flex-col gap-4">
      {good !== undefined && <GoodNotice>{MEMBER_NOTICES[good]}</GoodNotice>}
      {bad !== undefined && <BadNotice>{bad}</BadNotice>}
      <p className="text-sm text-muted-foreground">
        Every membership this plugin has sold, flagged rows first. Extending is a grant,
        not a charge; revoking removes access on the spot without touching the money —
        refunds happen in Stripe&rsquo;s dashboard, and the refund webhook revokes on
        its own.
      </p>
      {memberships.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Nothing sold yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>Member</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Status</th>
                <th className={TH}>Period ends</th>
                <th className={TH}>Grace until</th>
                <th className={TH}>Subscription</th>
                <th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((membership) => (
                <tr key={membership.id} className="border-b border-border">
                  <td className={TD}>{names.get(membership.userId)}</td>
                  <td className={TD}>{membership.planKey}</td>
                  <td className={TD}>
                    {statusChip(membership)}
                    {membership.needsAttention !== null && (
                      <p className="mt-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs">
                        {membership.needsAttention}
                      </p>
                    )}
                  </td>
                  <td className={TD}>{fmt(membership.currentPeriodEnd)}</td>
                  <td className={TD}>{fmt(membership.graceUntil)}</td>
                  <td className={TD}>
                    <code className="text-xs">{membership.stripeSubscriptionId ?? '—'}</code>
                  </td>
                  <td className={TD}>
                    <MemberActions membership={membership} />
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
        <h2 className="font-heading text-lg font-semibold">By month</h2>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">No money has moved yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>Month</th>
                <th className={TH}>Charges</th>
                <th className={TH}>Gross</th>
                <th className={TH}>Refunded</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={`${month.month}-${month.currency}`} className="border-b border-border">
                  <td className={TD}>{month.month}</td>
                  <td className={TD}>{month.charges}</td>
                  <td className={TD}>{formatMinor(month.grossMinor, month.currency)}</td>
                  <td className={TD}>
                    {month.refundedMinor === 0
                      ? '—'
                      : formatMinor(month.refundedMinor, month.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-foreground">
          Append-only, written as money moves: charges positive, refunds and chargebacks
          negative. Stripe&rsquo;s dashboard is the authority; this is the board&rsquo;s
          own copy in {config.currency.toUpperCase()}.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">Latest entries</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Empty.</p>
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
                  {fmt(entry.occurredAt)} · {formatMinor(entry.amountMinor, entry.currency)}
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
  'bad-code': 'Codes are 3 to 32 letters, digits and hyphens. Leave the box empty to have one invented.',
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
  const now = new Date()
  const created = context.query.created
  const toggled = context.query.disabled ?? context.query.enabled
  const error = CODE_ERRORS[context.query.error ?? '']

  return (
    <div className="flex flex-col gap-4">
      {created !== undefined && (
        <GoodNotice>
          The code is live: <code className="mx-1 font-mono text-base font-semibold">{created}</code>
          — hand it out however you like. It is shown in full below whenever you need it
          again.
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
          A code takes a percentage off at checkout: the whole price of a pass, the first
          payment of a subscription — renewals bill in full. A 100% code on a pass skips
          Stripe entirely, which is how you comp somebody.
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
            <input
              type="number"
              name="percent"
              min={1}
              max={100}
              required
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Which plan it works on</span>
            <select name="plan" className={INPUT}>
              <option value="">Any plan</option>
              {config.plans.map((plan) => (
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
                      {code.expiresAt === null ? 'never' : fmt(code.expiresAt)}
                    </td>
                    <td className={TD}>{codeState(code, now)}</td>
                    <td className={TD}>
                      <form method="post" action="/admin/api/plugins/dues/codes/disable">
                        <input type="hidden" name="code" value={code.id} />
                        <input
                          type="hidden"
                          name="disabled"
                          value={code.disabled ? '0' : '1'}
                        />
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
          Redemptions count when a payment settles, not when a checkout starts. A code is
          never deleted — switching it off keeps the history of what it sold.
        </p>
      </section>
    </div>
  )
}
