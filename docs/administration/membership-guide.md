# Paid memberships

Dues sells group membership through Stripe. Install the plugin, apply migrations and complete [Stripe setup](../operations/stripe-setup.md). Open **Admin → Plugins → Dues**.

## Before sales

Check **Status**, webhook delivery and attention items. Test checkout on a separate staging board. Test and live Stripe keys do not convert existing customers, prices or subscriptions.

Create the benefit group, enable **may be granted by plugins** and verify its permissions. Staff groups cannot be granted. Configure currency and grace period; `DUES_CURRENCY` and `DUES_GRACE_DAYS` override saved defaults.

## Plans

Enter a permanent key, name, description, group, currency and price. Prices use currency minor units: EUR 2500 is €25.00.

| Type | Access | Giftable |
|---|---|---|
| Pass | Fixed duration, one payment | Yes |
| Subscription | Monthly or yearly renewal | No |
| Lifetime | No end date, one payment | Yes |

For subscriptions, supply a compatible Stripe price or create one through the form. Purchases retain their plan snapshot; edits do not change existing subscription prices. Archive to stop new sales while preserving history.

## Purchases and receipts

Signed-in members buy through **Membership** and manage access through **Your membership**. Passes extend an existing period. Lifetime holders cannot buy more time for that group. Subscribers must cancel renewal before buying lifetime access.

**Recent receipts** includes eligible paid orders among the buyer's 20 most recent orders, including gifts. Only the buyer can open them. Free or unconfirmed purchases have no receipt link. Subscription renewal invoices are in the billing portal. Receipt links are retrieved from Stripe on request.

## Discounts and gifts

Limit codes by plan, redemptions and UTC expiry. Subscription discounts apply only to the first payment. Open checkouts reserve capped redemptions until settled or released.

A 100% discount on a pass or lifetime plan grants free membership without Stripe. Other amounts must meet provider minimums. Gifts grant the selected username membership after payment confirmation, without a claim step.

## Administration

| Action | Result |
|---|---|
| Extend | Add 1–366 days without charging |
| Cancel renewal | Stop renewal; retain paid access |
| Revoke now | Remove access and stop billing; no refund |
| Clear the flag | Acknowledge an investigated issue |

Issue refunds in Stripe and check resulting webhook and membership state. Refunds and chargebacks can revoke access. Failed renewal enters the grace period; the member should update payment details in the portal.

Trace problems through **Memberships**, **Orders needing attention** and the ledger. Verify scheduler and webhook delivery. A redirect from checkout does not grant access; verified events or reconciliation do. Amount mismatches need investigation.

## Group expiry

Purchases normally make the paid group primary and retain the previous primary as an additional membership. Staff keep their visible identity. Expiry restores the prior primary where appropriate.

All plugin grants have bounded windows. Lifetime access requires continued renewal by the plugin; removing it eventually ends access. Configure pricing, tax, refund and cancellation policies separately.
