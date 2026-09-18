# Connect Dues to Stripe

Set up payments, webhook delivery and receipts for the Dues plugin. You need administrator access to the board and access to its Stripe account. First [install the plugin and run its migrations](installing.md); keep the worker or scheduled tick running. After setup, use [Manage paid memberships](../administration/membership-guide.md) for plans, discounts and day-to-day administration.

## Keep test and production separate

Use a separate staging board and database for Stripe sandbox/test purchases.
Dues stores Stripe customer, price and subscription IDs in its database;
those IDs belong to one Stripe account and mode. Switching a board that
already contains test purchases to live keys does not convert those records.
Keep the production board's records and credentials live, and the staging
board's records and credentials in the same sandbox/test environment.

## 1. Set the public board address

Set **Admin → Settings → Board address** to the board's public HTTPS origin,
for example `https://forum.example.com`. If the deployment sets `APP_URL`,
set that variable to the same public address; it takes precedence. Stripe
must be able to reach the board without an admin login, a proxy password or
a browser challenge. The webhook is a public endpoint whose requests are
authenticated by their Stripe signature.

Create the membership group under **Admin → Groups**, enable **may be
granted by plugins**, and give it the permissions and appearance you want
to sell. Staff and system groups cannot be sold this way.

## 2. Copy the Stripe API secret key

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

## 3. Create the webhook destination in Stripe

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

## 4. Configure receipts and the billing portal

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

## 5. Complete a real Dues checkout in the sandbox

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

## Local development with Stripe CLI

Use a PostgreSQL-backed development board with Dues installed; the default
fixture mode is not a persistent payment test. Follow the
[development setup](local-board.md), then install the
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

## If setup does not work

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

## Public origin and advanced configuration

Checkout and billing-portal redirects use `APP_URL`, or the saved Board address when the environment does not override it. Without a configured address, these flows refuse to start. Exact loopback hosts (`127.0.0.1`, `localhost` and `::1`) are allowed for local development.

The standard `dues` export needs no constructor arguments. A custom board can register `createDues({ extraRedirectHosts: ['proxy.example'] })` when it deliberately needs another redirect host; this is a code option, not an admin setting. The standard definition permits Stripe checkout, billing and hosted receipt destinations.
