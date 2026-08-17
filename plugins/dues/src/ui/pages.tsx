import type { ReactNode } from 'react'

import type { PluginPageContext } from '@meith/plugin-kit'

import type { DuesConfig } from '../config'
import { formatMinor } from '../money'
import { describeBilling, shopPlans } from '../plans'
import {
  type MembershipRow,
  membershipsFor,
  type OrderRow,
  orderById,
  ordersBoughtBy,
  type PlanRow,
} from '../store'

const QUIET_PANEL = 'rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground'

const CARD =
  'flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground ' +
  'shadow-elevation'
const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const BUY_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md border border-transparent ' +
  'bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover'
const QUIET_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm'

function fmtDate(date: Date, locale: string): ReactNode {
  const label = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  return <time dateTime={date.toISOString()}>{label}</time>
}

function priceLine(plan: PlanRow): string {
  const price = formatMinor(plan.priceMinor, plan.currency)
  if (plan.mode === 'auto') return `${price} every ${plan.billingInterval ?? 'month'}`
  if (plan.mode === 'lifetime') return `${price} · once, for good`
  return `${price} · ${describeBilling(plan)}`
}

const NOTICES: Record<string, string> = {
  'unknown-plan': 'That plan is not on offer. The ones below are.',
  unconfigured:
    'Payments are not set up on this board yet. An administrator needs to finish the ' +
    'Stripe configuration before anything can be bought.',
  'unknown-recipient':
    'No member goes by that name. Check the spelling — the gift needs somewhere to go.',
  'gift-not-allowed': 'That plan cannot be bought for someone else. Fixed-term passes can.',
  'already-member':
    'There is already an active subscription for that membership, so a second one ' +
    'would just charge twice for the same thing.',
  'try-again': 'That did not go through cleanly. Nothing was charged — try once more.',
  'stripe-error': 'Stripe could not be reached, so nothing was charged. Try again shortly.',
  'sign-in': 'Sign in first, so the membership has an account to attach to.',
  'unknown-code': 'That discount code does not exist. Check the spelling.',
  'code-disabled': 'That discount code has been switched off.',
  'code-expired': 'That discount code has expired.',
  'code-exhausted': 'That discount code has been used as many times as it allows.',
  'code-wrong-plan': 'That discount code is for a different plan.',
  'already-forever':
    'You hold this membership for good already — there is nothing left to buy for it.',
  'plan-not-ready':
    'That plan is not finished being set up — its Stripe price is missing. An ' +
    'administrator needs to complete it.',
  'cancel-first':
    'There is an active subscription for that membership. Cancel its renewal first, ' +
    'then buy the lifetime plan — you keep everything already paid for.',
}

function Notice({ query }: { query: Readonly<Record<string, string>> }) {
  if (query.cancelled === '1') {
    return (
      <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
        Checkout was cancelled. Nothing was charged.
      </p>
    )
  }
  const message = NOTICES[query.error ?? '']
  if (message === undefined) return null
  return (
    <p
      role="status"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
    >
      {message}
    </p>
  )
}

function membershipLine(membership: MembershipRow): string {
  switch (membership.status) {
    case 'active':
      return membership.renewalMode === 'auto' ? 'renews on' : 'yours until'
    case 'grace':
      return 'payment failed — access until'
    case 'closing':
      return 'will not renew — yours until'
    case 'expired':
      return 'ended on'
    case 'revoked':
      return 'refunded and ended on'
  }
}

function membershipDate(membership: MembershipRow): Date {
  return membership.status === 'grace' ? membership.graceUntil : membership.currentPeriodEnd
}

function membershipWhen(membership: MembershipRow, locale: string): ReactNode {
  if (membership.renewalMode === 'lifetime' && membership.status === 'active') {
    return 'yours for good'
  }
  return (
    <>
      {membershipLine(membership)} {fmtDate(membershipDate(membership), locale)}
    </>
  )
}

