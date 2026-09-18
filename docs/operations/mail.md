# Configure and troubleshoot email

Configure outbound email before opening registration or relying on password resets. Use **Admin → Settings → Mail** or the deployment environment. Web and worker must use the same provider configuration.

## Choose a delivery method

| Driver | Required configuration | Result |
|---|---|---|
| `log` | None | Writes messages to logs; delivers nothing |
| `http` | Sender, HTTPS endpoint and bearer token | Posts JSON to a compatible mail API |
| `smtp` | Sender and SMTP host | Sends through an SMTP relay |

The HTTP request uses `from`, `to`, `subject`, `text`, `html` and `reply_to`. A provider with a different API needs an adapter; an arbitrary HTTPS mail endpoint is not sufficient.

For Resend provisioned by the Vercel deployment, see [Vercel configuration](vercel-configuration.md). Check domain verification before testing delivery.

## Configure environment overrides

These values override the corresponding saved settings. Prefer the admin panel when the deployment does not need to own the value.

| Variable | Use |
|---|---|
| `MAIL_DRIVER` | `log`, `http` or `smtp` |
| `MAIL_FROM` | Sender email address |
| `MAIL_HTTP_ENDPOINT` | HTTPS API endpoint |
| `MAIL_HTTP_TOKEN` | API bearer token |
| `MAIL_SMTP_HOST` | SMTP server hostname |
| `MAIL_SMTP_PORT` | Provider's port |
| `MAIL_SMTP_SECURITY` | `tls`, `starttls` or `none`; match the provider's configuration |
| `MAIL_SMTP_USERNAME`, `MAIL_SMTP_PASSWORD` | Supply both when the relay requires authentication |
| `MAIL_ALLOW_PRIVATE_HOSTS` | Allow an intentionally private relay in production |

Set the HTTP endpoint and token together. Do not send a token issued by one provider to another provider's endpoint. Keep credentials out of the repository.

## Test delivery

1. Save the panel settings, or recreate web and worker after changing environment variables.
2. Run `meith env:check` using the [command for your deployment](operator-cli.md).
3. Send a test from the Mail settings screen.
4. Check the recipient's mailbox, spam folder and provider delivery log.
5. Trigger a queued board notification and verify that the [scheduler](scheduled-tasks.md) delivers it too.

A successful connection is not proof of delivery. If a test succeeds but notifications wait, inspect worker or tick results and the queue. If the driver is `log`, no delivery is attempted.

## Private relays and outbound requests

Production mail connections reject private, loopback, link-local and reserved addresses by default. DNS results are checked and pinned for the connection. HTTP endpoints must use HTTPS without embedded credentials. Requests have a total deadline and a bounded response body; upstream error bodies are not exposed through the admin test result.

Use `MAIL_ALLOW_PRIVATE_HOSTS=true` only when the relay deliberately lives on a private network. Development relaxes this guard. SMTP authentication, transport security and the provider's sender policy still apply.

Webhooks, web push and OpenID Connect have separate outbound controls: `WEBHOOK_ALLOW_PRIVATE_HOSTS`, `PUSH_ALLOW_PRIVATE_HOSTS` and `OIDC_ALLOW_PRIVATE_HOSTS`. Changing the mail flag does not change those services. See [Webhooks](../integrations/webhooks.md), [Browser notifications](web-push.md) and [Authentication](single-sign-on.md).
