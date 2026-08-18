import type { ReactNode } from 'react'

import type { PluginPageContext } from '@meith/plugin-kit'
import type { Translator } from '@meith/theme-kit'

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

function fmtDate(date: Date, t: Translator): ReactNode {
  const label = t.parts(date, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return <time dateTime={date.toISOString()}>{label}</time>
}

function priceLine(plan: PlanRow, t: Translator): string {
  const price = formatMinor(plan.priceMinor, plan.currency, t.locale)
  if (plan.mode === 'auto') return `${price} ${describeBilling(plan)}`
  if (plan.mode === 'lifetime') return `${price} · ${describeBilling(plan)}`
  return `${price} · ${describeBilling(plan)}`
}

const NOTICE_KEYS = new Set([
  'dues.notice.already-forever',
  'dues.notice.already-member',
  'dues.notice.cancel-first',
  'dues.notice.code-disabled',
  'dues.notice.code-exhausted',
  'dues.notice.code-expired',
  'dues.notice.code-wrong-plan',
  'dues.notice.gift-not-allowed',
  'dues.notice.plan-not-ready',
  'dues.notice.sign-in',
  'dues.notice.stripe-error',
  'dues.notice.try-again',
  'dues.notice.unconfigured',
  'dues.notice.unknown-code',
  'dues.notice.unknown-plan',
  'dues.notice.unknown-recipient',
])

function Notice({ query, t }: { query: Readonly<Record<string, string>>; t: Translator }) {
  if (query.cancelled === '1') {
    return (
      <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
        {t.t('dues.notice.cancelled')}
      </p>
    )
  }
  const key = `dues.notice.${query.error ?? ''}`
  if (!NOTICE_KEYS.has(key)) return null
  return (
    <p
      role="status"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
    >
      {t.t(key)}
    </p>
  )
}

function membershipLine(membership: MembershipRow, t: Translator): string {
  switch (membership.status) {
    case 'active':
      return t.t(membership.renewalMode === 'auto' ? 'dues.membership.activeAuto' : 'dues.membership.activeFixed')
    case 'grace':
      return t.t('dues.membership.grace')
    case 'closing':
      return t.t('dues.membership.closing')
    case 'expired':
      return t.t('dues.membership.expired')
    case 'revoked':
      return t.t('dues.membership.revoked')
  }
}

function membershipDate(membership: MembershipRow): Date {
  return membership.status === 'grace' ? membership.graceUntil : membership.currentPeriodEnd
}

function membershipWhen(membership: MembershipRow, t: Translator): ReactNode {
  if (membership.renewalMode === 'lifetime' && membership.status === 'active') {
    return t.t('dues.membership.lifetime')
  }
  return (
    <>
      {membershipLine(membership, t)} {fmtDate(membershipDate(membership), t)}
    </>
  )
}

function HeldCard({
  memberships,
  t,
}: {
  memberships: readonly MembershipRow[]
  t: Translator
}) {
  const live = memberships.filter(
    (row) => row.status === 'active' || row.status === 'grace' || row.status === 'closing',
  )
  if (live.length === 0) return null

  return (
    <section className={CARD} aria-labelledby="dues-held">
      <h2 id="dues-held" className="font-heading text-lg font-semibold">
        {t.t('dues.held.heading')}
      </h2>
      <ul className="flex flex-col gap-2 text-sm">
        {live.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{row.planKey}</span>
            <span className={row.status === 'grace' ? '' : 'text-muted-foreground'}>
              {membershipWhen(row, t)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <a
          href="/plugins/dues/manage"
          className="font-medium underline decoration-border underline-offset-2 hover:decoration-current"
        >
          {t.t('dues.held.manage')}
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
  t,
}: {
  plan: PlanRow
  viewerSignedIn: boolean
  defaultRecipient: string
  defaultCode: string
  t: Translator
}) {
  return (
    <section className={CARD} aria-label={plan.name}>
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-lg font-semibold">{plan.name}</h3>
        <p className="text-sm font-medium">{priceLine(plan, t)}</p>
        {plan.description !== null && (
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        )}
        {plan.mode === 'auto' && (
          <p className="text-xs text-muted-foreground">
            {t.t('dues.plan.auto')}
          </p>
        )}
        {plan.mode === 'lifetime' && (
          <p className="text-xs text-muted-foreground">{t.t('dues.plan.lifetime')}</p>
        )}
      </div>

      {viewerSignedIn ? (
        <form method="post" action="/api/plugins/dues/checkout" className="flex flex-col gap-3">
          <input type="hidden" name="plan" value={plan.key} />
          {plan.giftable && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">
                {t.t('dues.plan.gift')}
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
            <span className="text-xs text-muted-foreground">{t.t('dues.plan.discountCode')}</span>
            <input name="code" defaultValue={defaultCode} autoComplete="off" className={INPUT} />
          </label>
          <div>
            <button type="submit" className={BUY_BUTTON}>
              {plan.mode === 'auto'
                ? t.t('dues.plan.buySubscription')
                : plan.mode === 'lifetime'
                  ? t.t('dues.plan.buyLifetime')
                  : t.t('dues.plan.buyFixed')}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm">
          <a href="/login?next=%2Fplugins%2Fdues" className={QUIET_BUTTON}>
            {t.t('dues.plan.signIn')}
          </a>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t.t('dues.plan.payment')}
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
      <Notice query={context.query} t={context.t} />
      <HeldCard memberships={memberships} t={context.t} />
      {plans.length === 0 && <p className={QUIET_PANEL}>{context.t.t('dues.plan.empty')}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            viewerSignedIn={signedIn}
            defaultRecipient={bounced === plan.key ? (context.query.recipient ?? '') : ''}
            defaultCode={bounced === plan.key ? (context.query.code ?? '') : ''}
            t={context.t}
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
        {context.t.t('dues.go.notAllowed')}{' '}
        <a href="/plugins/dues" className="font-medium underline underline-offset-2">
          {context.t.t('dues.go.back')}
        </a>
      </p>
    )
  }

  return (
    <section className={CARD}>
      <meta httpEquiv="refresh" content={`0;url=${to}`} />
      <h2 className="font-heading text-lg font-semibold">{context.t.t('dues.go.heading')}</h2>
      <p className="text-sm text-muted-foreground">
        {context.t.t('dues.go.paymentLead')}{' '}
        <a href={to} className="font-medium underline underline-offset-2">
          {context.t.t('dues.go.continue')}
        </a>{' '}
        {context.t.t('dues.go.paymentTail')}
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
        {context.t.t('dues.return.noOrder')}{' '}
        <a href="/plugins/dues" className="font-medium underline underline-offset-2">
          {context.t.t('dues.return.backToShop', { label: config.label.toLowerCase() })}
        </a>
      </p>
    )
  }

  const gift = order.buyerUserId !== order.recipientUserId

  if (order.status === 'paid') {
    return (
      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">{context.t.t('dues.return.paid')}</h2>
        <p className="text-sm">
          {gift
            ? context.t.t('dues.return.giftPaid', { plan: order.planName })
            : context.t.t('dues.return.paidPlan', { plan: order.planName })}{' '}
          {context.t.t('dues.return.payment', {
            amount: formatMinor(order.amountMinor, order.currency, context.locale),
          })}
        </p>
        <p className="text-sm">
          <a href="/plugins/dues/manage" className="font-medium underline underline-offset-2">
            {context.t.t('dues.return.seeMembership')}
          </a>
        </p>
      </section>
    )
  }

  if (order.status === 'failed' || order.status === 'cancelled') {
    return (
      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.return.nothingCharged')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {context.t.t('dues.return.checkout', {
            status: context.t.t(
              order.status === 'failed' ? 'dues.return.failed' : 'dues.return.wasCancelled',
            ),
          })}
        </p>
        <p className="text-sm">
          <a href="/plugins/dues" className="font-medium underline underline-offset-2">
            {context.t.t('dues.return.backToPlans')}
          </a>
        </p>
      </section>
    )
  }

  return (
    <section className={CARD}>
      <h2 className="font-heading text-lg font-semibold">
        {context.t.t('dues.return.confirming')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {context.t.t('dues.return.confirmingText')}
      </p>
      <p className="text-sm">
        <a href={`/plugins/dues/return?order=${order.id}`} className={QUIET_BUTTON}>
          {context.t.t('dues.return.checkAgain')}
        </a>
      </p>
    </section>
  )
}

function GiftList({ orders, t }: { orders: readonly OrderRow[]; t: Translator }) {
  const gifts = orders.filter((order) => order.buyerUserId !== order.recipientUserId)
  if (gifts.length === 0) return null

  return (
    <section className={CARD} aria-labelledby="dues-gifts">
      <h2 id="dues-gifts" className="font-heading text-lg font-semibold">
        {t.t('dues.gifts.heading')}
      </h2>
      <ul className="flex flex-col divide-y divide-border text-sm">
        {gifts.map((order) => (
          <li key={order.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span>
              {order.planName} — {formatMinor(order.amountMinor, order.currency, t.locale)}
            </span>
            <span className="text-muted-foreground">
              {order.status === 'paid'
                ? t.t('dues.gifts.delivered')
                : order.status === 'pending' || order.status === 'created'
                  ? t.t('dues.gifts.awaitingPayment')
                  : order.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const MANAGE_NOTICE_KEYS = new Set([
  'dues.manage.cancel-failed',
  'dues.manage.no-customer',
  'dues.manage.sign-in',
  'dues.manage.stripe-error',
  'dues.manage.unconfigured',
])

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
          {context.t.t('dues.manage.cancelled')}
        </p>
      )}
      {MANAGE_NOTICE_KEYS.has(`dues.manage.${context.query.error ?? ''}`) && (
        <p
          role="status"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {context.t.t(`dues.manage.${context.query.error ?? ''}`)}
        </p>
      )}

      {memberships.length === 0 ? (
        <p className={QUIET_PANEL}>
          {context.t.t('dues.manage.empty', { label: config.label.toLowerCase() })}{' '}
          <a href="/plugins/dues" className="font-medium underline underline-offset-2">
            {context.t.t('dues.manage.plans')}
          </a>
        </p>
      ) : (
        <section className={CARD} aria-labelledby="dues-manage">
          <h2 id="dues-manage" className="font-heading text-lg font-semibold">
            {context.t.t('dues.manage.title', { label: config.label.toLowerCase() })}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {memberships.map((membership) => (
              <li key={membership.id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{membership.planKey}</span>
                  <span className={membership.status === 'grace' ? '' : 'text-muted-foreground'}>
                    {membershipWhen(membership, context.t)}
                  </span>
                </div>
                {membership.status === 'grace' && (
                  <p className="text-sm">
                    {context.t.t('dues.manage.grace')}
                  </p>
                )}
                {membership.status === 'active' && membership.renewalMode === 'auto' && (
                  <form method="post" action="/api/plugins/dues/cancel">
                    <input type="hidden" name="membership" value={membership.id} />
                    <button type="submit" className={QUIET_BUTTON}>
                      {context.t.t('dues.manage.cancel', {
                        date: context.t.parts(membershipDate(membership), {
                          day: 'numeric',
                          month: 'long',
                          timeZone: 'UTC',
                        }),
                      })}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {context.t.t('dues.manage.cardHeading')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {context.t.t('dues.manage.cardText')}
        </p>
        <form method="post" action="/api/plugins/dues/portal">
          <button type="submit" className={QUIET_BUTTON}>
            {context.t.t('dues.manage.openPortal')}
          </button>
        </form>
      </section>

      <GiftList orders={orders} t={context.t} />
    </div>
  )
}
