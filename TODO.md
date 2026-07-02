# TODO

Prioritized backlog for meith, produced from a full codebase audit (v0.4.0). Items are
in the order they should be tackled: fixes and completions of existing surfaces first,
then platform/quality work, then new features. Each item is written to be
self-contained — an agent picking one up should not need any other context beyond this
file and the repository.

Repo orientation (applies to every item):

- pnpm monorepo. Main process authority lives in `packages/desktop/src/main/`. All
  capabilities are typed tools registered in `packages/desktop/src/main/tools/` and
  dispatched through `ToolRegistry` (`packages/desktop/src/main/tools/registry.ts`).
- Tools are defined with `defineTool({ name, description, capabilities, inputSchema,
  execute })` using Zod input schemas. Every mutating tool MUST declare at least one
  privileged capability (`writes-files`, `controls-browser`, `starts-process`, or
  `destructive`) — a test sentinel in `packages/desktop/src/main/__tests__/toolFactories.test.ts`
  enforces this at build time.
- Shared persisted data shapes live in `packages/shared/src/schemas.ts`. Protocol/tool
  contracts live in `packages/protocol/src/`.
- The renderer (`packages/desktop/src/renderer/src/`) never mutates services directly;
  it calls tools through the preload bridge (`window.meith`, see
  `packages/desktop/src/renderer/src/bridge.ts`) and re-renders from pushed app state.
- The CLI (`packages/cli/src/`) maps commands onto the same tools over an NDJSON socket.
- Tests are Vitest, colocated under `__tests__` in each package. Run scoped:
  `pnpm --filter @meith/desktop test`. Full gate: `pnpm check` (lint + typecheck +
  build + test). Biome formatting: 2 spaces, double quotes, line width 90.
- Use Conventional Commit messages (Release Please derives versions from them).
- Never weaken tool permissions, browser ownership, plugin grants, or ACP/MCP approval
  checks (see AGENTS.md).

---

## 1. Add `git_push`, `git_pull`, and `git_fetch` tools plus sync UI in the Git panel

**Problem.** The git tooling in `packages/desktop/src/main/tools/gitTools.ts` covers
status, diff, stage/unstage, commit, branch list/create/switch, log, blame, worktrees,
and Meith checkpoints — but there is no way to push, pull, or fetch. `computeStatus()`
already calculates `ahead`/`behind` against the upstream, and
`packages/desktop/src/renderer/src/components/GitPanel.tsx` (lines ~397–398) renders
`+ahead / -behind` counts, yet the user has no action to resolve them. A user can
commit inside meith but must leave the app to sync with a remote. Agents equally cannot
push a branch after committing.

**What to do.**

1. In `gitTools.ts`, add three new tools following the existing patterns in that file
   (see `git_commit` / `git_branch` for reference; use the local `git()` helper which
   wraps `execFile` with a 64 MB buffer):
   - `git_fetch` — inputs: `cwd` (reuse `cwdSchema`), optional `remote` (default
     `origin`), optional `prune` boolean. Capability: `read-only` is NOT correct here
     because it touches the network and updates refs; use `writes-files`. Return
     updated ahead/behind counts by re-running the status helpers.
   - `git_pull` — inputs: `cwd`, optional `remote`, optional `rebase` boolean
     (default false → `--ff-only` to avoid surprise merge commits; when `rebase` is
     true use `--rebase`). Capability: `writes-files`. On failure (diverged and not
     ff-able, or conflicts) throw a structured error message that names the failure
     mode so the renderer can show it. Do NOT auto-resolve conflicts.
   - `git_push` — inputs: `cwd`, optional `remote`, optional `branch`, optional
     `setUpstream` boolean (when the current branch has no upstream, push with
     `-u <remote> <branch>`), optional `force` boolean that must be paired with a
     `confirm: z.literal(true)` field (mirror the guardrail pattern used by
     `git_restore` in the same file). Capability: `writes-files` (`destructive` when
     `force` is set — split into behavior inside execute or declare both).
   - Register all three in the returned array at the bottom of `createGitTools()`.
