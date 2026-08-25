# Dues

Sells **membership of a usergroup** on a Meith board, through Stripe — a
monthly or yearly subscription, a fixed-term pass from a day to two years, or
a lifetime membership — each a plan an administrator shapes in the panel:
name, price, currency, and length are the operator's call. A pass or a
lifetime plan can be bought for yourself **or gifted to another member by
name**.

What a paying member gets is whatever the group carries: forum access, a
badge, a name colour. Dues never makes a permission decision — it decides who
is in a group and until when, through the board's own
[timed-grant capability](../../docs/plugin-api.md#timed-group-grants), and
every guarantee that capability makes applies here. The load-bearing one:
**a grant always expires on its own.** If this plugin is removed, its tasks
stop, or Stripe closes the account, every sold membership drains away at its
own boundary and the board is left correct.

**A purchase makes the plan's group the member's primary group**, and the group
they were in — Registered, on most boards — becomes a secondary membership
alongside it. So a member who buys shows as what they bought: its title, its
colour, its badge. When the membership lapses or is revoked, the board hands
the old primary group straight back. A member who would rather be shown as
something else can pick any group they are in under UserCP → Profile; the
choice is theirs, and it drops away with the membership it names.

**Staff are the exception, and they are meant to be.** A moderator or
administrator who buys gets the group and everything it carries, as a secondary
membership — but their standing does not move, and they are still shown as
staff. Selling a badge is fine; selling somebody out of the one that says who
answers for the board is not.

**Try it before you read any of this**: [demo.meith.dev](https://demo.meith.dev)
runs this plugin against a Stripe that is not Stripe — a shop with a year of
history behind it, and a checkout a visitor can actually go through. See
[demo mode](../../docs/demo-mode.md#the-shop-and-a-stripe-that-is-not-stripe).

## Setting up a board

1. **Register the plugin** where plugins are registered:

   ```ts
   // apps/community/community.plugins.ts
   import { dues } from '@meith/plugin-dues'

   export const INSTALLED_PLUGINS = [{ key: 'dues', plugin: dues }]
   ```

   That is the whole of it — `dues` needs no constructor argument, which is
   what lets a marketplace install register it from the key alone. Every
   board-specific choice is made afterwards, in the browser.

   A board that registers plugins in code and genuinely needs a code-only
   escape hatch — an extra redirect host for a proxy or a loopback address,
   or code-declared seed plans for a demo or test board — calls `createDues`
   instead: `createDues({ extraRedirectHosts: ['proxy.example'] })`. This
   repository's own demo and test boards do exactly that, in
   `community.demo.plugins.ts`, behind `DEMO_MODE` and `DUES_TEST_BOARD`. A
   seed plan populates the plan table on the board's first run and is
   ignored once it has rows — after that, the panel owns the plans, exactly
   as for a board that never declared any.

2. **On the board**: create the group a plan will grant (its permissions,
   badge and colour are the product), then tick **may be granted by plugins**
   on its screen under Admin → Groups. Staff, system and power-carrying
   groups refuse the tick, on purpose.
3. **Settings**, all under Admin → Plugins → Dues:
   - **Currency** and **Grace period** — the board's default currency (a
     plan can still be priced in any ISO 4217 code; this is what a new plan
     defaults to, what the ledger shows, and the fallback when a Stripe
     event carries no currency of its own) and the days a lapsed renewal
     keeps access. `DUES_CURRENCY` and `DUES_GRACE_DAYS` override them from
     the environment, on the same rule as the keys below. `DUES_CURRENCY` is
     matched case-insensitively and trimmed — `EUR` and `eur` both select
     the same option — but write it lower-case.
   - **`DUES_STRIPE_SECRET_KEY`** and **`DUES_STRIPE_WEBHOOK_SECRET`** — set
     in the environment, or filled in here. Environment wins, and the
     screen says which source is in force.
4. **Migrations**: run `community upgrade`.
5. **Make the plans** under Admin → Plugins → Dues → plans — see
   [Plans](#plans) below.
6. **The webhook**: in Stripe, add an endpoint at
   `https://your.board/api/plugins/dues/hook/stripe` subscribed to the events
   the status page lists, and put its `whsec_…` in the settings.
7. **Prove it**: the status page (Admin → Plugins → Dues → status) should read
   green; buy a pass yourself in test mode before turning the live key on.

### What a marketplace install cannot reach

`allowedRedirectHosts` — the hosts a route's redirect may point an absolute
URL at — is declared on the plugin definition itself, and the host reads it
before any setting resolves. There is no way for a setting to feed it, so
the zero-argument `dues` export carries only Stripe's own two hosts
(`checkout.stripe.com`, `billing.stripe.com`), which is everything the
checkout and billing-portal flows need. A board that must add another host
registers `createDues({ extraRedirectHosts: [...] })` in code instead — the
one piece of Dues configuration that stays code-only because the plugin API
has no other way to express it.

## Plans

A plan is made and edited in the panel. It has a permanent key, a name, a
description, the group it grants, a price in minor units, its own three-letter
currency, and one of three billing shapes:

- **A pass** — one payment for a fixed stretch, one day to two years minus
  the longest possible grace window: the board caps a plugin grant at two
  years, checked against the grace setting's maximum (30 days) rather than
  whatever it is set to today, since grace can be raised after the plan
  already exists — and a pass respects the cap rather than pretending
  otherwise.
- **A subscription** — renews monthly or yearly until cancelled. It bills
  against a real Stripe price: leave the box empty and the plugin mints a
  product and price to match the form, or paste a `price_…` id made in the
  Stripe dashboard. Subscriptions are never giftable.
- **Lifetime** — one payment, no renewal, no end date. Under the hood the
  board still only ever grants a bounded window (about 23 months), and the
  hourly sweep re-issues it long before it drains — so if the plugin is ever
  removed, access ends at the window's edge instead of leaving unaccountable
  permanent rows. Holding lifetime makes further purchases for that group
  refuse; holding a subscription blocks buying lifetime until the renewal is
  cancelled.

Editing is safe by construction: **every order snapshots its plan** — name,
price, currency, length — so a change never rewrites what anyone already
bought. A subscription price change mints a new Stripe price; running
subscriptions keep billing what they signed up for, and only the next buyer
sees the new number. Plans are never deleted — **archiving** takes one off
sale while everyone who holds it keeps it. The plan key is permanent because
it is how orders, memberships and the ledger refer to the plan forever.

A pass's length is part of that snapshot, and settlement reads it from the
order, not from the plan row — an edit made while a buyer is mid-checkout
grants what they paid for, never the edited length. Money already worked
this way (the exact-match rule above); the length just needed to match it.
The plan's own length is a fallback only, for an order that genuinely
predates carrying one of its own.

## How it decides things

- **A pass stacks.** Buying a fixed pass while holding one adds to the end —
  paying early never wastes time. Subscriptions refuse a second subscription
  for the same group, lifetime refuses everything after it — there is nothing
  left to sell that member.
- **Gifts are one-off purchases only** — passes and lifetime. An
  auto-renewing gift would charge the buyer's card forever for someone
  else's membership; that is a support disaster by design, so it is refused
  when the plan is made. The recipient is notified the moment their gift is
  paid for — the board's own bell and e-mail, honouring their notification
  preferences.
- **Checkout is rate-limited** — ten starts a minute per member, enforced by
  the host before the handler runs — so a stuck retry loop or a hostile
  script cannot mint orders and Stripe sessions at wire speed.
- **Nothing is granted from a redirect.** The return page waits; only the
  signature-verified webhook (or the reconcile task reading Stripe's own
  record) turns money into membership. Amounts must match the order exactly —
  a mismatch grants nothing and flags the order for an administrator.
- **A failed renewal means grace, not the door.** Access holds for
  `graceDays` past the period; Stripe retries on its own schedule; the member
  is told through the board's own notifications — bell and e-mail, per their
  preferences — and sees what happened on their manage page.
- **A refund or chargeback revokes immediately** — the only path that takes
  access away early — and lands in the ledger as a negative amount.
- **Cancelling keeps what was paid for.** Cancel-at-period-end, always.
- **Lost webhooks are ordinary.** The five-minute reconcile task settles
  pending orders from Stripe's records and replays any stored event that
  failed; the hourly sweep tidies lapsed rows the expiry already handled.

## Discount codes

Minted under Admin → Plugins → Dues → discount codes: a percentage off,
optionally locked to one plan, capped to a number of redemptions, or given an
expiry date. Members type the code in the box on any plan card.

- **A code discounts what Stripe charges, not what the order records** — the
  order snapshots the discounted amount, so the exact-match rule between
  payment and order still holds.
- **On a pass or lifetime plan** the whole price drops. **On a
  subscription** the discount
  becomes a real Stripe coupon (created on the code's first use, `duration:
  once`), so the first invoice is discounted and renewals bill in full — both
  numbers come from Stripe's own arithmetic.
- **A 100% code on a pass or lifetime plan is a comp.** Stripe is never
  contacted: the order settles on the spot for zero and the recipient belongs
  immediately. This is the intended way to comp a member — including a
  lifetime comp.
- **Redemptions count at settlement**, not at checkout, so an abandoned
  checkout never burns a use. Two people racing the last redemption of a
  capped code can both succeed — the count is honest about money that
  actually moved.
- **Codes are never deleted.** Switch one off and it refuses from that moment;
  its history stays.
- Stripe refuses charges under its per-currency minimum (about £0.30), so a
  deep discount on a cheap plan can fail at Stripe's page. 100%-off passes
  are exempt — they never reach Stripe.

## The admin desk

Admin → Plugins → Dues → memberships acts on any sold membership:

- **Extend** adds days to the period end and moves the group grant with it —
  a grant, not a charge, so the ledger is untouched.
- **Cancel renewal** is the same cancel-at-period-end a member can do from
  their manage page, for when someone asks support instead.
- **Revoke now** removes access on the spot and tells Stripe to stop billing
  a subscription. It does not move money — issue any refund in the Stripe
  dashboard, and the refund webhook records it (and would have revoked on its
  own).
- **Clear the flag** acknowledges a needs-attention row once you have looked
  at it; flagged orders are cleared from the status screen.

Every one of these actions lands in the board's admin action log as
`plugin.route`, alongside everything else administrators do.

## What the operator owns

VAT and invoicing, the refund policy and statutory cancellation rights, and
what your jurisdiction requires around selling recurring services — prices
here are simply what the member pays. Refunds are issued in the Stripe
dashboard and flow back as webhooks.

## Testing

- `pnpm vitest run plugins/dues` — the unit suites: money, periods,
  configuration refusals, the Stripe client against a scripted fetch, webhook
  signatures, event mapping across Stripe API versions.
- `pnpm vitest run tests/dues-lifecycle.test.ts` — the whole life of a
  membership against real SQL: purchase, gift, stacking, replay, mismatch,
  renewal, grace, cancel, refund-revoke, reconcile, sweep, discount codes,
  and the admin desk.
- `pnpm test:e2e e2e/dues-purchase-no-js.spec.ts` — a real browser buys a
  pass, gifts one, and redeems a minted code on the test board
  (`DUES_TEST_BOARD=1`), against a fake Stripe on loopback, with the suite
  signing webhooks the way Stripe would.
