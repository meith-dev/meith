# Repository rules and checks

Follow the repository contract and run the checks that enforce it. This reference explains the invariants behind the commands used in the contribution workflow.

## The commands

| Command | What it does |
|---|---|
| `pnpm dev` | The board, on port 3000. |
| `pnpm site:dev` | meith.dev, on port 3100. |
| `pnpm meith <command>` | The operator CLI against your `.env`. `--help` lists everything. |
| `pnpm test` | The whole unit suite. `pnpm test:watch` while you work. |
| `pnpm typecheck` | The workspace. `typecheck:app` and `typecheck:site` cover the two Next projects. |
| `pnpm lint` | Biome: formatting, lint rules and import order, in one pass. `pnpm format` writes the fixes. |
| `pnpm verify` | **The full static gate.** Run it before opening a pull request — see below. |
| `pnpm test:e2e` | Playwright: the no-JavaScript paths, the staff panels, and the accessibility checks. It builds the board and runs the standalone output against its own databases — nothing to install. `pnpm test:e2e:build` is the build on its own. |
| `pnpm site:shots` | Re-photographs meith.dev's theme and thread screenshots against the fixture board. Deliberate, never on CI — see [the site's screenshots](testing.md#the-sites-screenshots). |

`pnpm verify` is the one that matters. It runs, in order: the workspace
check and the verify/CI parity check, the root and release checks, the
guards and their probes, the message-catalog check, the slot checks, the
generated-document and documentation checks (`theme:docs`, `plugin:docs`,
`board:gen`, `hooks:wired`, `regions:wired`, `api:docs`, `perf:docs`, `docs:index`,
`docs:links`, `site:docs`, `marketplace:gen`, `board-installer:gen`,
`extension:gen`), lint, dependency-cruiser, all three
typecheck projects, and the full test suite.

**`pnpm verify` and CI's `static` job hold to each other.** `pnpm
ci:parity:check` reads the `verify` script and the `static` job out of
`.github/workflows/ci.yml` and fails, naming them, on any gate chained in
one and missing from the other — it is itself a gate in both. The one
exception is written out with its reason in `scripts/ci-parity.mjs`:
`verify` ends on `pnpm test`, while `static` runs the same suite as `pnpm
test:coverage` (a superset) and the `migrations` job runs it again against
real Postgres. `static` also runs steps that need CI's machine rather than
a developer's — packing every publishable tarball against its manifest,
the Redis cache-driver contract, coverage thresholds — so run `pnpm
test:coverage` yourself before a pull request that moves what is covered.
CI's other jobs build the image, drive a browser, and run the migrations
against real Postgres.

Tests that validate future dates must fix the clock and restore it afterward,
so fixtures do not expire as real time advances. The poll closing-time test
fakes only `Date`, leaving asynchronous timers running normally.

## No inline comments

`AGENTS.md` carries the rule: an explanation belongs in the document under
`docs/` that covers the behaviour, changed in the same commit, never in the
code. A comment is invisible to everyone who is not already reading that
function — an operator, a theme author, somebody deciding whether the
software does what they need — and it rots unnoticed, because nothing
checks a comment against the code beside it. A paragraph in `docs/` is read
by all of them and is checked: the links gate holds its anchors, the index
gate holds its registration, and the generated references fail when the
contract they describe moves.

The rule covers `/** */` as much as `//` — a JSDoc block that explains why
is an inline comment with decorative syntax. Four kinds of comment are not,
and are the only exceptions:

- **`biome-ignore` suppressions**, which the linter reads and which must
  carry a reason.
- **`@ts-expect-error`**, which the compiler reads.
- **Type annotations the compiler reads** — `@type`, `@satisfies`,
  `/// <reference>` — mostly in `.mjs` files with no other way to say it.
- **The prose in the six files a generated reference is built from**:
  `packages/theme-kit/src/{slots,api,view-models}.ts`, published by
  `pnpm theme:docs` as [the theme slot reference](../reference/theme-slots.md),
  and `packages/plugin-kit/src/{hooks,payloads,regions}.ts`, published by
  `pnpm plugin:docs` as [the plugin hook reference](../reference/plugin-hooks.md).
  There the comment *is* the published document.

### How it is enforced

Three layers, none of them CI, in the order they catch something. All three
scan with `scripts/comment-scan.mjs`, and compare against `HEAD` rather
than a checked-in allowlist — which is what lets them stay quiet about
comments already in the tree while refusing every new one.

- **`pnpm comments:check`** lists every comment your change adds. Run it
  before you finish.
- **The git `pre-commit` hook** (`.githooks/pre-commit`) runs the same
  check over the staged tree and refuses the commit, whoever or whatever
  wrote the code — `pnpm install` arms it via `core.hooksPath`.
  `git commit --no-verify` is the deliberate way past it.
- **A `PostToolUse` hook** (`.claude/hooks/no-inline-comments.mjs`) rejects
  a Claude Code file write on the spot — the fastest feedback, but it
  covers one tool, which is why it is not the layer the rule rests on.

Nothing in `pnpm verify` or CI checks for comments, deliberately: the rule
is about how the codebase is written, so enforcement sits where the writing
and committing happen, not on the branch.

## Formatting and lint

One tool does both: [Biome](https://biomejs.dev/), configured in
`biome.json` at the root. `pnpm lint` checks formatting, the lint rules and
import order and changes nothing; `pnpm format` writes the fixes.
`pnpm verify` runs the check, so a badly formatted file fails CI the same
way a lint error does.

The formatter is not configurable per file: single quotes, no semicolons,
two-space indent, 100 columns, and the version pinned exactly in
`package.json`. It covers TypeScript, JSX, JSON and CSS — everything except
the generator-written `docs/reference/perf-*.json` files. Markdown, YAML
and SQL have no formatter: `docs/`, the workflows and the migrations are
written by hand and reviewed as prose.

Three rules carry an invariant rather than a preference:

- **`style/noProcessEnv`.** `process.env` is read in
  `packages/core/src/env.ts` and nowhere else, so every variable is
  validated once at boot. `scripts/`, `apps/cli`, `apps/worker`, config
  files and tests are exempt in `biome.json`; `pnpm guards` enforces the
  same rule textually, catching reads in files Biome does not parse.
- **`scripts/no-group-ids.grit`.** A Biome plugin that fails on any read of
  `.groupIds` or `.primaryGroupId`. Group IDs must not leak outside
  `@meith/authorization` — ask the Authorizer
  `can(actor, action, target)` instead of branching on group membership.
  The modules that legitimately carry a group id as data are named by path
  in the plugin itself, because a plugin diagnostic cannot be suppressed on
  one line.
- **`suspicious/noConsole`.** The board logs through `logger()`. Processes
  that *are* their output — the CLI, the worker, the scripts, the e2e
  harness — are exempt.

Everything else is Biome's recommended set. Where a recommended rule is off
in `biome.json` it is because the codebase means the other thing — for
instance, `noDangerouslySetInnerHtml` would fire on every rendered post
body, and that safety argument is settled in `@meith/markdown`, the only
place rendered HTML comes from; `noImgElement` would ask for `next/image`
on a board that has to run without an image optimiser.

When updating Biome, align the schema URL in `biome.json` with its package pin.

A suppression is always a `biome-ignore` with a reason, never a blanket
disable:

```ts
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
```

> [!IMPORTANT]
> **Do not run `pnpm format` in a feature change.** It is safe — the output
> is deterministic — but a whole-tree rewrite buries whatever you were
> actually changing. Format the files you touched, or let your editor do it
> on save.

## The checks that fail on purpose

Several gates in `pnpm verify` exist because something once passed every
other check and broke on a clean install. Each checks a fact about the
repository that nothing else reads:

| Script | What it catches |
|---|---|
| `workspace:check` | A package directory with sources and no `package.json`, or a manifest the lockfile has not seen. Both pass every other gate and fail `pnpm install --frozen-lockfile`, which is CI's first step. Also an `@meith/*` package a board installs that `next.config.mjs` does not compile — invisible in here, where the path aliases resolve to source, and red on every board-build job at once. |
| `ci:parity:check` | A gate chained in `pnpm verify` that runs in no step of `ci.yml`'s `static` job — the shape of defect that let six gates pass for a developer and merge green on a pull request. See [the commands](#the-commands). |
| `root:check` | A new file at the repository root. The root is an interface — every entry is registered with the reason it must live there. |
| `release:check` | A version written anywhere that disagrees with the release version, or a published package depending on a private one. See [Releasing](release.md). |
| `guards` | Textual invariants — the things a grep can prove and a type cannot. `guards:probe` proves each guard still fires. |
| `i18n:check` | A message the code names and the catalog does not carry, a message nothing reads any more, a mirrored setting label that has drifted from the catalog, or a view builder that gained a hardcoded English string. See [Languages](../extensions/internationalisation.md). |
| `slots:check` | The server/client boundary in theme slots, in both directions. |
| `hooks:wired` | A hook fired by name that the registry does not declare — the typo that would otherwise be a call nothing listens to. It also derives the wired/unwired list that `pnpm plugin:docs` publishes. |
| `regions:wired` | A UI region declared in the registry that no call site in `apps/community` renders — the asymmetry that let `admin.dashboard` sit in the reference while rendering nowhere. It also flags a call site that renders a region the registry does not declare. |
| `theme:docs:check`, `plugin:docs:check`, `api:docs:check`, `perf:docs:check` | A generated reference that has drifted from the code it describes. |
| `board:gen:check` | Either board's `meith.plugins.ts` out of step with its `board.plugins.json` — see [the board plugin manifests](board-workspaces.md#the-board-plugin-manifests). |
| `marketplace:gen:check`, `board-installer:gen:check` | A published artifact generated from this repository that has drifted from its source: the marketplace feed meith.dev serves and the one-line board installer. |
| `templates:gen:check` (release only) | A deploy template that differs from the scaffold being released. Templates stay at the last release between version bumps. |
| `extension:gen:check` | `create-meith`'s plugin and theme scaffold templates out of step with `examples/hello-plugin` and `examples/iris-theme`, which they are generated from. |
| `docs:index:check`, `site:docs:check` | A document in `docs/` that the index does not link, or that is neither published on the site nor explicitly repository-only. |
| `docs:links:check` | An internal link or anchor under `docs/` that resolves to nothing — a renamed heading, a moved file, or a section that never existed. It also checks the `doc`/`anchor` pairs `apps/web` links back into `docs/`. See [documentation links](documentation.md). |

One check runs in CI but deliberately **not** in `pnpm verify`:
`templates:sync:check` clones the two deploy-template repositories and
diffs each against its generated `templates/<target>/` tree. It needs the
network, which `verify` does not, so it lives in its own CI job — see
[Releasing](release.md), "Deploy template repositories".

Three of those gates read the working tree rather than the index, so a
directory a tool leaves behind is a directory they scan. `root:check`
tolerates an unregistered root entry only when git ignores that entry
itself; `guards` and `i18n:check` share the walker in
`scripts/repo-files.mjs`, which skips build and tooling output by name —
`node_modules`, `dist`, `coverage`, `.meith`, `.claude` and their kind. A
new tool that writes into the tree belongs in both that list and
`.gitignore`, or every guard fires against copies of the repository.
