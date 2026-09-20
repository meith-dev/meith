# Next.js conventions

Read the installed Next.js documentation referenced by the app's `AGENTS.md` before changing framework code.

Use Server Components for pages and layouts. Add client components only for the interaction that requires them. Keep native links and forms usable without JavaScript.

| Work | Rules |
|---|---|
| Mutations | [Forms and actions](forms-and-actions.md) |
| Reads, caching and view models | [Rendering and data](rendering-and-data.md) |
| Controls and feedback | [UI conventions](ui-conventions.md) |
| Validation | [Testing](testing.md), [Repository checks](repository-checks.md) |

Test ordinary, empty and denied states. Test the native path before adding an enhancement.
