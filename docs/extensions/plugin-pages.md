# Plugin routes and pages

Define routes and pages in the plugin manifest. Access checks are enforced by the host; validate plugin-specific inputs and permissions in the handler.

## HTTP routes

| Mount | Use |
|---|---|
| `/api/plugins/<key>/<path>` | Public, member and staff routes |
| `/admin/api/plugins/<key>/<path>` | Admin routes with live admin reauthentication |

Paths match exactly. Disabled plugins and incorrect mounts return `404`. Member routes return `401` when signed out; staff routes require `modcp.access` and return `403` when denied. A per-forum moderator appointment alone does not grant that permission.

Protected POST routes check the request origin. Admin POST routes create a `plugin.route` audit entry. The host strips authorisation and cookie headers before passing the request to a plugin.

| Option | Behaviour |
|---|---|
| `rawBody: true` | Receives exact bytes for signature verification |
| `maxBodyBytes` | Defaults to 64 KiB; at most 1 MiB |
| `rateLimit` | Process-local sliding limit per caller; excess returns `429` with `Retry-After` |

Rate limits multiply across replicas. Use an external/shared control if the operation requires a global limit. Route failures count toward plugin health.

Return the supported JSON, text or redirect envelope. Plugins cannot set arbitrary response headers or cookies. Responses are `no-store`.

Redirect destinations must be allowlisted HTTPS URLs; loopback HTTP is allowed for development. The board's `form-action 'self'` policy blocks cross-origin redirects after form submissions. Use a same-origin handoff page with a validated destination and fallback link; the Dues plugin provides an example.

## Admin pages

Declare a short title and stable page path. The host adds the page to the plugin's admin navigation and supplies runtime access and query parameters. Admin authentication remains required for each request and action.

## Board pages

Page handlers receive the viewer and parsed location. Member-only pages redirect signed-out readers to login. Staff pages appear under the moderator panel and require `modcp.access`.

Use [shared controls](theme-design.md) for forms and navigation, and [plugin navigation entries](plugin-presentation.md#navigation) for links to declared pages.
