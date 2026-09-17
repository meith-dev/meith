# Paid memberships with Dues

Use the Dues plugin to offer paid membership plans and manage payments,
gifts, and the ledger from the browser. Dues must be installed on the board;
see [Installing plugins and themes](../../customization/installing.md).
Payment-provider configuration needs the operator's help.

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

## What you need before you start

| | |
|---|---|
| **A Stripe account** | The community's own, at [stripe.com](https://stripe.com). This is where the money lands and where refunds are issued. |
| **An administrator account** | Every screen in this guide lives under **Admin → Plugins → Dues**, so you need administrator access on the board. |
| **The operator's setup, done once** | Installing the plugin, running its migrations, wiring the Stripe keys and the webhook. See [the operator's part](#what-is-the-operators-job-not-yours) below. |

Follow [Set up Stripe and the webhook](#set-up-stripe-and-the-webhook) for
the first installation. The **Status** screen (**Admin → Plugins → Dues →
Status**) shows whether keys have been entered, recent webhook events,
plans and anything needing attention. A key marked **set** only means a
value is present; a completed test purchase proves the connection works.

## Where members buy

The plugin adds an item to the board's navigation — **Membership**, unless
the operator gave it another name. It leads to the shop: one card per
plan, with the price, a box for a discount code, and a box for gifting.
Anyone can look; buying needs a signed-in account, because the membership
has to attach to one.

Each member also gets a **Your membership** page, where they see what they
hold, cancel a renewal, and open Stripe's billing portal to manage saved
cards and subscription invoices. **Recent receipts** lists paid purchases
with a Stripe payment reference among their 20 most recent orders, showing
the plan, amount, date and a **View receipt** link. This includes existing
one-time purchases and gifts they bought; only the buyer can open a receipt.
Free purchases and payments still awaiting confirmation have no receipt link.

Stripe's portal lists invoices. Dues does not enable invoice creation for
one-time Checkout payments, so those payments can have an emailed receipt
without appearing in the portal's invoice history. The board retrieves
the payment's latest Charge `receipt_url` from Stripe when the buyer clicks
**View receipt**, then opens Stripe's hosted receipt through the existing
redirect page (`pay.stripe.com` is allowed). Receipt URLs are not stored
on the board. Stripe may ask for the original email address when a receipt
link has expired. If Stripe is unavailable or has no receipt yet, the buyer
returns to the membership page with a message. Subscription renewal
invoices remain available through the billing portal. See
[Stripe's receipt documentation](https://docs.stripe.com/receipts).

A member who buys is shown as what they bought: the plan's group becomes
their primary group, with its title, colour and badge, and their old group
comes straight back when the membership ends. Staff are the exception —
a moderator who buys gets the group and everything it carries, but staff
still lead as staff: the badge and colour stay the staff group's, and the
bought group is at most an extra title under it, as far as
[Maximum displayed groups](./groups.md#display-groups) allows.

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
  product; see [Groups a plugin may
  grant](./groups.md#groups-a-plugin-may-grant). Staff and
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

A capped code holds a use the moment a checkout opens and only counts it
for good once the payment settles. If that checkout is abandoned, expires,
or is cancelled, the hold is let go and the use returns to the pool — so an
abandoned checkout never burns a use, and a member cannot slip past the cap
by opening several checkouts at once. The tally shown against a code is its
settled redemptions; a use held by an open checkout is kept back from the
cap without yet showing in that number. Codes are never deleted — **Switch
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

The operator installs and enables Dues, runs `meith upgrade`, and keeps the
worker or scheduled tick running. See [Installing plugins and themes](../../customization/installing.md)
and [Operations](../operations/operating.md#plugins). Once installed, the
Stripe setup below can be completed in the board's admin panel and Stripe's
Dashboard.

### Set up Stripe and the webhook

Use a separate staging board and database for Stripe sandbox/test purchases.
Dues stores Stripe customer, price and subscription IDs in its database;
those IDs belong to one Stripe account and mode. Switching a board that
already contains test purchases to live keys does not convert those records.
Keep the production board's records and credentials live, and the staging
board's records and credentials in the same sandbox/test environment.

#### 1. Set the public board address

Set **Admin → Settings → Board address** to the board's public HTTPS origin,
for example `https://forum.example.com`. If the deployment sets `APP_URL`,
set that variable to the same public address; it takes precedence. Stripe
must be able to reach the board without an admin login, a proxy password or
a browser challenge. The webhook is a public endpoint whose requests are
authenticated by their Stripe signature.

Create the membership group under **Admin → Groups**, enable **may be
granted by plugins**, and give it the permissions and appearance you want
to sell. Staff and system groups cannot be sold this way.

#### 2. Copy the Stripe API secret key

In Stripe, select the account and sandbox/test environment for the staging
board, then open [API keys](https://dashboard.stripe.com/apikeys). Find the
**Secret key**, reveal it if available, or create one and copy it when Stripe
shows it. A test secret starts with `sk_test_`; a live secret starts with
`sk_live_`. A newly created live secret may only be shown once. See
[Stripe's API key guide](https://docs.stripe.com/keys).

On the board, open **Admin → Plugins → Dues**, paste that value into
**Stripe secret key**, and save. Dues calls Stripe from the server; the
publishable `pk_…` key is not used here. The `whsec_…` value in the next step
is a different secret and goes in a different field.

| Board setting | Environment override | Where to get it |
|---|---|---|
| **Stripe secret key** | `DUES_STRIPE_SECRET_KEY` | Stripe → API keys → Secret key (`sk_test_…` or `sk_live_…`). |
| **Webhook signing secret** | `DUES_STRIPE_WEBHOOK_SECRET` | The particular Stripe webhook endpoint's signing secret (`whsec_…`), after creating it below. |

Environment values override saved settings. If the panel says a field is
controlled by the environment, change that value in the deployment or
remove the override before saving a value in the panel. Environment changes
need to reach both the web process and worker, followed by a restart or
redeploy. With Docker Compose, adding a variable to `.env` alone does not
pass it to a container: it must also be forwarded by the service's
`environment` or `env_file` configuration. Saving the keys in the admin
panel avoids that extra wiring. Keep the secrets out of committed files.

Leave **Stripe API base** at `https://api.stripe.com`. The advanced **Stripe
API version** defaults to `2024-12-18.acacia`; leave it unchanged for this
setup.

#### 3. Create the webhook destination in Stripe

Stay in the same Stripe account and sandbox/test environment as the API
key. Open [Workbench → Webhooks](https://dashboard.stripe.com/webhooks)
and create an event destination. Choose events from **Your account**, use
snapshot events and the API version configured in Dues, then select these
ten event types:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
invoice.paid
invoice.payment_failed
customer.subscription.updated
customer.subscription.deleted
charge.refunded
charge.dispute.created
```

These are also listed on **Admin → Plugins → Dues → Status**. Continue,
choose **Webhook endpoint**, and enter the complete public URL:

```text
https://forum.example.com/api/plugins/dues/hook/stripe
```

Replace `https://forum.example.com` with your board's address. Save the
destination, open its details, and reveal its **Signing secret**. Copy the
whole `whsec_…` value into **Admin → Plugins → Dues → Webhook signing
secret**, then save. Do not use the endpoint's `we_…` identifier or invent a
random secret. Stripe and Dues must have the same signing secret for this
specific endpoint. See [Stripe's webhook setup](https://docs.stripe.com/webhooks).

#### 4. Configure receipts and the billing portal

In Stripe's [Customer emails settings](https://dashboard.stripe.com/settings/emails),
enable **Successful payments** for emailed receipts; enable refund emails
if wanted. Automatic receipt emails are not sent for test payments, so use
Stripe's manual receipt action when testing email delivery. One-time
receipts are also available through **Your membership → Recent receipts**;
they do not require invoice creation. See [Stripe's receipts guide](https://docs.stripe.com/receipts).

Open the [customer portal settings](https://dashboard.stripe.com/settings/billing/portal)
in the same environment and save its configuration. Enable payment method
updates and invoice history. Leave plan switching and quantity changes off:
Dues sells the plans and group grants configured on the board. Dues already
creates a portal session for the signed-in buyer and supplies its return
address, so you do not need to paste a public portal link into the plugin.
See [Stripe's portal settings](https://docs.stripe.com/customer-management/configure-portal).

#### 5. Complete a real Dues checkout in the sandbox

Create a fixed-term plan under **Admin → Plugins → Dues → Plans**, priced
above Stripe's minimum for its currency. Sign in as a member on the staging
board, open **Membership**, and buy that plan through its checkout button.
Use Stripe's test card `4242 4242 4242 4242`, a future expiry date and any
three-digit CVC. These are [sandbox test details](https://docs.stripe.com/testing#cards),
never details to use in live mode.

After payment, check all of the following:

- In Stripe's webhook destination, the checkout event's delivery returned
  HTTP `200`.
- In **Admin → Plugins → Dues → Status**, the checkout event appears with
  outcome `granted` for the first paid pass. `deferred` means Dues recorded it but processing
  failed; inspect the board logs and the worker's reconciliation.
- The member's return page changes from **Confirming your payment…** to
  **Paid, and done** after **Check again**; the membership and ledger entry
  exist, and **Your membership → Recent receipts → View receipt** opens the
  Stripe receipt.
- **Open the billing portal** works. If you sell subscriptions, test a
  subscription and cancellation as well.

A generic event sent from Stripe's test tools may contain a Checkout Session
that Dues never created. An `unmatched-session` outcome then checks delivery
but does not prove a purchase grants membership. Start the checkout on the
board for the complete test.

For production, repeat the key, webhook and portal setup in Stripe's live
mode on the production board. Copy its `sk_live_…` key and its live endpoint's
own `whsec_…`; the sandbox's signing secret will not work. Create production
subscription prices in live mode too, or let Dues create them when you add
the production plans. Do not reuse a sandbox `price_…` ID.

#### Local development with Stripe CLI

Use a PostgreSQL-backed development board with Dues installed; the default
fixture mode is not a persistent payment test. Follow the
[development setup](../../contributing/development.md), then install the
[Stripe CLI](https://docs.stripe.com/cli/install) and run:

```sh
stripe login
stripe listen --forward-to http://localhost:3000/api/plugins/dues/hook/stripe
```

The listener prints a `whsec_…` signing secret. Save **that listener's
secret** in the local board's webhook setting and use an API key from the
same sandbox/test environment. Keep the listener running while buying a
plan on the local board. A Dashboard endpoint's secret and the CLI
listener's secret are different, even though both start with `whsec_`.
See [Stripe's signature troubleshooting](https://docs.stripe.com/webhooks/signature).

#### If setup does not work

| Symptom | What to check |
|---|---|
| Both keys say **set**, but checkout fails | **Set** checks presence only. Check the key's account and mode, the public board address, and the server log for `dues: could not start checkout`. |
| The settings form does not change the key in use | An environment override wins. Update it for the web and worker processes and redeploy, or remove it and use the saved setting. |
| Stripe reports `404`, a redirect, or an HTML login page | Use the exact `/api/plugins/dues/hook/stripe` URL on the public HTTPS board. Check that Dues is enabled and that the proxy forwards this path directly. Opening it in a browser sends GET; Stripe needs POST. |
| Stripe reports `503` with an unconfigured signing secret | Fill **Webhook signing secret**, or correct `DUES_STRIPE_WEBHOOK_SECRET` in the running deployment. |
| Stripe reports `400` with a signature error | Copy the secret from the destination that sent this event. Check sandbox versus live and Dashboard versus CLI, the server clock, and that the proxy preserves the request body and `Stripe-Signature` header. |
| Stripe reports `200`, but access is missing | Inspect the event outcome in Dues Status. An unmatched test event is not a board order; a deferred or flagged payment needs investigation. Ensure the worker or scheduled tick runs so reconciliation can recover failed processing. |
| Stripe says a customer or price does not exist | The saved Stripe IDs and API key belong to different accounts or modes. Keep sandbox and live boards separate; changing the key does not migrate IDs. |
| The portal has no invoice for a paid pass | One-time payments have receipts without invoices. Use **Recent receipts** on the membership page. |

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

For connection problems, work through the troubleshooting table above with
the operator. For plugin permissions and what "enabled" means, see
[Operations § Plugins](../operations/operating.md#plugins).
