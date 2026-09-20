# Account security

Open `/usercp/security`. Available options depend on board settings.

## Reset a password

Use the reset link on the sign-in page, enter your email and follow the emailed link. Check spam folders. The response does not disclose whether the account exists. Contact an administrator if mail does not arrive.

## Enable two-factor authentication

1. Start authenticator setup on the security page.
2. Add the secret to your authenticator app.
3. Confirm a code and save the recovery codes separately from your device.

Use an unused recovery code if you lose the authenticator. If both are lost, contact the administrators for identity verification and operator recovery. Clearing two-factor authentication revokes sessions; enrol again afterward.

## Add a passkey or provider

Use the security page's registration or linking controls and follow the browser prompts. Keep a working sign-in method while testing a new one. A provider-verified email can link automatically to a matching board account; unverified email cannot.

## Review sessions

Revoke devices you no longer use and inspect unexpected security events. Changing your password signs out other sessions. The admin panel uses a separate session and may request your password again.

Operator setup: [Authentication](../operations/single-sign-on.md).
