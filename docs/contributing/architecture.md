# Architecture

## Request flow

1. The app parses and validates input.
2. It resolves the actor and checks authorisation.
3. A domain service applies the operation through repository interfaces.
4. Infrastructure persists the result and transactional events.
5. The app builds a public model, invalidates affected caches and returns or redirects.

Domain packages do not import Next.js, React, database drivers or app modules. `packages/runtime` composes services and concrete adapters. `packages/core` holds shared contracts; the theme and plugin kits expose extension contracts.

## Application boundaries

| Layer | Responsibility |
|---|---|
| Routes and server actions | Request parsing, authentication, response handling |
| Domain services | Business rules and permission-aware operations |
| Repositories/drivers | Persistence and external services |
| View models | Explicit serialisable fields for rendering |
| Themes | Presentation of prepared models and regions |
| Plugins | Declared hooks, routes, pages and services |

Never expose database rows to components or API responses. Never cache actor-dependent results as global data.

## Board configuration

The board consumes its configuration through `@board/*` aliases. `apps/community` is the development board; `boards/stock` supplies the official image. External boards provide the same configuration files beside installed packages. See [Board workspaces](board-workspaces.md).

Fixture mode supplies read-only sample data. PostgreSQL mode supplies durable storage, queue claims and scheduled tasks. Web, worker and CLI must use matching configuration and stores.

## Background work

Write content changes and outbox events in the same transaction. Delivery is at least once; handlers must be idempotent. Queue claims and task leases coordinate workers. Outbox claims hold a five-minute lease and return an opaque `claimToken`; `markRelayed` takes the claimed records so an expired claimant cannot acknowledge a newer lease. Webhook claims advance their due time for at least five minutes (15 seconds per requested batch item for larger batches), and completion/retry methods require the current claim token. Expired claims can be retried, so handlers and webhook receivers must still deduplicate delivery IDs. Every denormalized counter needs a bounded, resumable recount.

Queue idempotency keys identify one retained job across pending, running, completed and dead states. Re-enqueueing the same key returns that job; retry a dead job by ID. Use a distinct key for a distinct occurrence, and keep handlers idempotent across lease recovery.

Forum listing last-post summaries carry the current thread's source `forumId`,
resolved from live post/thread rows rather than cached ancestor text. Custom forum
repositories must supply it. View builders check it against
`listingVisibility().lastPostForumIds`, which excludes private, unreadable and
own-thread-only sources before any rolled-up metadata reaches a theme or plugin.

Replies, edits and post visibility changes lock the canonical thread before writing posts and recheck that it still belongs to the forum where the request was authorized. An edit also checks that the post still belongs to that thread. A concurrent move or merge causes a stale request to fail without saving content, revisions, counters or events; the author must reload and pass the destination permissions. Moves, splits and merges acquire thread locks before touching posts so the stored post forum and counter updates remain in the same serialized scope.

See [Rendering and data](rendering-and-data.md) for caching, models and event-handler rules, and [Forms and actions](forms-and-actions.md) for mutation handling.

Image workers publish outputs only if the pending source still matches their input. Adopting keys and retiring the previous source share a database transaction with orphan-key bookkeeping; deletions and replacements leave durable cleanup work before removing references. A worker losing that comparison discards its generated output, and stale avatar sweeps recheck the current upload time and source.
