# Authentication settings

Configure sign-in methods for a board you operate. Members managing their own password, two-factor authentication or devices should use [Account security](../members/account-security.md).

## Before changing sign-in

Confirm that HTTPS, the public board URL and outgoing email work. Keep a tested administrator recovery route available before enabling additional restrictions. Do not treat a provider's email address as proof of account ownership without the supported linking flow.

## Choose a feature

| Feature | Configuration and behavior |
|---|---|
| Authenticator codes and recovery codes | [Two-factor authentication](authentication-reference.md#a-second-factor) |
| Persistent sign-in and device sessions | [Sessions](authentication-reference.md#where-a-member-is-signed-in) |
| Account security history | [Security activity](authentication-reference.md#what-has-happened-to-an-account) |
| External identity providers | [Federated sign-in](authentication-reference.md#federated-sign-in) |
| Device passkeys | [Passkeys](authentication-reference.md#passkeys) |

Use the supported settings in the admin panel and the environment required by your provider. Check callback URLs against the board's public origin, then test with a separate member account before changing administrator access.

## Verify recovery

Check password-reset delivery, a normal sign-in, sign-out and a fresh sign-in using the configured method. For two-factor authentication, verify that recovery codes are saved separately from the authenticator device.

If a member loses both the authenticator and recovery codes, an operator can use the [account recovery command](operator-cli.md#account-recovery) after establishing the member's identity. Clearing a second factor revokes the member's sessions; it is not a routine replacement for using recovery codes.

The [authentication reference](authentication-reference.md) explains linking, protocol boundaries and common failures.
