# The memberships guide

For whoever looks after the community's money — the treasurer, where
there is one — on running paid membership with **Dues**, the membership
plugin that ships with the board
([plugins/dues](https://github.com/meith-dev/meith/tree/main/plugins/dues)).
Everything here happens in a browser. The few steps that genuinely need a
terminal belong to whoever runs the server — the operator — and are marked
as theirs. The rest of the board's day-to-day is
[The organiser's guide](./organiser-guide.md).

## What Dues is

Dues sells membership of a **usergroup** through Stripe. A member pays; the
board puts them in the group; the group carries whatever you attached to it
— access to the members-only forum, a badge, a name colour. When the
membership lapses or is revoked, the board takes the group away again, on
its own, at the boundary the payment bought. Nobody has to remember to
remove anyone.

The money goes to the community's own Stripe account, under its own
keys. The board takes no cut and charges no per-member fee — the only fees
are Stripe's own processing fees. Payment happens on Stripe's checkout
page; no card number ever touches the board.

You can try the whole thing without spending anything:
[demo.meith.dev](https://demo.meith.dev) runs this plugin against a
pretend Stripe, with a checkout a visitor can actually go through.

## What you need before you start

| | |
|---|---|
| **A Stripe account** | The community's own, at [stripe.com](https://stripe.com). This is where the money lands and where refunds are issued. |
| **An administrator account** | Every screen in this guide lives under **Admin → Plugins → Dues**, so you need administrator access on the board. |
| **The operator's setup, done once** | Installing the plugin, running its migrations, wiring the Stripe keys and the webhook. See [the operator's part](#what-is-the-operators-job-not-yours) below. |

Once the operator is done, the **Status** screen (**Admin → Plugins →
Dues → Status**) tells you whether everything is working: keys set,
webhook receiving, plans on sale, and anything needing attention. Buy a
plan yourself in Stripe's test mode before the live key goes on.

## Where members buy

The plugin adds an item to the board's navigation — **Membership**, unless
the operator gave it another name. It leads to the shop: one card per
plan, with the price, a box for a discount code, and a box for gifting.
Anyone can look; buying needs a signed-in account, because the membership
has to attach to one.

Each member also gets a **Your membership** page, where they see what they
hold, cancel a renewal, and open Stripe's billing portal to change their
card or fetch receipts and invoices. Cards and receipts live on Stripe,
not on the board.

A member who buys is shown as what they bought: the plan's group becomes
their primary group, with its title, colour and badge, and their old group
comes straight back when the membership ends. Staff are the exception —
a moderator who buys gets the group and everything it carries, but stays
shown as staff.

## Plans

Plans are made and changed under **Admin → Plugins → Dues → Plans**. A
plan has one of three shapes:

| Shape | What it is | Renewal | Giftable |
|---|---|---|---|
| **A pass** | One payment for a fixed stretch — a day to two years | None; it runs out | Yes |
| **A subscription** | Renews monthly or yearly until cancelled | Automatic, via Stripe | No — it would bill the buyer forever |
| **Lifetime** | One payment, no end date | None | Yes |

### Creating one

**Add a plan** on the Plans screen asks for:

- **Key** — the plan's permanent name in the records, like `annual-2026`.
  It can never be changed, because orders and the ledger refer to it
  forever. Everything else can be edited later.
- **Name** and an optional **description** — what members read on the card.
- **Group it grants** — a group marked **may be granted by plugins** under
  **Admin → Groups**. The group's permissions, badge and colour are the
  product; see [Timed group
  grants](./plugin-api.md#timed-group-grants). Staff and
  power-carrying groups refuse the tick, on purpose.
- **Price**, in minor units of its **currency** — for a euro plan, `2500`
  is €25.00. The screen warns you about the trap: a decimal here is
  almost always a hundredfold mistake.
- **How it bills** — pass, subscription, or lifetime — with a length for a
  pass and a monthly-or-yearly interval for a subscription.
- **Can be bought for another member** — for passes and lifetime only.
- **Hidden from the shop** — the plan exists but no card is shown.

A subscription bills against a real Stripe price. Leave the Stripe price
box empty and the plugin creates one to match the form; or paste a
`price_…` id made in the Stripe dashboard.

### Changing and retiring one

Editing is safe: **every purchase snapshots its plan** — name, price,
currency, length — so a change never rewrites what anyone already bought.
Raise a subscription's price and running subscriptions keep billing what
they signed up for; only the next buyer sees the new number.

Plans are never deleted. **Take it off sale** archives one — everybody who
holds it keeps it, nobody new can buy it — and **Put it back on sale**
reverses that.

Two rules worth knowing before a member asks:

- **Passes stack.** Buying a pass while holding one adds to the end, so
  paying early never wastes time.
- **Lifetime is final.** A member holding lifetime cannot buy anything
  further for that group, and a member with a running subscription must
  cancel its renewal before buying lifetime — they keep everything already
  paid for.

## Discount codes

Minted under **Admin → Plugins → Dues → Discount codes**. A code takes a
percentage off, and can be:

- **locked to one plan**, or good on any;
- **capped** to a number of redemptions;
- **given an expiry date** (end of day, UTC).

Leave the code box empty and one is invented for you. Members type the
code in the box on any plan card. On a pass or lifetime plan the whole
price drops; on a subscription only the first payment is discounted —
renewals bill in full.

Redemptions count when a payment settles, not when a checkout starts, so
an abandoned checkout never burns a use. Codes are never deleted — **Switch
off** stops one from that moment and keeps its history.

> [!NOTE]
> Stripe refuses charges under its per-currency minimum (about £0.30, or
> the near equivalent in euro), so a deep discount on a cheap plan can
> fail at Stripe's page. 100%-off passes are exempt — they never reach
> Stripe.

### Comping a member

**A 100% code on a pass or lifetime plan is a comp.** The member types the
code, the order settles on the spot for zero, and they belong immediately
— Stripe is never contacted. This is the intended way to give membership
away, including lifetime honorary membership, and it still lands in the
records like any other order.

## Gifting

A pass or a lifetime plan marked giftable can be bought for another
member: the buyer types the recipient's username in the box on the plan
card and pays as normal. The moment the payment confirms, the recipient
holds the membership and is told — the board's own notification bell and
e-mail, honouring their preferences. There is nothing for them to claim.

Subscriptions are never giftable, and the plan form refuses to make one
so — an auto-renewing gift would charge the buyer's card forever for
someone else's membership.

## Day to day

### The memberships screen

**Admin → Plugins → Dues → Memberships** lists every membership the plugin
has sold, flagged rows first, and acts on any of them:

| Action | What it does |
|---|---|
| **Extend** | Adds days (1 to 366) to the period end and moves the group grant with it. A grant, not a charge — the ledger is untouched. |
| **Cancel renewal** | The same cancel-at-period-end a member can do from their own page, for when someone asks you instead. They keep what they paid for until the period ends. |
| **Revoke now** | Removes access on the spot and tells Stripe to stop billing a subscription. It does not move money — issue any refund in the Stripe dashboard. |
| **Clear the flag** | Acknowledges a needs-attention row once you have looked at it. |

Every action is recorded in the board's admin action log, alongside
everything else administrators do.

### When a renewal fails

A failed renewal means grace, not the door. Access holds for the grace
window (seven days unless the operator set otherwise — the Status screen
shows the number in force), Stripe retries the card on its own schedule,
and the member is told by bell and e-mail and sees what happened on their
**Your membership** page — updating their card there usually settles it.
If Stripe gives up, the membership lapses at the end of the grace window.

### Refunds and chargebacks

Refunds are issued in the **Stripe dashboard** — there is no refund button
on the board. When Stripe reports a refund or a chargeback, the plugin
revokes the membership immediately (the only thing that takes access away
early) and records the money out as a negative entry in the ledger. If you
have already pressed **Revoke now**, the later refund is simply recorded.

### Orders needing attention

Occasionally money moves but an order cannot settle cleanly — most often
an amount that did not match what the order expected. Nothing is granted;
the payment is kept, the reason recorded, and the row flagged. The
**Status** screen counts these and the Memberships screen lists them
first. Check the payment in Stripe's dashboard, put it right there, then
**Clear the flag**.

### The board keeps itself right

You do not run anything. A reconcile task runs every five minutes,
settling pending orders from Stripe's own records and replaying any missed
webhook; an hourly sweep tidies rows whose expiry has already done the
real work. A lost webhook is ordinary and heals itself.

## The ledger

**Admin → Plugins → Dues → Ledger** is the board's own record of money
moved, in the community's currency: charges positive, refunds and chargebacks
negative, append-only — written as money moves and never edited. It shows
a month-by-month table — the number of charges, the gross taken, the
amount refunded — and the latest individual entries: what kind of movement
(a charge, a refund, a chargeback), when, and how much.

That monthly table is what you show whoever asks at year end. For the
authoritative figures — Stripe's fees, payouts to the bank, exports — use
the Stripe dashboard; the ledger is the board's copy, and the two should
agree.

VAT, invoicing and the refund policy are not the plugin's department:
prices here are simply what the member pays, and Stripe holds the
invoices and receipts.

## What is the operator's job, not yours

The plugin is code on the server, so its installation is the operator's,
per [Running a board](./operating.md#plugins) and the plugin's own
[README](https://github.com/meith-dev/meith/tree/main/plugins/dues):

- **Installing and enabling the plugin**, and running its migrations
  (`community upgrade`) — terminal work.
- **The Stripe keys** — `DUES_STRIPE_SECRET_KEY` and
  `DUES_STRIPE_WEBHOOK_SECRET`, set in the server's environment, or filled
  under **Admin → Plugins → Dues** in the settings form (the environment
  wins, and the screen says which source is in force).
- **The webhook** — an endpoint created in the Stripe dashboard at the
  address the Status screen gives, subscribed to exactly the events it
  lists.

### Origin for Stripe redirects

Checkout and the billing portal build Stripe's `success_url`, `cancel_url`
and `returnUrl` from the board's own address — `APP_URL` in the
environment, or **Board address** under Admin → Settings if the operator
set it there instead. Until one of those is set, both flows refuse with
the same "payments are not set up" message an unconfigured board gives
everywhere else, rather than trusting whatever host arrived with the
request — a board's own settings decide where a payer comes back to, never
a header a visitor's browser sent. The one exception is a request whose
`Host` header is exactly `127.0.0.1`, `localhost` or `::1`: a loopback
connection, which is what `pnpm dev` and the end-to-end suite both are, so
local development never needs a board address configured to work.

Everything past that point is yours, in the browser: the board's
**currency** and **grace period** are settings on the same **Admin →
Plugins → Dues** screen as the Stripe keys above (an environment variable
can pin either of those too, on the same rule), and the shop's **label** —
what the navigation calls it, if not "Membership" — is the one piece still
set where the operator registers the plugin, because it is a cosmetic
choice made once rather than something you would ever need to change from
the panel.

If the shop says payments are not set up, or the Status screen is not
green, that shorter list is where the fix lives — send it to the operator. What
plugins can and cannot do on a board, and what "enabled" means, is
[Running a board § Plugins](./operating.md#plugins).
