# Make your first API request

Read board data from another application using the REST API. You need the board's public HTTPS URL. Private data requires a token with both the appropriate scope and an owner who can access that data.

## 1. Try a public read

Replace `https://board.example` with your board's origin:

```sh
curl --fail-with-body https://board.example/api/v1/forums
```

A public board returns the forums visible to guests. Private forums remain hidden. If the board is offline or does not allow guest access, the response reflects that policy.

## 2. Create a scoped token

An administrator opens **Admin → API tokens** at `/admin/api-tokens`, re-enters their password when requested, and issues a token with the scopes required by the integration. For the forum-list request, select `forums:read`.

Copy the token when it is shown and store it securely. Set an expiry appropriate to the integration, and revoke unused or exposed tokens. A token narrows its owner's permissions; it never grants access the owner lacks.

## 3. Make an authenticated request

Set `MEITH_TOKEN` in your terminal environment from your secret store, then run:

```sh
curl --fail-with-body   -H "Authorization: Bearer $MEITH_TOKEN"   https://board.example/api/v1/forums
```

Do not place a token in a URL, source code or browser-side application. An authenticated request needs the endpoint's scope even if the endpoint also permits anonymous reads.

## 4. Handle responses

| Response | Check |
|---|---|
| `401` | The token is valid, unexpired and not revoked |
| Missing scope | The token includes the endpoint's required scope |
| `403` or hidden content | Owner permissions, board policy and endpoint rules |
| `429` | Rate-limit response headers; wait before retrying |
| `503` | Board availability and maintenance state |

Use the [REST reference](../reference/api.md) for exact endpoint parameters, response schemas, pagination and error shapes. The board publishes its OpenAPI schema at `/api/v1/openapi.json`.

To receive events instead of polling, follow [Webhooks](webhooks.md).