function HeldCard({
  memberships,
  locale,
}: {
  memberships: readonly MembershipRow[]
  locale: string
}) {
  const live = memberships.filter(
    (row) => row.status === 'active' || row.status === 'grace' || row.status === 'closing',
  )
  if (live.length === 0) return null

  return (
    <section className={CARD} aria-labelledby="dues-held">
      <h2 id="dues-held" className="font-heading text-lg font-semibold">
        What you hold
      </h2>
      <ul className="flex flex-col gap-2 text-sm">
        {live.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{row.planKey}</span>
            <span className={row.status === 'grace' ? '' : 'text-muted-foreground'}>
              {membershipWhen(row, locale)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <a
          href="/plugins/dues/manage"
          className="font-medium underline decoration-border underline-offset-2 hover:decoration-current"
        >
          Manage your membership
        </a>
      </p>
    </section>
  )
}

function PlanCard({
  plan,
  viewerSignedIn,
  defaultRecipient,
  defaultCode,
}: {
  plan: PlanRow
  viewerSignedIn: boolean
  defaultRecipient: string
  defaultCode: string
}) {
  return (
    <section className={CARD} aria-label={plan.name}>
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-lg font-semibold">{plan.name}</h3>
        <p className="text-sm font-medium">{priceLine(plan)}</p>
        {plan.description !== null && (
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        )}
        {plan.mode === 'auto' && (
          <p className="text-xs text-muted-foreground">
            Renews automatically. Cancel any time and keep what you paid for until the period ends.
          </p>
        )}
        {plan.mode === 'lifetime' && (
          <p className="text-xs text-muted-foreground">One payment, no renewal, no end date.</p>
        )}
      </div>

      {viewerSignedIn ? (
        <form method="post" action="/api/plugins/dues/checkout" className="flex flex-col gap-3">
          <input type="hidden" name="plan" value={plan.key} />
          {plan.giftable && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">
                Buying for another member? Their username — leave empty for yourself.
              </span>
              <input
                name="recipient"
                defaultValue={defaultRecipient}
                autoComplete="off"
                className={INPUT}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Discount code, if you have one.</span>
            <input name="code" defaultValue={defaultCode} autoComplete="off" className={INPUT} />
          </label>
          <div>
            <button type="submit" className={BUY_BUTTON}>
              {plan.mode === 'auto'
                ? 'Subscribe'
                : plan.mode === 'lifetime'
                  ? 'Buy lifetime membership'
                  : 'Buy this pass'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm">
          <a href="/login?next=%2Fplugins%2Fdues" className={QUIET_BUTTON}>
            Sign in to join
          </a>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Payment is taken by Stripe on their own checkout page — no card number ever touches this
        board.
      </p>
    </section>
  )
}

export async function PlansPage({
  config,
  context,
}: {
  config: DuesConfig
  context: PluginPageContext
}) {
  const viewerId = context.viewer.userId
  const signedIn = viewerId !== null
  const memberships = viewerId === null ? [] : await membershipsFor(context.data, viewerId)
  const plans = await shopPlans(context.data, config)
  const bounced = context.query.plan ?? ''

  return (
    <div className="flex flex-col gap-6">
      <Notice query={context.query} />
      <HeldCard memberships={memberships} locale={context.locale} />
      {plans.length === 0 && <p className={QUIET_PANEL}>Nothing is on sale just now.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            viewerSignedIn={signedIn}
            defaultRecipient={bounced === plan.key ? (context.query.recipient ?? '') : ''}
            defaultCode={bounced === plan.key ? (context.query.code ?? '') : ''}
          />
        ))}
      </div>
    </div>
  )
}

export function GoPage({
  config,
  context,
  allowedHosts,
}: {
  config: DuesConfig
  context: PluginPageContext
  allowedHosts: readonly string[]
}) {
  void config
  const to = context.query.to ?? ''

  const allowed = (() => {
    try {
      const url = new URL(to)
      const hostname = url.hostname.toLowerCase()
      const loopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
      return (
        (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) &&
        allowedHosts.includes(hostname)
      )
    } catch {
      return false
    }
  })()

  if (!allowed) {
    return (
      <p className={QUIET_PANEL}>
        That is not somewhere this board sends people.{' '}
        <a href="/plugins/dues" className="font-medium underline underline-offset-2">
          Back to safety.
        </a>
      </p>
    )
  }

  return (
    <section className={CARD}>
      <meta httpEquiv="refresh" content={`0;url=${to}`} />
      <h2 className="font-heading text-lg font-semibold">Over to Stripe…</h2>
      <p className="text-sm text-muted-foreground">
        Payment happens on Stripe&rsquo;s own page — no card number ever touches this board. You
        should be there already;{' '}
        <a href={to} className="font-medium underline underline-offset-2">
          continue by hand
        </a>{' '}
        if not.
      </p>
    </section>
  )
}

export async function ReturnPage({
  config,
  context,
}: {
  config: DuesConfig
  context: PluginPageContext
}) {
  const viewerId = context.viewer.userId
  const orderId = Number(context.query.order ?? '')
  const order =
    Number.isSafeInteger(orderId) && orderId > 0 ? await orderById(context.data, orderId) : null

  if (
    order === null ||
    viewerId === null ||
    (order.buyerUserId !== viewerId && order.recipientUserId !== viewerId)
  ) {
    return (
      <p className={QUIET_PANEL}>
        There is no order of yours here.{' '}
        <a href="/plugins/dues" className="font-medium underline underline-offset-2">
          Back to {config.label.toLowerCase()}
        </a>
      </p>
    )
  }

  const gift = order.buyerUserId !== order.recipientUserId

  if (order.status === 'paid') {
    return (
      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">Paid, and done</h2>
        <p className="text-sm">
          {gift
            ? `Your gift of ${order.planName} has been delivered. They hold it from this moment.`
            : `${order.planName} is yours from this moment.`}{' '}
          {formatMinor(order.amountMinor, order.currency)} — Stripe sends the receipt.
        </p>
        <p className="text-sm">
          <a href="/plugins/dues/manage" className="font-medium underline underline-offset-2">
            See your membership
          </a>
        </p>
      </section>
    )
  }

  if (order.status === 'failed' || order.status === 'cancelled') {
    return (
      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">Nothing was charged</h2>
        <p className="text-sm text-muted-foreground">
          This checkout {order.status === 'failed' ? 'did not go through' : 'was cancelled'}.
        </p>
        <p className="text-sm">
          <a href="/plugins/dues" className="font-medium underline underline-offset-2">
            Back to the plans
          </a>
        </p>
      </section>
    )
  }

  return (
    <section className={CARD}>
      <h2 className="font-heading text-lg font-semibold">Confirming your payment…</h2>
      <p className="text-sm text-muted-foreground">
        Stripe is telling the board about your payment right now. This page does not grant anything
        by itself — the confirmation does, and it usually lands within seconds.
      </p>
      <p className="text-sm">
        <a href={`/plugins/dues/return?order=${order.id}`} className={QUIET_BUTTON}>
          Check again
        </a>
      </p>
    </section>
  )
}

function GiftList({ orders }: { orders: readonly OrderRow[] }) {
  const gifts = orders.filter((order) => order.buyerUserId !== order.recipientUserId)
  if (gifts.length === 0) return null

  return (
    <section className={CARD} aria-labelledby="dues-gifts">
      <h2 id="dues-gifts" className="font-heading text-lg font-semibold">
        Gifts you bought
      </h2>
      <ul className="flex flex-col divide-y divide-border text-sm">
        {gifts.map((order) => (
          <li key={order.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span>
              {order.planName} — {formatMinor(order.amountMinor, order.currency)}
            </span>
            <span className="text-muted-foreground">
              {order.status === 'paid'
                ? 'delivered'
                : order.status === 'pending' || order.status === 'created'
                  ? 'awaiting payment'
                  : order.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const MANAGE_NOTICES: Record<string, string> = {
  'cancel-failed': 'That could not be cancelled. If it keeps failing, contact a moderator.',
  'no-customer':
    'Stripe has no record for your account yet — the portal exists once you have bought ' +
    'something.',
  'stripe-error': 'Stripe could not be reached. Try again shortly.',
  unconfigured: 'Payments are not fully set up on this board.',
  'sign-in': 'Sign in first.',
}

export async function ManagePage({
  config,
  context,
}: {
  config: DuesConfig
  context: PluginPageContext
}) {
  const viewerId = context.viewer.userId
  if (viewerId === null) return null

  const memberships = await membershipsFor(context.data, viewerId)
  const orders = await ordersBoughtBy(context.data, viewerId)

  return (
    <div className="flex flex-col gap-6">
      {context.query.cancelled === '1' && (
        <p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          Renewal cancelled. You keep everything you paid for until the period ends — nothing
          changes before then.
        </p>
      )}
      {MANAGE_NOTICES[context.query.error ?? ''] !== undefined && (
        <p
          role="status"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {MANAGE_NOTICES[context.query.error ?? '']}
        </p>
      )}

      {memberships.length === 0 ? (
        <p className={QUIET_PANEL}>
          You hold no {config.label.toLowerCase()} yet.{' '}
          <a href="/plugins/dues" className="font-medium underline underline-offset-2">
            The plans are here.
          </a>
        </p>
      ) : (
        <section className={CARD} aria-labelledby="dues-manage">
          <h2 id="dues-manage" className="font-heading text-lg font-semibold">
            Your {config.label.toLowerCase()}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {memberships.map((membership) => (
              <li key={membership.id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{membership.planKey}</span>
                  <span className={membership.status === 'grace' ? '' : 'text-muted-foreground'}>
                    {membershipWhen(membership, context.locale)}
                  </span>
                </div>
                {membership.status === 'grace' && (
                  <p className="text-sm">
                    A renewal payment failed. Stripe retries on its own; updating your card below
                    usually settles it.
                  </p>
                )}
                {membership.status === 'active' && membership.renewalMode === 'auto' && (
                  <form method="post" action="/api/plugins/dues/cancel">
                    <input type="hidden" name="membership" value={membership.id} />
                    <button type="submit" className={QUIET_BUTTON}>
                      Cancel renewal — keep access until{' '}
                      {new Intl.DateTimeFormat(context.locale, {
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC',
                      }).format(membershipDate(membership))}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">Card and receipts</h2>
        <p className="text-sm text-muted-foreground">
          Cards, invoices and receipts live on Stripe, where the payment did. The portal is theirs;
          it comes back here when you are done.
        </p>
        <form method="post" action="/api/plugins/dues/portal">
          <button type="submit" className={QUIET_BUTTON}>
            Open the billing portal
          </button>
        </form>
      </section>

      <GiftList orders={orders} />
    </div>
  )
}
