# Connect Dues to Stripe

Install [Dues and its migrations](installing.md), keep the scheduler running and use a separate staging board/database for test payments. Stored Stripe IDs belong to one account and mode; changing keys does not convert them.

## Board settings

Set the public HTTPS **Board address** or `APP_URL`. Stripe must reach the webhook without proxy authentication or browser challenges. Create an ordinary benefit group and enable **may be granted by plugins**.

Under **Admin → Plugins → Dues**, configure:

| Setting | Value | Environment override |
|---|---|---|
| Stripe secret key | Account/mode API secret (`sk_test_…` or `sk_live_…`) | `DUES_STRIPE_SECRET_KEY` |
| Webhook signing secret | Specific endpoint's `whsec_…` secret | `DUES_STRIPE_WEBHOOK_SECRET` |

Get API secrets from [Stripe API keys](https://docs.stripe.com/keys). Publishable `pk_…` keys and endpoint `we_…` IDs are not these secrets. Overrides win over panel values and must reach both web and worker; Compose `.env` values require service forwarding.

Keep the API base at `https://api.stripe.com` and the plugin's default API version `2024-12-18.acacia` unless deliberately changing integration behaviour.

## Webhook

Create a [Stripe webhook destination](https://docs.stripe.com/webhooks) for the same account/mode, using snapshot events and the API version configured in Dues. Target:

```text
https://forum.example.com/api/plugins/dues/hook/stripe
```

Subscribe to these events, also listed in Dues **Status**:

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

Copy that destination's signing secret into Dues.

## Receipts and portal

Enable successful-payment emails in Stripe's customer-email settings if needed. Test payments do not automatically send receipt emails; use the manual receipt action for testing. See [Stripe receipts](https://docs.stripe.com/receipts).

Configure the [billing portal](https://docs.stripe.com/customer-management/configure-portal) in the same mode. Enable payment-method updates and invoice history; leave plan switching and quantity changes off. Dues supplies authenticated portal sessions and return URLs.

## Test checkout

Create a paid pass on the staging board, then buy it as a member using [Stripe test payment details](https://docs.stripe.com/testing#cards). Start checkout on the board; generic test events can return `unmatched-session` without testing a real order.

Verify webhook HTTP 200, a `granted` outcome in **Status**, membership and ledger entries, the receipt link and portal access. `deferred` means processing needs investigation/reconciliation. Test subscription cancellation if selling subscriptions.

Repeat setup on the production board with live keys, a live endpoint secret and live prices. Never reuse test IDs.

## Local development

Use a writable PostgreSQL board and [Stripe CLI](https://docs.stripe.com/cli/install):

```sh
stripe login
stripe listen --forward-to http://localhost:3000/api/plugins/dues/hook/stripe
```

Save the listener's signing secret, not a Dashboard endpoint's secret, and keep the listener running during checkout.

## Troubleshoot

| Symptom | Check |
|---|---|
| Keys set, checkout fails | Account/mode, public origin and `dues: could not start checkout` log |
| Saved key has no effect | Environment override and restarted web/worker |
| 404, redirect or login HTML | Exact public POST route, enabled plugin and proxy |
| 503 | Missing signing secret |
| 400 signature error | Sending endpoint's secret, test/live mode, clock and unchanged raw body/header |
| 200 without access | Event outcome, matching board order and reconciliation task |
| Missing customer/price | Stored ID and key account/mode mismatch |
| Pass absent from portal invoices | Use **Your membership → Recent receipts** |

Checkout/portal flows require a configured origin; exact loopback hosts are allowed locally. Custom `createDues({ extraRedirectHosts: [...] })` is a code-level option. See [Membership administration](../administration/membership-guide.md).
