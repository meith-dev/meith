# REST API quickstart

Use your board's HTTPS origin. Public reads use guest permissions; authenticated reads require both a token scope and an owner with access.

## Read public forums

```sh
curl --fail-with-body https://board.example/api/v1/forums
```

Only guest-visible forums are returned. Board access and maintenance policies still apply.

## Create a token

In **Admin → API tokens** (`/admin/api-tokens`), issue a token with `forums:read`. Reauthenticate when requested. Copy the token when shown, set an appropriate expiry and store it in a secret store.

Set `MEITH_TOKEN` in your environment, then run:

```sh
curl --fail-with-body \
  -H "Authorization: Bearer $MEITH_TOKEN" \
  https://board.example/api/v1/forums
```

Tokens narrow their owner's permissions. Authenticated calls require the endpoint's scope even when anonymous reads are allowed. Keep tokens out of URLs, source code and browser-side applications; revoke unused or exposed tokens.

## Handle responses

| Response | Action |
|---|---|
| `401` | Check token validity, expiry and revocation |
| Missing scope | Issue a token with the required scope |
| `403` or hidden content | Check owner permissions and board policy |
| `429` | Follow rate-limit headers before retrying |
| `503` | Check maintenance and availability |

See the [API reference](../reference/api.md) for schemas and pagination. The board serves OpenAPI at `/api/v1/openapi.json`. Use [webhooks](webhooks.md) to receive events.
