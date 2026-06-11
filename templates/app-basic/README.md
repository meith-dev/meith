# app-basic template

A minimal, **zero-dependency** standalone app used by meith's project generator
(`project_create` / `project_allocate`). Because it has no dependencies, a
generated copy can be started immediately — no install step required.

## Contract

meith's `ProjectService` and `DevServerService` expect the following from an app
template:

- A `package.json` with a **`dev`** script (also `start` as a fallback). meith
  picks the dev script automatically when starting a project's dev server.
- The dev process should print its listening URL to stdout (e.g.
  `Local: http://localhost:5173`) so meith can sniff the port and offer a
  preview tab.
- Respect the `PORT` environment variable when present.

## Scripts

| Script  | What it does                                              |
| ------- | --------------------------------------------------------- |
| `dev`   | Starts `server.mjs`, serving `index.html` (default :5173). |
| `start` | Alias of `dev` for production-style runs.                 |
| `build` | No-op placeholder; replace when you add a real build.     |

## Files

- `server.mjs` — zero-dependency static HTTP server.
- `index.html` — the page served at the root.

Replace these with your real app (Next.js, Vite, etc.) and keep the `dev` script
contract so meith can run and preview it.
