# Repository checks

Run `pnpm verify` from the repository root before a pull request. It runs the static gates, lint, dependency checks, typechecks and unit tests. CI additionally runs coverage, PostgreSQL and browser checks.

## Comments and formatting

Run `pnpm comments:check` before finishing. It checks added comments against `HEAD` and also runs in the git pre-commit hook. Explanations belong in `docs/`.

Allowed exceptions are `biome-ignore` suppressions, `@ts-expect-error`, compiler-read type annotations, and documentation prose in:

- `packages/theme-kit/src/{slots,api,view-models}.ts`
- `packages/plugin-kit/src/{hooks,payloads,regions}.ts`

Biome formats JavaScript, TypeScript, JSON and CSS. Use two spaces, single quotes, no semicolons and the configured 100-column width. Format only touched files:

```sh
pnpm exec biome check --write path/to/file.ts
```

A suppression must name the rule and reason on the preceding line. Do not disable a rule globally to bypass one failure.

## Invariants

| Check | Enforces |
|---|---|
| `workspace:check`, `ci:parity:check` | Workspace inventory and agreement with CI gates |
| `root:check` | Root file registry; new files normally belong in directories |
| `release:check` | Lockstep versions and publishable dependency closure |
| `guards`, `guards:probe` | Architecture and security patterns, including detection tests |
| `i18n:check` | Translation keys and catalogue consistency |
| `slots:check`, `slots:probe` | Static slot maps and server/client boundaries |
| `hooks:wired`, `regions:wired` | Extension contract call sites |
| `depcruise` | Package dependency boundaries |

Use the central environment module; direct `process.env` reads are restricted to designated adapters. Authorization uses permissions rather than hardcoded group IDs. Use the request logger instead of `console` in application code.

## Generated files

Run each generator after changing its source, then commit the output. Its `:check` counterpart rejects stale files.

| Generator | Output |
|---|---|
| `theme:docs`, `plugin:docs`, `api:docs`, `perf:docs` | Reference documents |
| `site:docs` | Documentation index |
| `board:gen` | Board plugin registry |
| `marketplace:gen` | Marketplace feed and images |
| `board-installer:gen` | Downloadable installer |
| `extension:gen` | Extension scaffold source |

`docs:index:check`, `docs:links:check` and `docs:redirects:check` verify document registration and links. Deploy template snapshots update during releases with `templates:gen`; `templates:sync:check` checks their remote repositories.

Shared source walkers apply build-directory exclusions and gitignore rules. Keep new checks consistent with those walkers.
