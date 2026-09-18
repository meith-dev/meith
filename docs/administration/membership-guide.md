# Manage paid memberships with Dues

Dues sells membership of an approved community group through Stripe. An operator installs the plugin, applies migrations and configures Stripe credentials and the webhook. Administrators then manage it under **Admin → Plugins → Dues**.

## Verify setup before selling

Open **Status** and check credentials, webhook receipt and items needing attention. Test the full purchase and membership flow on a separate staging board before configuring the production board with live credentials.

Create the group whose benefits the plan provides and mark it **may be granted by plugins**. Powerful staff groups cannot be granted this way. Set and verify the group's forum permissions before selling access.

## Complete payment setup

Follow [Connect Dues to Stripe](../operations/stripe-setup.md) for keys, webhooks, receipts, the billing portal and a complete test checkout. Keep staging and production boards separate: changing keys does not convert stored Stripe customers, prices or subscriptions between accounts or modes.

Set the default currency and grace period in Dues settings. `DUES_CURRENCY` and `DUES_GRACE_DAYS` override the saved values when configured; individual plans have their own currencies.

## Create a plan

Open **Plans** and enter the key, name, description, group, currency and price. The key is permanent because records refer to it. Prices use the currency's minor units: for example, 2500 represents €25.00, not €2,500.

| Plan | Billing | Giftable |
|---|---|---|
| Pass | One payment for a fixed duration | Yes |
| Subscription | Monthly or yearly renewal | No |
| Lifetime | One payment, no end date | Yes |

For subscriptions, supply a compatible Stripe price or let the plugin create one from the form. Review the amount and interval before saving.

Purchases snapshot their plan. Editing a price does not rewrite existing purchases or change the amount of an existing subscription. Archive a plan to stop new sales while preserving current memberships and history.

## Explain the member experience

Members buy through the board's Membership page while signed in. **Your membership** shows their current access, renewal cancellation and the Stripe billing portal for payment details and receipts.

Passes extend an existing period. A lifetime holder cannot buy more time for the same group. A subscriber must cancel renewal before purchasing lifetime access. Staff keep their visible staff identity even when they buy another group membership.

## Help a member find a receipt

On **Your membership**, **Recent receipts** lists paid purchases with a Stripe payment reference among the buyer's 20 most recent orders. **View receipt** opens Stripe's hosted receipt. This includes one-time purchases and gifts the member bought; only the buyer can open it. Free purchases and unconfirmed payments have no receipt link.

One-time payments have receipts without necessarily appearing in the billing portal's invoice history. Subscription renewal invoices remain in the portal. If Stripe has no receipt yet or cannot be reached, the member returns with an explanatory message. Dues retrieves the receipt URL when requested rather than storing it.

## Discounts and gifts

Discount codes can be limited by plan, redemptions and UTC expiry. A subscription discount applies to the first payment; renewals use the normal amount. Open checkouts reserve capped redemptions until settled or released.

A 100% discount on a pass or lifetime plan settles as a free membership without contacting Stripe. Other charges remain subject to the payment provider's currency minimums.

A giftable pass or lifetime plan can be bought for another username. The recipient receives membership after payment confirmation; there is no separate claim step. Subscriptions cannot be gifted.

## Handle daily administration

| Action | Effect |
|---|---|
| Extend | Adds 1–366 days without charging money |
| Cancel renewal | Stops future renewal; retains access already paid for |
| Revoke now | Removes access and stops subscription billing; does not itself refund money |
| Clear the flag | Acknowledges an investigated attention item |

Issue refunds in Stripe. Provider refund or chargeback events can revoke access; inspect the membership and webhook outcome rather than assuming a refund and a board revocation are the same operation.

A failed renewal enters the configured grace period. Ask the member to update their payment method through the billing portal, then check subsequent events. The scheduler and webhook delivery must be working for membership state to catch up.

## Reconcile and investigate

Use **Memberships**, **Orders needing attention** and the ledger to trace a purchase from payment to group grant. The ledger records money movement; a manual access extension is not a charge. Repeated webhook delivery should not be treated as a separate purchase.

Ask the operator to investigate credentials, webhook signing, scheduler failures or incorrect public origins. Do not paste keys into support messages. Check the configured public URL before checkout and portal redirects are used.

## Understand access expiry

Purchases normally make the purchased group primary and preserve the previous primary as a secondary membership. Members can choose another visible identity from their groups. Staff retain their staff identity. When the purchased grant expires, the board restores the prior primary group where appropriate.

All plugin grants are bounded. Lifetime memberships depend on the plugin renewing the grant window; removing the plugin eventually ends that access. Checkout redirects do not grant access: verified payment events or reconciliation do. Amount mismatches require administrator investigation.

The board records payment activity and group membership. Operators remain responsible for their pricing, tax, refund and cancellation policies.
