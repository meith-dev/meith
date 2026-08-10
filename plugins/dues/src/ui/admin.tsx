import type { ReactNode } from 'react'

import type { PluginRuntimeContext } from '@meith/plugin-kit'

import type { DuesConfig } from '../config'
import { formatMinor } from '../money'
import { describePeriod } from '../period'
import {
  allMemberships,
  attentionCount,
  monthlyTotals,
  recentEvents,
  recentLedger,
  type MembershipRow,
} from '../store'
import { SUBSCRIBED_EVENT_TYPES } from '../stripe/events'

const CARD = 'flex flex-col gap-3 rounded-lg border border-border p-4'
const TH = 'px-2 py-1.5 text-left text-xs font-medium text-muted-foreground'
const TD = 'px-2 py-1.5 align-top'

function fmt(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ')
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
  context: PluginRuntimeContext
}) {
  const attention = await attentionCount(context.data)
  const events = await recentEvents(context.data, 10)

  const keySet = String(context.settings.stripe_secret_key ?? '') !== ''
  const webhookSet = String(context.settings.stripe_webhook_secret ?? '') !== ''

  return (
    <div className="flex flex-col gap-4">
      <Attention count={attention} />

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

export async function MembersPage({ context }: { context: PluginRuntimeContext }) {
  const memberships = await allMemberships(context.data, 200)

  const names = new Map<number, string>()
  for (const membership of memberships) {
    if (!names.has(membership.userId)) {
      const user = await context.users.byId(membership.userId)
      names.set(membership.userId, user?.username ?? `user ${membership.userId}`)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Every membership this plugin has sold, flagged rows first. Revoking early or
        comping someone happens on the board&rsquo;s own group screens — a timed grant
        there is exactly what a purchase makes here.
      </p>
      {memberships.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Nothing sold yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>Member</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Status</th>
                <th className={TH}>Period ends</th>
                <th className={TH}>Grace until</th>
                <th className={TH}>Subscription</th>
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
  context: PluginRuntimeContext
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
