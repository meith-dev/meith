# Dues

Sells **time-limited membership of a usergroup** on a Meith board, through
Stripe — a monthly or yearly subscription, or a fixed-term pass a member can
buy for themselves **or gift to another member by name**.

What a paying member gets is whatever the group carries: forum access, a
badge, a name colour. Dues never makes a permission decision — it decides who
is in a group and until when, through the board's own
[timed-grant capability](../../docs/plugin-api.md#timed-group-grants), and
every guarantee that capability makes applies here. The load-bearing one:
**a grant always expires on its own.** If this plugin is removed, its tasks
stop, or Stripe closes the account, every sold membership drains away at its
own boundary and the board is left correct.

## Setting up a board

1. **In Stripe**: for auto-renewing plans, create a product and its recurring
   price(s); copy each `price_…` id. Fixed-term passes need nothing created —
   they price themselves per checkout.
2. **On the board**: create the group the plan grants (its permissions, badge
   and colour are the product), then tick **may be granted by plugins** on its
   screen under Admin → Groups. Staff, system and power-carrying groups refuse
   the tick, on purpose.
3. **Declare the plans** where the plugin is registered:

   ```ts
   // apps/community/community.plugins.ts (this repository's board uses
   // DUES_TEST_BOARD=1 to switch a test-shaped version of this on)
   import { dues } from '@meith/plugin-dues'

   export const INSTALLED_PLUGINS = [
     {
       key: 'dues',
       plugin: dues({
         currency: 'gbp',
         graceDays: 7,
         plans: [
           { key: 'supporter-month', name: 'Supporter', group: 'supporters',
             price: 500,   // integer minor units: £5.00
             billing: { mode: 'auto', interval: 'month', stripePriceId: 'price_…' } },
           { key: 'pass-90', name: '90-day pass', group: 'supporters',
             price: 1200,
             billing: { mode: 'fixed', period: 'P90D' } },
         ],
       }),
     },
   ]
   ```

   Plans are configuration in code deliberately: reviewed in git, deployed
   with the build, refused at import when wrong. A bad price or an unparseable
   period fails the deploy, not the first member who clicks buy.

4. **Keys**: set `DUES_STRIPE_SECRET_KEY` and `DUES_STRIPE_WEBHOOK_SECRET` in
   the environment, or fill them under Admin → Plugins → Dues. Environment
   wins, and the settings screen says which source is in force.
5. **Migrations**: run `community upgrade`.
6. **The webhook**: in Stripe, add an endpoint at
   `https://your.board/api/plugins/dues/hook/stripe` subscribed to the events
   the status page lists, and put its `whsec_…` in the settings.
7. **Prove it**: the status page (Admin → Plugins → Dues → status) should read
   green; buy a pass yourself in test mode before turning the live key on.

## How it decides things

- **A pass stacks.** Buying a fixed pass while holding one adds to the end —
  paying early never wastes time. Auto plans refuse a second subscription for
  the same group.
- **Gifts are fixed-term only.** An auto-renewing gift would charge the
  buyer's card forever for someone else's membership; that is a support
  disaster by design, so it is refused at configuration time.
- **Nothing is granted from a redirect.** The return page waits; only the
  signature-verified webhook (or the reconcile task reading Stripe's own
  record) turns money into membership. Amounts must match the order exactly —
  a mismatch grants nothing and flags the order for an administrator.
- **A failed renewal means grace, not the door.** Access holds for
  `graceDays` past the period; Stripe retries on its own schedule; the member
  sees what happened on their manage page.
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
- **On a pass** the whole price drops. **On a subscription** the discount
  becomes a real Stripe coupon (created on the code's first use, `duration:
  once`), so the first invoice is discounted and renewals bill in full — both
  numbers come from Stripe's own arithmetic.
- **A 100% code on a pass is a comp.** Stripe is never contacted: the order
  settles on the spot for zero and the recipient belongs immediately. This is
  the intended way to comp a member.
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