2. Authentication caveat: pushes/pulls over HTTPS may prompt for credentials. Run git
   with `GIT_TERMINAL_PROMPT=0` in the env (the `git()` helper accepts an `env`
   option) so a missing credential fails fast with a clear error instead of hanging.
   Surface that error text to the UI ("Push failed: authentication required. Configure
   a credential helper or SSH key.").
3. In `GitPanel.tsx`, next to the existing ahead/behind indicator, add Sync actions:
   a "Pull" button (visible when `behind > 0`), a "Push" button (visible when
   `ahead > 0` or the branch has no upstream — label it "Publish branch" in that
   case and pass `setUpstream: true`), and a fetch/refresh affordance. Wire them
   through the same `callTool` helper the panel already uses (around line 297), show
   a spinner while running, refresh status on completion, and surface errors with the
   panel's existing error presentation.
4. Add CLI mappings in `packages/cli/src/commands.ts` (`meith git push`, `meith git
   pull`, `meith git fetch`) following the existing mapped-command patterns there.
5. Tests: extend `packages/desktop/src/main/__tests__/gitTools.test.ts`. That file
   already builds throwaway repos in temp dirs; add cases using a local bare repo as
   the remote (`git init --bare` + `git remote add origin <path>`) to test push,
   pull ff, pull non-ff failure, publish-with-upstream, and fetch prune.
6. Update docs: `docs/developer/ADDING_TOOLS.md` does not need changes, but list the
   new tools in `docs/user/TOOLS.md` and mention sync in the Git section of
   `README.md` and `docs/user/USING_MEITH.md`.

**Acceptance.** A user on a branch with upstream commits behind/ahead can pull and
push entirely from the Git panel; an agent can call `git_push` (gated by the normal
permission prompt because it declares `writes-files`); `pnpm --filter @meith/desktop
test` passes with the new cases.

---

## 2. Add `git_stash` support so branch switching with a dirty worktree doesn't dead-end

**Problem.** `git_branch` (in `packages/desktop/src/main/tools/gitTools.ts`) supports
`switch`, and the renderer has a top-bar branch switcher
(`packages/desktop/src/renderer/src/components/TopBarBranchSwitcher.tsx`). But `git
switch` fails when local modifications conflict with the target branch, and there is
no stash facility anywhere in the codebase (verified: zero matches for "stash" in
`packages/desktop/src`). The user hits a raw git error with no recovery path inside
the app.

**What to do.**

1. Add a `git_stash` tool in `gitTools.ts` with an `action` enum:
   `list | push | pop | apply | drop`. Inputs: `cwd` (reuse `cwdSchema`), optional
   `message` (for push), optional `includeUntracked` boolean (default true for push,
   maps to `-u`), optional `stashRef` (for pop/apply/drop, e.g. `stash@{0}`), and for
   `drop` require `confirm: z.literal(true)` (mirror `git_restore`'s guardrail).
   Capabilities: `writes-files` for push/pop/apply, `destructive` for drop — simplest
   compliant choice is declaring `["writes-files", "destructive"]` on the tool.
   For `list`, parse `git stash list --format=%gd|%at|%s` into structured entries.
2. In `TopBarBranchSwitcher.tsx`, when a branch switch fails because of local
   changes (detect via the error message from `git_branch`), present a small dialog:
   "Stash changes and switch", "Cancel". The stash-and-switch path calls
   `git_stash {action:"push"}`, retries the switch, and offers "Pop stash" after
   landing on the new branch. Reuse the dialog primitives in
   `packages/desktop/src/renderer/src/components/ui/dialog.tsx`.
3. Optionally surface stash entries in `GitPanel.tsx` as a collapsed "Stashes"
   section under the staged/unstaged trees, with apply/pop/drop actions.
4. CLI mapping `meith git stash <action>` in `packages/cli/src/commands.ts`.
5. Tests in `gitTools.test.ts`: stash push with untracked files, list parse, pop
   restores content, drop requires confirm.

**Acceptance.** Switching branches with dirty files offers a stash-and-switch flow
instead of a dead-end error; stash list/pop/apply/drop work via tool, panel, and CLI.

---

## 3. Add workspace file-management tools (delete, rename/move, create directory) and a file-tree context menu

**Problem.** `packages/desktop/src/main/tools/fileTools.ts` registers only
`workspace_read_file`, `workspace_write_file`, `workspace_apply_patch`,
`workspace_undo`, `workspace_list_files`, `workspace_search`, and `get_diagnostics`.
There is no way — for the user in the editor file tree, for agents, or for the CLI —
to delete a file, rename/move a file, or create a directory inside a workspace. Agents
building features routinely need renames and deletions; today they would have to shell
out via a terminal tool, bypassing the workspace boundary checks and the file-edit
event stream that `WorkspaceFileService`
(`packages/desktop/src/main/services/WorkspaceFileService.ts`) maintains (the editor
listens to those events to react to external changes — see the handling around
`EditorView.tsx` line ~224).

**What to do.**

1. In `WorkspaceFileService.ts`, add methods `deleteFile(root, path)`,
   `renameFile(root, fromPath, toPath)` (must also handle moves across directories,
   creating intermediate directories on the destination), and
   `createDirectory(root, path)`. Every method must enforce the same trusted-workspace
   boundary checks that `readFile`/`writeFile` use (path resolution + rejection of
   escapes; note the service deliberately skips symlinks in walks — do not follow
   symlinks on delete/rename either). Each mutation should emit the same file-edit
   event stream used by writes so the editor, Git panel refresh counter
   (`GitPanel.tsx` line ~31), and undo bookkeeping stay coherent. For delete, record
   the prior content so `workspace_undo` can restore it (the undo store already
   handles "deleted newly-created file" for undoing creations — see
   `WorkspaceFileService.ts` line ~508; extend it symmetrically).
2. In `fileTools.ts`, register `workspace_delete_file` (capabilities:
   `["writes-files", "destructive"]`, require `confirm: z.literal(true)`),
   `workspace_rename_file` (`["writes-files"]`), and `workspace_create_directory`
   (`["writes-files"]`). Follow the input-schema style of the existing tools
   (`root` + repository-relative `path`).
3. In `packages/desktop/src/renderer/src/components/EditorView.tsx`, add a context
   menu (right-click) on file-tree entries with New File, New Folder, Rename, and
   Delete. New File can reuse `workspace_write_file` with empty content. Rename of a
   file that has unsaved local edits should carry the dirty buffer to the new path or
   prompt to save first. Delete must confirm via dialog. Use the dropdown/dialog
   primitives already in `components/ui/`.
4. CLI mappings (`meith files delete|rename|mkdir`) in `packages/cli/src/commands.ts`.
5. Tests: extend `packages/desktop/src/main/__tests__/workspaceFiles.test.ts` with
   boundary-escape attempts (`../` traversal, absolute paths, symlinked dirs), rename
   across directories, delete + undo restore, and event emission assertions.
6. Docs: add the tools to `docs/user/TOOLS.md`.

**Acceptance.** Users can manage files from the editor tree; agents can rename/delete
inside workspace boundaries with permission gating; traversal attempts are rejected;
undo restores deleted files; all desktop tests pass.

---

## 4. Add a Gemini ACP preset alongside Claude and Codex

**Problem.** `packages/shared/src/schemas.ts` defines
`AcpPresetSchema = z.enum(["custom", "claude", "codex"])` and `ACP_PRESETS` with only
Claude (`@zed-industries/claude-code-acp`-style launch) and Codex
(`@agentclientprotocol/codex-acp`). Google's Gemini CLI speaks ACP natively
(`gemini --experimental-acp`), and meith's whole pitch is provider independence, so
the third major agent should be one preset click away instead of requiring manual
"custom" command configuration.

**What to do.**

1. In `packages/shared/src/schemas.ts`: extend `AcpPresetSchema` to include
   `"gemini"`, and add a `gemini` entry to `ACP_PRESETS` (id, label "Gemini",
   description, command/args). Verify the current correct launch invocation from the
   Gemini CLI docs at implementation time (historically `npx -y
   @google/gemini-cli --experimental-acp`, but confirm — do not trust this from
   memory). Note the desktop app resolves `npx` to its packaged runtime (see the
   comment above `ACP_PRESETS`), so use the same `npx -y` pattern as the Codex preset.
2. Renderer updates — every place that enumerates presets:
   - `packages/desktop/src/renderer/src/components/AgentSelector.tsx`:
     `SELECTABLE_PRESETS` (line ~13) and `PRESET_ICON` (line ~16).
   - `packages/desktop/src/renderer/src/components/AgentIcon.tsx`: add a
     `GeminiMark` SVG component rendered with `currentColor` (match how
     `ClaudeMark`/`CodexMark` are built; source a brand mark similarly).
   - `packages/desktop/src/renderer/src/overlay/icons.ts`: register the icon name.
   - `packages/desktop/src/renderer/src/components/SettingsView.tsx`: add an
     `<option value="gemini">` in the preset select (near lines ~1009–1011).
   - `packages/desktop/src/renderer/src/bridge.ts`: the mock-bridge probe logic
     around line ~1444 special-cases `codex` for model/effort options; check whether
     Gemini needs its own model option list and mirror the pattern.
3. Check `packages/desktop/src/main/agent/adapters/AcpAdapter.ts` for any
   preset-specific behavior (e.g. reasoning-option name mapping mentioned in
   `schemas.ts` line ~827: Codex calls it `thought_level`) and map Gemini's
   equivalents if it exposes model/effort session options.
4. Tests: `packages/shared/src/__tests__/shared.test.ts` if it asserts preset
   contents; add an entry-shape test for the new preset.
5. Docs: mention Gemini in `docs/user/WORKING_WITH_AGENTS.md` and the README's agent
   section.

**Acceptance.** Gemini appears in the composer's agent switcher and Settings preset
select with a brand icon, launches through the bundled `npx`, and the install-status
probe reports whether it is available.

---

## 5. First-run onboarding: stop silently defaulting to the mock agent

**Problem.** `defaultAgentConfig()` in `packages/shared/src/schemas.ts` (line ~899)
returns `adapter: "mock"`. A new user who opens the agent panel chats with
`MockAdapter` (`packages/desktop/src/main/agent/adapters/MockAdapter.ts`) — a fake
agent intended for local testing — with no prominent signal that nothing real is
configured and no guided path to set up Claude/Codex (or Gemini after item 4). This is
the single worst first-run experience in the app: the flagship feature appears broken
or useless.

**What to do.**

1. Keep `mock` as the config default (tests and `dev:renderer` depend on a working
   zero-config adapter) but make the renderer treat "adapter is mock AND user has
   never explicitly saved an agent config" as an onboarding state. The agent config
   is persisted by `AgentConfigStore`
   (`packages/desktop/src/main/services/AgentConfigStore.ts`); add a persisted flag
   or infer "never configured" from the absence of a stored config file vs. defaults.
2. In `packages/desktop/src/renderer/src/components/AgentView.tsx`, when in the
   onboarding state, render a setup card in the empty transcript area instead of the
   normal composer-only view: short explanation, one button per preset (Claude /
   Codex / Gemini / Custom), and after selection run the existing install probe
   (`SettingsView.tsx` has the probe wiring around lines ~932–960 — extract or reuse
   it) to tell the user whether the agent CLI is available, with a hint on what
   installs it (the ACP packages are fetched by the bundled `npx` on first launch).
3. When the user is chatting with the mock adapter after onboarding was dismissed,
   show a persistent, subtle banner in the transcript header: "Mock agent — for
   testing. Configure a real agent in Settings." Link opens the agent section of
   `SettingsView`.
4. Do not change any main-process permission or adapter behavior; this is a
   renderer/UX item plus at most one persisted boolean.

**Acceptance.** A fresh profile (`<userData>` empty) opening the agent tab sees the
guided setup, can pick a preset and see install status, and can still explicitly
choose to keep the mock agent. Existing configured users see no change.

---

## 6. Add renderer test coverage (currently zero)

**Problem.** The main process has a strong Vitest suite
(`packages/desktop/src/main/__tests__/` — 17 files covering agents, browser,
hardening, git tools, permissions, plugins, projects, spaces, storage, workspace
files). The renderer — ~40 components and 8 hooks under
`packages/desktop/src/renderer/src/` including complex stateful surfaces like
`GitPanel.tsx` (1,295 lines), `EditorView.tsx` (864), `AgentView.tsx` (774), and
`SettingsView.tsx` — has zero tests (verified: no `*.test.*` files under
`src/renderer`). Regressions in diff parsing, tree building, and permission cards are
currently only catchable by manual QA.

**What to do.**

1. Add a renderer Vitest project: the repo already uses Vitest 2 workspace-wide. Add
   `@testing-library/react`, `@testing-library/user-event`, and `jsdom` as
   devDependencies of `@meith/desktop` (install with pnpm first). Configure a second
   Vitest environment for renderer files (e.g. a `vitest.config` `projects`/
   `environmentMatchGlobs` entry mapping `src/renderer/**` to `jsdom`), keeping the
   existing node-environment main-process tests untouched.
2. The renderer already has a complete in-memory mock bridge for browser-only preview
   mode (`packages/desktop/src/renderer/src/bridge.ts` — it is large and implements
   tool calls against mock state). Use that as the test double: components receive the
   bridge via the existing wiring, so most components can be rendered against it
   without new mocking infrastructure. Where components use Electron-only APIs
   (native overlay dropdowns in `OverlayDropdown.tsx` fall back outside Electron
   already), rely on the documented non-Electron fallbacks.
3. Start with pure-logic extractions and highest-risk components, in this order:
   - `GitPanel.tsx`: the file-tree builder (~line 796+), the diff-row builder
     (~line 1216+), and status rendering with ahead/behind. Consider extracting the
     pure functions into `src/renderer/src/lib/` so they can be unit-tested without
     rendering, which also shrinks the 1,295-line component.
   - `EditorView.tsx`: dirty-buffer tracking and external-edit reconciliation
     (lines ~224–384 handle deletes/renames of open files).
   - `AgentMessageList.tsx` / `AgentPermissionCard.tsx`: transcript rendering and
     permission accept/deny callbacks.
   - Hooks: `useGitChanges.ts`, `usePaneLayout.ts`, `useResizable.ts`.
4. Wire into CI implicitly: `pnpm --filter @meith/desktop test` must run both
   environments; `pnpm check` already runs tests repo-wide.

**Acceptance.** `pnpm --filter @meith/desktop test` runs renderer tests under jsdom
alongside main tests; at minimum the Git panel tree/diff logic, editor dirty-state
logic, and one agent-surface component have meaningful coverage.

---

## 7. Command palette and a real keyboard-shortcut system

**Problem.** There is no command palette and no centralized keyboard shortcut
registry anywhere in the renderer (verified: no matches for "command palette" or
"keybind" in `packages/desktop/src`). For a keyboard-heavy developer tool this is a
major usability gap: switching spaces, opening tabs, running the dev server, focusing
the agent composer, and invoking Git actions all require mouse trips through
`SpacesRail`, `TabStrip`, `PaneToolbar`, and the top bar.

**What to do.**

1. Build a small command registry in the renderer
   (`src/renderer/src/lib/commands.ts`): a typed list of `{ id, title, keywords,
   shortcut?, run(ctx) }` entries where `run` uses the existing bridge/tool helpers.
   Seed it with: create/switch space (wrap `create_space`/`switch_space` tools), new
   browser tab (`open_browser_tab`), new terminal tab, open file (pipe into the
   editor's file tree / `workspace_list_files`-backed quick-open), run/stop dev
   server (`project_run` / `project_stop_dev_server`), open settings, open git panel,
   new agent session, stop agent, toggle debug panel.
2. Add a palette component (Cmd/Ctrl+K) rendering a filterable list. IMPORTANT
   rendering constraint: native `WebContentsView`s sit above the DOM, and the app
   already has an overlay-window mechanism for floating UI
   (`src/main/overlay/OverlayWindow.ts`, `src/renderer/src/components/OverlayDropdown.tsx`,
   `src/renderer/src/lib/overlay.ts`) plus a renderer-side "collapse the native view"
   escape hatch described in `docs/developer/ARCHITECTURE.md` (Browser Runtime
   section). The palette must either render through the overlay window or trigger the
   view-collapse path while open, otherwise it will be hidden behind the embedded
   browser whenever a browser tab is focused.
3. Global shortcuts: register keydown handling at the App level
   (`src/renderer/src/App.tsx`) with a single dispatch table (no scattered
   `addEventListener`s in components). Handle platform differences (metaKey vs
   ctrlKey). Make sure shortcuts don't fire while focus is inside Monaco, xterm, or
   the agent composer unless intended (check `event.target` / use Monaco's own
   keybinding API for editor-scoped bindings).
4. Show shortcut hints in existing tooltips/menus where commands overlap (e.g.
   `PaneToolbar`, `TopBarRun`).
5. Document defaults in `docs/user/USING_MEITH.md`.

**Acceptance.** Cmd/Ctrl+K opens a palette above all native views; every seeded
command executes through the existing tools; shortcuts work regardless of which pane
is focused without stealing keys from the editor/terminal.

---

## 8. Release pipeline: Developer ID signing + notarization, then Windows/Linux/x64 builds

**Problem.** The release workflow (`.github/workflows/release.yml`) builds only
macOS arm64 artifacts, ad-hoc signed. README explicitly warns macOS will flag first
open. `packages/desktop/package.json` already contains electron-builder config for
`win` (nsis) and `linux` (AppImage) targets, but nothing builds them, and Intel Macs
get nothing. Distribution friction is the biggest barrier to anyone actually using
the released app.

**What to do (two phases, in order).**

Phase A — signing/notarization (macOS):
1. Add Developer ID signing to the electron-builder mac config: certificates come in
   via CI secrets (`CSC_LINK` / `CSC_KEY_PASSWORD` env vars for electron-builder),
   and notarization via `notarize` config with an App Store Connect API key
   (`APPLE_API_KEY_ID` etc.). Guard the workflow so forks/PRs without secrets skip
   signing (electron-builder does this automatically when `CSC_LINK` is absent —
   keep ad-hoc as the fallback and do not fail the build).
2. Mind the packaging verifier: `scripts/verify-packaged-runtime.mjs` runs as
   `afterPack` and validates bundled Node/npm/npx, CLI deps, templates, and the
   `node-pty` spawn-helper. Signing/notarization must happen after verification
   succeeds; hardened runtime + the existing `build/entitlements.mac.plist` need to
   keep the bundled Node runtime executable (JIT/unsigned-executable-memory
   entitlements may be required for node-pty and bundled node — test on a real mac).
3. Update README/`docs/developer/RELEASES.md` sections that currently document the
   ad-hoc limitation.

Phase B — more platforms:
4. Add a `macos-latest` x64 build (or universal binary) and, once someone can test
   them, `windows-latest` (nsis) and `ubuntu-latest` (AppImage) jobs to
   `release.yml`, uploading artifacts + checksums the same way the arm64 job does.
   Watch out for: `scripts/stage-bundled-node.mjs` (the `bundle-runtime` script)
   downloads/stages a platform-specific Node runtime — verify it handles win32/linux
   and x64; `node-pty` is an optionalDependency with a native build per platform;
   the managed-launcher logic (`~/.meith/bin/meith`) and `executablePath.ts`
   (`src/main/process/executablePath.ts`, which has its own test file) contain
   platform-specific paths that need Windows equivalents (`%USERPROFILE%\.meith`,
   `.cmd` shims). Treat Windows support as its own validation effort — do not ship
   untested artifacts; gate them as "experimental" in release notes if needed.

**Acceptance (Phase A).** A tagged release produces a notarized, Developer ID-signed
DMG/ZIP that opens on a clean mac without Gatekeeper warnings; the packaged-runtime
verifier still passes; unsigned fallback still works for contributors without secrets.

---

## 9. In-app update notifications

**Problem.** There is no updater and no update check (verified: no
`electron-updater`/`autoUpdater`/`checkForUpdates` references). Users who download a
DMG stay on that version forever unless they manually watch GitHub releases. Depends
on item 8 Phase A: full auto-update on macOS requires signed builds.

**What to do.**

1. Minimum viable step (can ship before signing): a passive update check. On startup
   (and every ~24h), the main process fetches the latest release metadata from the
   GitHub Releases API for `meith-dev/meith` (unauthenticated, with a short timeout
   and total silence on network failure), compares to `app.getVersion()`, and pushes
   an "update available" flag into app state. Renderer surfaces it as a subtle
   badge in `StatusBar.tsx` and a row in `SettingsView`'s About section with a link
   that opens the release page via `open_browser_tab` (or external browser). Add an
   app-settings opt-out (`get_app_settings`/`set_app_settings` tools already exist;
   the settings schema lives in `packages/shared/src/schemas.ts`).
2. After item 8 lands: integrate `electron-updater` with the GitHub provider for
   true auto-download-and-install on macOS (zip target already produces blockmaps —
   the release workflow uploads `.blockmap` files already, which suggests updater
   support was anticipated). Wire download progress + "restart to update" through
   app state to the renderer.
3. Respect the release process rules in AGENTS.md: no version bumps by hand;
   Release Please owns versions.

**Acceptance.** Running an outdated build shows an unobtrusive update notice within a
day, with a setting to disable checks; no network errors ever interrupt startup.

---

## 10. Docs site search (`apps/web`)

**Problem.** The public docs site (`apps/web`) renders repo markdown from `docs/`
via `apps/web/lib/docs.ts` and a sidebar from `lib/docs-nav.ts`, but has no search
(verified: no search references under `apps/web/components/docs`). The docs corpus is
already ~15 pages and growing; finding "how do plugin grants work" requires clicking
through the sidebar.

**What to do.**

1. Build-time index: since `lib/docs.ts` already loads every doc's content and
   frontmatter at build time, generate a JSON search index (slug, title, section,
   headings, plain-text body chunks) during the build — either a route handler that
   returns the index or a generated static file. Strip markdown to plain text for
   the body.
2. Client search: add a lightweight client-side fuzzy search (e.g. the `flexsearch`
   or `minisearch` package — install with pnpm in `apps/web` first, keeping bundle
   size in mind; lazy-load the index on first open). Add a search button in
   `components/docs/docs-sidebar.tsx` / `docs-shell.tsx` and a Cmd/Ctrl+K modal
   listing matches grouped by page with heading anchors.
3. Follow the existing site styling (Tailwind v4, tokens in the app's globals; the
   site has `components/ui/button.tsx` as the shadcn-style precedent). Keep to the
   site's existing type/color system — no new palettes.
4. Note `vercel.json` skips web deploys for commits not touching `apps/web`, so this
   change deploys normally.

**Acceptance.** Cmd/Ctrl+K on any docs page opens search; queries match titles,
headings, and body text; selecting a result navigates to the page + anchor;
`pnpm --filter @meith/web typecheck` passes.

---

## 11. Plugin update flow and archive integrity verification

**Problem.** Plugins install from a local directory, a packaged archive, or a dev
URL (`install_plugin` in `packages/desktop/src/main/tools/pluginTools.ts`). There is
no update path (re-install is manual), no version comparison, and no integrity
verification of archives beyond structural limits (50 MB / 2,000 files / 10 MB
per-file, traversal/symlink rejection — enforced in `PluginHostService`). A user has
no way to know an "update" archive actually relates to the plugin they approved, and
re-installation semantics around previously approved grants are undocumented.

**What to do.**

1. In `PluginHostService` (`src/main/services/PluginHostService.ts`), define explicit
   re-install semantics: when installing over an existing plugin id, compare the new
   manifest's requested capabilities/APIs to the previously approved grants. If the
   new request is a subset, carry approvals over; if it requests anything new, drop
   to disabled with approvals reset for the new scopes and require re-approval (never
   silently widen — AGENTS.md forbids weakening grant checks). Persist previous
   version metadata so the UI can show "updated from x.y.z".
2. Record a SHA-256 of the installed archive/directory contents in the plugin record
   (schema addition in `packages/shared/src/schemas.ts` if plugin records live
   there — check `PluginHostService`'s persistence shape first). Show it in the
   plugin details UI (`src/renderer/src/components/PluginsPanel.tsx`) so users can
   verify against a published checksum.
3. Add an `update_plugin` tool (capabilities `["destructive"]`) that takes the same
   source inputs as `install_plugin` plus the target `pluginId`, validates the
   manifest ids match, and applies the semantics from step 1. Expose in the plugins
   panel as an "Update from file…" action, and via CLI.
4. Tests: extend `src/main/__tests__/plugins.test.ts` — subset carry-over, widened
   request resets approvals, mismatched manifest id rejection, hash recorded.
5. Docs: update `docs/developer/PLUGIN_API.md` and `docs/user/PLUGINS.md` with the
   update/grant semantics.

**Acceptance.** Updating a plugin never silently expands its permissions; grant
carry-over vs. reset behavior is tested; users can see version and content hash.

---

## 12. Merge-conflict awareness in the Git panel

**Problem.** Nothing in the codebase handles merge conflicts (verified: zero
"conflict" matches in `gitTools.ts` / `GitPanel.tsx`). After item 1 ships pull, and
even today after a user runs `git merge`/`git rebase` in the integrated terminal, the
Git panel will show conflicted files with confusing porcelain codes (`UU`, `AA`, etc.
— `parsePorcelainStatus` maps index/worktree letters but has no unmerged concept) and
the commit button will fail opaquely.

**What to do.**

1. In `gitTools.ts` `computeStatus()` / `parsePorcelainStatus()`, detect unmerged
   entries (porcelain codes where either side is `U`, or `AA`/`DD`) and add a
   `conflicted: GitStatusFile[]` section plus a top-level `merging | rebasing |
   cherry-picking | none` state (detect via existence of `.git/MERGE_HEAD`,
   `.git/rebase-merge`/`.git/rebase-apply`, `.git/CHERRY_PICK_HEAD` under the repo
   root — use `git rev-parse --git-path` to resolve those paths correctly for
   worktrees rather than assuming `.git` is a directory).
2. Add tool actions to resolve: extend `git_stage` semantics (staging a conflicted
   file marks it resolved — already true in git; just make sure the UI re-checks) and
   add an `git_merge_abort` tool (capability `destructive`, `confirm` literal) that
   runs the appropriate `git merge --abort` / `git rebase --abort` /
   `git cherry-pick --abort` for the detected state.
3. In `GitPanel.tsx`, render a distinct "Merge conflicts" section above
   staged/unstaged when conflicts exist, with per-file "Open in editor" (the conflict
   markers are in the file; the Monaco editor in `EditorView` shows them), "Mark
   resolved" (stage), and a panel-level "Abort merge" button. Disable commit while
   conflicts remain, with an explanatory hint; when in a merge state with all
   conflicts resolved, commit should complete the merge (plain `git commit` does).
4. Tests in `gitTools.test.ts`: construct a real conflict in a temp repo (two
   branches editing the same line), assert status classification, abort behavior,
   and resolve-by-stage flow.

**Acceptance.** A conflicted repo shows a dedicated conflicts UI with working
resolve/abort paths instead of opaque failures; status tool output is structured and
tested.

---

## Suggested later (not scheduled, listed for future triage)

- **Commit history UI**: `git_log` and `git_blame` tools exist but nothing in the
  renderer uses them (verified). A history view in the Git panel with per-commit file
  lists and diffs would round out source control.
- **Quick-open file switcher** falls out of item 7's palette (back it with
  `workspace_list_files`).
- **Per-space agent configuration**: `AgentConfigStore` holds one global config;
  power users will want a different agent/model per project.
- **Crash/error reporting opt-in**: `app_export_bug_report` exists for manual
  reports; an opt-in automatic capture of main-process crashes would help
  maintainers.
- **Editor split/diff mode**: the pane system supports splits; a Monaco diff editor
  for "working tree vs HEAD" from the Git panel selected file would beat the current
  custom row-based diff renderer in `GitPanel.tsx` (~line 1216).
