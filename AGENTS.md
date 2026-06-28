# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Shape

Meith is a pnpm monorepo for an Electron desktop AI workbench plus a public Next.js
site.

- `packages/shared`: Zod schemas, inferred domain types, IDs, and `ToolResult`
  helpers. Keep shared state contracts here.
- `packages/protocol`: tool contracts, descriptors, NDJSON messages, naming, and
  public plugin bridge types.
- `packages/desktop`: Electron main/preload/renderer, services, tool registry,
  socket server, browser/terminal hosts, agents, plugins, storage, and packaging.
- `packages/cli`: `meith` terminal client for a running desktop runtime socket.
- `apps/web`: Next.js docs/marketing site.
- `templates`: generated app/plugin project templates.

## Architecture Rules

- The Electron main process is the authority for state and side effects.
- All renderer, CLI, plugin, and agent capabilities should flow through
  `ToolRegistry` in `packages/desktop/src/main/tools/registry.ts`.
- Add user-facing capabilities as typed tools: define a Zod input schema,
  capabilities, timeout when needed, and return/throw structured `ToolResult`
  outcomes.
- Keep tools dependency-injected through `ToolDeps`; do not introduce service
  singletons.
- Shared persistent data belongs in `packages/shared/src/schemas.ts`; exported
  protocol/tool shapes belong in `packages/protocol`.
- Renderer code should call preload bridge APIs/tools and render from pushed app
  state; do not mutate main-process services from React.
- Preserve permission boundaries: socket clients cannot claim privileged caller
  identities; plugins and agents must remain capability/permission gated.

## Commands

Requirements: Node.js `>=20`, pnpm `>=9` (`packageManager` is `pnpm@9.12.0`).

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm check
```

Fast scoped commands:

```bash
pnpm --filter @meith/desktop test
pnpm --filter @meith/desktop typecheck
pnpm --filter @meith/cli test
pnpm --filter @meith/shared test
pnpm --filter @meith/protocol test
pnpm --filter @meith/web typecheck
```

Development:

```bash
pnpm dev                         # desktop app
pnpm dev:renderer                # renderer with mock bridge
pnpm --filter @meith/desktop dev:headless
pnpm dev:web
pnpm cli tools
```

Release and commit checks:

```bash
pnpm commitlint
pnpm release:pr --dry-run --token="$GITHUB_TOKEN"
pnpm release:github --dry-run --token="$GITHUB_TOKEN"
```

## Style

- TypeScript is ESM. Use explicit `.js` extensions in relative TS imports where
  the existing code does.
- Biome owns formatting/linting: 2 spaces, double quotes, semicolons, trailing
  commas, line width 90.
- Prefer Zod validation at boundaries and inferred types from schemas.
- Keep changes scoped; avoid unrelated refactors or lockfile churn.
- Use Conventional Commit messages for PR titles and commits. Release Please uses
  them to calculate versions and changelogs.
- Use `node:` imports for Node built-ins.
- Tests use Vitest and live near the relevant package under `__tests__`.

## Safety

- Do not run destructive git commands or delete user files unless explicitly
  requested.
- Do not push version bumps, release commits, or artifact changes directly to
  `main`. Release Please owns release PRs, version updates, `CHANGELOG.md`, and
  `.release-please-manifest.json`.
- `main` is protected: force pushes and branch deletion are disabled, and changes
  must land through pull requests with the required `Validate Conventional
  Commits` check.
- Do not weaken tool permissions, browser ownership, plugin grants, or ACP/MCP
  approval checks for convenience.
- Packaging changes affect bundled Node/npm/npx, CLI runtime, templates, and
  `node-pty`; verify with package scripts before release work.
