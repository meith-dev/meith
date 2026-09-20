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

Write content changes and outbox events in the same transaction. Delivery is at least once; handlers must be idempotent. Queue claims and task leases coordinate workers. Every denormalized counter needs a bounded, resumable recount.

See [Rendering and data](rendering-and-data.md) for caching, models and event-handler rules, and [Forms and actions](forms-and-actions.md) for mutation handling.
