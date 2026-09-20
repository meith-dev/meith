# Email

Configure **Admin → Settings → Mail** and test delivery before requiring email activation. Keep web and worker configuration consistent.

| Driver | Requirements |
|---|---|
| `log` | None; logs messages without delivery |
| `http` | Sender, HTTPS endpoint and bearer token |
| `smtp` | Sender and SMTP host; provider transport/authentication settings |

HTTP delivery posts `from`, `to`, `subject`, `text`, `html` and `reply_to`. Other API shapes need an adapter.

## Environment overrides

| Variable | Value |
|---|---|
| `MAIL_DRIVER` | `http` or `smtp` pins the deployment driver; `log`/unset allows saved settings |
| `MAIL_FROM` | Sender address |
| `MAIL_HTTP_ENDPOINT`, `MAIL_HTTP_TOKEN` | Matching provider endpoint and token |
| `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` | Relay address and port |
| `MAIL_SMTP_SECURITY` | `tls`, `starttls` or `none` |
| `MAIL_SMTP_USERNAME`, `MAIL_SMTP_PASSWORD` | Both when authentication is required |
| `MAIL_ALLOW_PRIVATE_HOSTS` | Allow a deliberately private production relay |

Verify the provider's sender/domain requirements. Keep secrets out of git and use the intended provider's token only with its endpoint.

## Test

1. Save settings, or restart affected services after environment changes.
2. Run `meith env:check` using your [CLI invocation](operator-cli.md).
3. Select **Send a test message** and check the inbox, spam folder and provider log.
4. Trigger a queued notification and verify [scheduler](scheduled-tasks.md) delivery.

If direct tests work but notifications wait, inspect task results and the queue.

## Private relays and outbound requests

Production rejects private, loopback, link-local and reserved destinations unless explicitly allowed. DNS is checked and pinned; requests have deadlines and response limits. HTTP requires HTTPS without embedded credentials. Upstream error bodies are not shown by the admin test.

Use `MAIL_ALLOW_PRIVATE_HOSTS=true` only for an intended private relay. Separate overrides control [webhooks](../integrations/webhooks.md), [push](web-push.md) and [OIDC](authentication-reference.md): `WEBHOOK_ALLOW_PRIVATE_HOSTS`, `PUSH_ALLOW_PRIVATE_HOSTS`, `OIDC_ALLOW_PRIVATE_HOSTS`.
