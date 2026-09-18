# Architecture

Meith separates business rules, infrastructure and presentation. Use this map to choose where a contribution belongs; [Development](development.md) covers setup and validation.

## Applications and processes

| Application | Responsibility |
|---|---|
| `apps/community` | Forum pages, Server Actions, route handlers and request composition |
| `apps/worker` | Scheduled and queued work |
| `apps/cli` | Operator migrations, backups, imports and maintenance |
| `apps/web` | Marketing and documentation site |

Applications compose domain operations with concrete repositories and drivers. Packages do not import application internals.

## Package boundaries

| Layer | Responsibility |
|---|---|
| `packages/core` | Shared values, errors, permissions, environment validation and infrastructure ports |
| Domain packages | Business behavior expressed through explicit inputs and interfaces |
| `packages/db` | PostgreSQL schemas, queries and repository implementations |
| `packages/drivers` | Queue, cache, file, mail and image implementations |
| `packages/runtime` | Composition shared by web, worker and CLI |
| `packages/ui` | Reusable presentation components |
| Theme/plugin kits | Published extension contracts |

Domain packages do not import Next.js, React, database clients, drivers or application internals. Dependency Cruiser and repository guards enforce these boundaries.

## Follow a request

1. A page, action or route receives framework input.
2. Application code validates it and resolves the member and permission context.
3. A domain operation receives explicit values and repository interfaces.
4. An infrastructure adapter performs the durable work.
5. The application refreshes the relevant cached state and returns a safe result.

Read paths resolve authorized data before constructing a theme view model. Themes render those models; they do not fetch data or decide permissions. API routes use the same authorization concepts as pages.

## Understand data and background work

Fixture mode uses deterministic in-memory sample data for browsing and tests. PostgreSQL provides durable board state. Fixture mode does not simulate successful writes and cannot run the durable worker.

The worker and HTTP tick use the shared runtime task bundle. Database claims coordinate concurrent work. Tasks process bounded batches and resume from persisted state where needed; a healthy web process alone does not prove the scheduler is progressing.

For operations, use [Scheduled tasks](../operations/scheduled-tasks.md), [Database operations](../operations/database-operations.md) and [Scaling](../operations/scaling.md).

## Boards and extensions

A board owns its static theme/plugin configuration and exact package pins. The stock image is built from `boards/stock`, using the external-board workspace shape. `apps/community` remains the in-repository development target.

The `@board/config` and `@board/plugins` aliases let the web app and CLI read the selected board without hard-coded imports into another application's directory. Read [Board workspaces](board-workspaces.md) before changing packaging, materialization or these aliases.

Plugins use the host APIs and their own database namespace. Themes implement slots and inherit presentation. [Build extensions](../extensions/extensions.md) links to their contracts.

## Validate a boundary change

Extend an explicit port and implement it in infrastructure when business behavior needs a new capability. Keep framework wiring in application/runtime composition and document the invariant beside its contributor guide.

Run `pnpm depcruise`, relevant tests and the full `pnpm verify` gate before a PR. Regenerate API, theme and plugin references when changing their public source contracts.
