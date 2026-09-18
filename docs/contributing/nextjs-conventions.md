# Application conventions

Use these conventions when changing `apps/community`. Read its `AGENTS.md` and the installed Next.js documentation before relying on framework behavior; this repository's version may differ from one you previously used.

## Keep the layers separate

Route files adapt framework input. Domain packages implement business behavior. Database repositories perform durable queries. View-model builders prepare authorized, serializable data for themes.

Use Server Components by default. Introduce a client component for actual browser interaction and keep the boundary small. Do not move a whole data-rendering surface to the client to add one control.

## Handle writes consistently

Validate form inputs at the boundary, resolve the actor, authorize the operation, call the domain function and refresh affected state. A hidden control is not authorization. Errors returned to the user must be safe and actionable.

Forms must keep their native submission path where the product supports JavaScript-disabled operation. Pending and inline feedback enhance that path. Follow [Forms and Server Actions](forms-and-actions.md) for exact patterns.

## Build shared presentation

Use theme slots and shared UI primitives instead of page-specific presentation contracts. The member, moderator and administrator panels use the common panel framing. Keep navigation, empty states and destructive confirmations consistent.

[Rendering and data](rendering-and-data.md) covers model builders, caching, event-driven counters and logging. [UI conventions](ui-conventions.md) covers controls, accessibility and design-system review.

## Validate the change

Test the business rule at the domain layer and the relevant page/form behavior through the existing application or browser tests. Check the ordinary-member case, denied access, empty state and JavaScript-disabled flow where supported.

Run the repository gates from [Development](development.md). Update the relevant guide and regenerate contracts when a change affects themes, plugins or the API.
