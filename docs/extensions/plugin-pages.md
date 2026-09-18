# Plugin routes and pages

Expose plugin HTTP routes and member, administrator or moderator pages. Match each route to its audience and validate inputs at the boundary.

## HTTP routes

A plugin declares endpoints the way it declares everything else — as data —
and the host mounts them under `/api/plugins/<key>/<path>`:

```ts
routes: [
  { path: 'hook/stripe', method: 'POST', access: 'anonymous', rawBody: true, handler },
  { path: 'checkout',    method: 'POST', access: 'member',    handler },
],
allowedRedirectHosts: ['checkout.stripe.com'],
```

A handler receives a `PluginRequest` — viewer, method, path, query, headers,
a parsed or raw body, the board's URL — plus the same runtime context as
every other surface, and answers with an envelope:
`{ kind: 'json' | 'text' | 'redirect', … }`. A route declaring
`rawBody: true` gets the exact request bytes, which is what webhook
signature verification needs.

The host owns every decision a plugin must not:

- **`access` is enforced before the handler runs.** `'member'` answers 401
  to a guest; `'staff'` answers 403 to anyone without the `modcp.access`
  permission — the same board-staff check a staff page makes, so a staff
  page's form can post to its own route; `'admin'` answers 403 to anyone
  without a live control-panel session — the same check the panel's own
  screens make, including its re-authentication window. A `'staff'` route
  mounts on the board, next to `'member'` routes, because that is where a
  staff page's request comes from. The handler never sees a refused request.
- **Admin routes mount under the panel, not the board.** An
  `access: 'admin'` route answers at `/admin/api/plugins/<key>/<path>` and
  is a 404 on the board mount, and the reverse. The panel's session token
  is a cookie scoped to the `/admin` path precisely so it never rides an
  ordinary board request, so an admin endpoint must live where that cookie
  travels. An admin page's form posts there; `pluginAdminRoutePath` builds
  the URL.
- **A member or admin POST must come from the board's own origin.** The
  `Origin` header is checked against the request's host; a cross-site form
  post is a 403.
- **An admin POST lands in the panel's action log** as `plugin.route`, with
  the plugin key and path, next to every other administrative act. Admin
  GETs are reads and stay out of the log.
- **`cookie` and `authorization` never reach the handler**, and the
  response envelope has no header or cookie field at all. That single
  restriction is what stops a plugin route from becoming a second
  authentication system.
- **Redirects are allow-listed.** A relative path always passes; an
  absolute URL must be https — plain http only to a loopback address, for a
  test double — and its host must be declared in `allowedRedirectHosts`, so
  a compromised setting cannot turn a board route into an open redirect.
- **Bodies are capped** — 64 KiB by default, `maxBodyBytes` up to 1 MiB.
- **Every response is `cache-control: no-store`.**
- **A disabled plugin's routes 404** — operator-disabled and auto-disabled
  alike. An off plugin has no endpoints, not broken ones.
- **Failures count.** A route runs under the same accounting as a hook:
  timed, logged against the plugin, and auto-disabling after repeated
  failures.
- **A route can declare its own rate limit** —
  `rateLimit: { limit, windowSeconds }` — and the host enforces it before
  the handler runs: a spent window answers 429 with a `retry-after` header.
  The count is per caller (signed-in user id, else the client address) and
  per instance, in process memory — abuse-pressure relief, not accounting.
  A board that scales out multiplies the budget by its instance count;
  declare limits with that in mind. Counting is sliding-window, weighing
  the previous window's usage against how much of the current window has
  elapsed, so a caller who spends a window's full budget cannot double it
  by timing a second burst just after the window rolls over.

One honest limit: route paths are exact matches — put ids in the query
string, not the path.

> [!NOTE]
> **A form POST cannot 303 off the board.** The board's CSP pins
> `form-action` to `'self'`, and browsers hold a form submission's whole
> redirect chain to it — so a member-form route answering a redirect to a
> payment provider is blocked by the browser, not by the host. The pattern
> that works, without weakening the policy: 303 to one of your own pages
> with the target in the query, validate it there against your
> `allowedRedirectHosts`, and render a meta refresh plus a fallback link.
> An ordinary navigation is outside `form-action`'s remit. `plugins/dues`
> ships this as its `go` page.

