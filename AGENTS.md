# Agent Guide

Meith: community forum software. A pnpm workspace — the board (`apps/community`),
meith.dev (`apps/web`), the worker and the operator CLI in `apps/`; domain
packages in `packages/`; `themes/`, `plugins/`, `examples/`. The deployment
interface lives in `docker/`. Documentation lives in `docs/` and nowhere else —
`docs/README.md` is the index, and the site publishes those same files.

## Rules

- **No inline code comments.** If something needs explaining, the explanation
  belongs in the relevant document under `docs/`, updated in the same change —
  never in the code.
- **Update the docs with every change.** Behavior described in `docs/` changes
  in the same commit that changes the behavior. A new document is registered in
  `apps/web/content/docs.manifest.json` and linked from `docs/README.md`.
  Generated references (`pnpm theme:docs`, `plugin:docs`, `api:docs`,
  `perf:docs`, `site:docs`) are regenerated, never edited.
- **Conventional Commits**, for every commit message and every PR title:
  `type(scope): summary` — `feat`, `fix`, `docs`, `refactor`, `test`, `ci`,
  `chore`; `!` after the type for a breaking change.
- **`pnpm verify` passes before a PR.** It runs every invariant gate. Do not
  run `pnpm format` — format only the files you touched.
- **Biome is the formatter and the linter**, configured in `biome.json`.
  `pnpm lint` checks; `pnpm format` writes. A suppression is a
  `biome-ignore lint/<group>/<rule>: <reason>` on the line above, never a
  blanket disable. `docs/contributing/development.md` explains the rules that carry an
  invariant.
- **Versions never move in a feature change.** Releases move them
  (`docs/contributing/release.md`); `pnpm release:check` will object.
- **The root is a registry.** A new root file goes in a folder, or is added to
  `scripts/root-check.mjs` with the reason it must live there.

## Validation

- `pnpm verify` — everything CI's static job runs.
- `pnpm test:e2e` — the browser suite; self-contained, mostly JavaScript-off.
- `pnpm dev` — the board on :3000 with no database (fixture mode);
  `docs/contributing/development.md` for the Postgres-backed setup.
