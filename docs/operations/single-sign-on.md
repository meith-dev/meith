# Configure authentication

Verify HTTPS, the public board URL, mail delivery and an operator recovery route before changing sign-in settings.

| Feature | Setup/reference |
|---|---|
| Authenticator and recovery codes | [Two-factor authentication](authentication-reference.md#two-factor-authentication) |
| Sessions and persistent sign-in | [Sessions](authentication-reference.md#sessions) |
| Security history | [Activity](authentication-reference.md#security-history) |
| GitHub, Google or OIDC | [Federated sign-in](authentication-reference.md#federated-sign-in) |
| Device credentials | [Passkeys](authentication-reference.md#passkeys) |

Set provider callbacks against the permanent public origin. Test sign-in, sign-out, linking and recovery with a separate member before changing staff requirements.

Members use [Account security](../members/account-security.md). If an authenticator and all recovery codes are lost, verify identity before [operator recovery](operator-cli.md#account-recovery); clearing the factor revokes sessions.