## Admin pages

`adminPages` are the operator-facing half, mounted at
`/admin/plugins/<key>/<path>`. `render` gets a `PluginAdminPageContext` —
the runtime context plus the panel URL's query string — and returns markup,
which the panel frames so that the cards a page brings still read as
raised.

A plugin that declares any pages becomes a *place* in the panel rather than
a row in a list:

- **A tab bar across the top of every one of its screens**, the plugin's
  own settings screen included (labelled `Settings`, the first tab). A
  plugin with one page gets no tab bar, because a single tab is not a
  choice.
- **Its own section in the panel's rail**, headed with the plugin's name
  and listing its pages, whenever the operator is anywhere under
  `/admin/plugins/<key>`.
- **Links on its row of `/admin/plugins`**, so the screens are reachable
  before anyone opens the plugin at all.

Declaring a page is the whole of it — there is nothing to register with the
nav and no ordering to configure. Pages appear in the order the plugin
declares them, and a page on a disabled plugin appears nowhere.

**`title` is a label, so keep it short.** It becomes the tab, the rail
entry and the page heading, and the plugin's name is already above all
three — `'Plans'`, not `'Dues — plans'`.

## Board pages

`pages` are the member-facing half, mounted at `/plugins/<key>/<path>` and
rendered inside the board's shell with the page's declared title, so a
plugin's screen looks like part of the board:

```ts
pages: [
  { path: '',       title: 'Membership', access: 'member',    render },
  { path: 'return', title: 'Confirming', access: 'anonymous', render },
]
```

`render` gets a `PluginPageContext` — the runtime context plus the viewer,
the path, the query and the board URL — and returns markup. The same
containment as admin pages applies: a throw is logged and the page renders a
plain failure notice in the shell, not a 500. `access: 'member'` sends a
guest to the sign-in page and back afterwards. A page on a disabled plugin
is a 404, exactly like a route.

As with contributions: build your markup in the render function rather than
returning a component that does work — the host's try/catch is around the
call, and a component that throws later inside React's own render cannot be
contained from the server.

## Staff pages

A board page marked `access: 'staff'` is a moderation-helper screen: the
place for a plugin's triage list or its report tooling, above an ordinary
member but below the operator. It is still a `pages` entry — the same
`render`, the same `PluginPageContext` — with one difference in who may see
it and where it appears.

```ts
pages: [
  { path: 'triage', title: 'Triage', access: 'staff', render },
]
```

- **The host enforces it before the render runs.** A staff page answers only
  to a viewer who holds `modcp.access` — the same board-staff resolution the
  moderation panel's own screens make (`resolveModCpAccess`), never a check
  the plugin makes. Anyone else is a 404; the render is never called. This is
  the page half of the rule that [a plugin never decides
  authorization](plugins.md): a staff page changes *who* may
  look at a screen, not *what* the plugin may do once they are looking.
- **It mounts inside the moderation panel**, at
  `/modcp/plugins/<key>/<path>`, framed by the modcp `PanelShell` and rail —
  not on the board, where a `'staff'` page is a 404. A plugin with staff
  pages becomes its own section in that rail, headed by the plugin's name,
  exactly as `adminPages` do in the admin rail; declaring the pages is the
  whole of it.
- **The context does not widen.** A staff page gets the same
  `PluginPageContext` as any other — locale, translator, and a `viewer` that
  is still a `ViewerRef`, never an `Actor`. In particular `context.data` and
  `context.users` are unchanged: standing in the moderation panel lets more
  people *reach* the screen, it does not let the plugin *read* more. What a
  plugin may query is decided where it always was, not by where its page is
  mounted.

> [!NOTE]
> **`modcp.access` is board-wide staff, and that is the whole of the gate in
> this version.** A per-forum moderator who does not also hold `modcp.access`
> will not see plugin staff pages, even in a forum they moderate. This is the
> deliberate v1 boundary — the panel itself draws the same line — rather than
> a finer per-forum gate a plugin could ask for.
