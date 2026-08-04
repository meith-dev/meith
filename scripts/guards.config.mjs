#!/usr/bin/env node
/**
 * The textual invariants themselves, as data.
 *
 * Separated from the runner so `guards.mjs` (which applies them to the tree) and
 * `guards-probe.mjs` (which proves each one still fires) read the *same* rule
 * objects. A probe that re-declared its own copy would drift from the rule it
 * claims to be testing, which is the exact failure it exists to prevent.
 *
 * Each guard carries a `probe`: a fixture that must match, and a counter-example
 * that must not. The counter-example is not optional — a rule broadened until it
 * matches everything would sail through a fires-on-violation check.
 */

/**
 * @type {{
 *   id: string, why: string, files: RegExp, pattern: RegExp, allow?: RegExp,
 *   probe: { violates: string, clean: string },
 * }[]}
 */
export const GUARDS = [
  {
    id: 'no-raw-control-characters',
    why:
      'A literal control or zero-width character in source is invisible in every ' +
      'editor, diff and review, so it reads as one thing and behaves as another. ' +
      'Write the escape instead ("\\u001f"), which says the same thing visibly. ' +
      'This rule exists because a raw U+001F reached a cache-key separator and a ' +
      'test agreed with it, so both were "correct" and neither was readable. ' +
      'U+200B/200E/202E are here for the homoglyph and bidi-override tricks.',
    files: /\.(ts|tsx|mjs|json|md)$/,
    /*
     * Tab (09) and newline (0a) are excluded — they are ordinary whitespace.
     *
     * `no-control-regex` is disabled for exactly this line: that rule exists to
     * catch control characters that reached a regex by accident, and here
     * matching them is the entire purpose. This is the one place in the
     * workspace where naming them is correct.
     */
    // eslint-disable-next-line no-control-regex -- matching control characters is this guard's job
    pattern: /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\u200e\u202e]/,
    probe: {
      violates: 'const sep = "\u001f"',
      clean: 'const sep = "\\u001f"\n\tconst indented = 1',
    },
  },
  {
    id: 'no-runtime-filesystem-scan',
    why:
      'Invariant 6: everything installable is registered in forum.config.ts, and ' +
      'nothing is discovered by scanning a directory at runtime. A serverless ' +
      'bundle contains only what the bundler could see statically, so a readdir ' +
      'over themes/ or plugins/ is empty in production while working perfectly ' +
      'on the developer machine that wrote it. It also makes the installed set ' +
      'unknowable at build time, so a broken plugin is a 500 rather than a ' +
      'compile error. Import it in forum.config.ts instead.',
    files: /\.(ts|tsx)$/,
    pattern: /\b(readdir|readdirSync|globSync|opendir|opendirSync)\s*\(/,
    /*
     * scripts/ and the CLI run on a real filesystem outside the request path,
     * and the migration runner legitimately reads its own directory.
     *
     * `locate-wasm.ts` is the one exemption that needed arguing for. The rule's
     * harm is that *what is installed* becomes unknowable at build time, and
     * that is not what happens here: the four `.wasm` specifiers are constants
     * in `codec.ts`, the packages holding them are declared dependencies, and
     * `serverExternalPackages` is what puts them in the bundle. The `readdir` is
     * of `node_modules/.pnpm`, and it answers *where the installer put a file
     * that is already known to be needed* — a question with no static answer,
     * because the directory name carries a version. It is also the opposite of
     * the failure the rule describes: this path exists **because** the developer
     * machine and the standalone image differ, and it was written against a
     * booted standalone image rather than a dev server.
     */
    /*
     * F82's `create-meith` joins the exemption for the plainest possible reason:
     * it is a CLI that runs *before a board exists*, on a real filesystem, and
     * its `readdir` asks "is this directory empty" — the check that stops it
     * overwriting somebody's `.git`. Nothing about it makes an installed set
     * unknowable at build time, which is the harm the rule exists to prevent.
     */
    allow:
      /^(scripts\/|apps\/cli\/|packages\/create-meith\/|packages\/testkit\/|packages\/db\/src\/migrate\.ts|packages\/drivers\/src\/images\/locate-wasm\.ts)/,
    probe: {
      violates: "const themes = await readdir('./themes')",
      clean: "import themes from './forum.config'",
    },
  },
  {
    id: 'single-env-reader',
    why:
      'process.env may only be read in packages/core/src/env.ts. A stray read is a ' +
      'config value that is never validated and blows up at request time in prod ' +
      'instead of at boot.',
    files: /\.(ts|tsx|mjs)$/,
    /*
     * `NEXT_RUNTIME` is exempt, and it is the only exemption.
     *
     * It is not configuration: Next replaces it with a string literal during
     * each per-runtime compilation, and reading it literally is what lets the
     * Edge build drop a Node-only branch. Routed through `env` in @meith/core it
     * would become a runtime value, the branch would stay reachable, and
     * `apps/forum/instrumentation.ts` would go back to failing to compile for
     * Edge — silently, as a warning. Every real config read stays banned.
     */
    pattern: /process\.env(?!\.NEXT_RUNTIME\b)/,
    /*
     * `eslint.config.mjs` is exempt because it *mentions* process.env as the
     * subject of the no-restricted-properties rule that bans it. This grep
     * cannot tell a real property read from a string literal describing one —
     * the exact limitation that motivates having the AST-level ESLint rule as
     * well. Keep both: this catches files ESLint does not parse, ESLint catches
     * what a regex misreads.
     *
     * Tooling configs and the CLI/worker run outside the app and have no
     * validated `env` to import, so a direct read is correct there.
     */
    allow:
      /^(packages\/core\/src\/env\.ts|scripts\/|apps\/(cli|worker)\/|eslint\.config\.mjs|.*\.config\.(ts|mts|mjs|js|cjs)$|.*\.test\.ts|packages\/testkit\/)/,
    probe: {
      violates: "const url = process.env.DATABASE_URL",
      clean: "import { env } from '@meith/core'\nconst url = env.DATABASE_URL",
    },
    /*
     * A second clean sample for the NEXT_RUNTIME carve-out. One `clean` cannot
     * prove both that the rule still bans reads and that it spares this one, and
     * an exemption nobody probes is an exemption that quietly widens.
     */
    alsoClean: ["if (process.env.NEXT_RUNTIME !== 'nodejs') return"],
  },
  {
    id: 'no-hardcoded-colour',
    why:
      'Components must consume design tokens so a board can be re-themed from the ' +
      'database (F26). A literal hex/rgb/hsl in a component is a colour that no ' +
      'theme override can ever reach.',
    files: /\.(tsx)$/,
    pattern: /(#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()/,
    // globals.css is the token source; the placeholder page and icons are exempt.
    allow: /^(themes\/[^/]+\/src\/tokens\.ts|packages\/ui\/src\/icons\/)/,
    probe: {
      violates: "<div className='x' style={{ color: '#ff0000' }} />",
      clean: "<div className='bg-background text-foreground' />",
    },
  },
  {
    id: 'no-request-state-in-cache',
    why:
      'Reading cookies()/headers() inside a cached function bakes one user\'s data ' +
      'into a shared cache entry — the classic "logged in as someone else" bug. ' +
      'Pass the viewer in as an explicit cache-key argument instead.',
    files: /\.(ts|tsx)$/,
    /*
     * `getActor`/`getUserId` matter as much as the raw request APIs: a cached
     * region that resolves the viewer is the same bug one layer up, and it is
     * the likelier spelling now that context.ts exists. F10's acceptance asks
     * for a rule that fires on a deliberately-broken sample; that sample is the
     * `probe` below, which `pnpm guards:probe` feeds through this rule to prove
     * it is not inert. (This comment previously cited
     * `scripts/fixtures/broken-cache-actor.ts.fixture`, a file that has never
     * existed — a stale pointer in a guard's own documentation is how the next
     * person concludes the probe is missing and writes a second one.)
     */
    pattern:
      /['"]use cache['"][\s\S]{0,2000}?\b(cookies|headers|draftMode|getActor|getUserId)\s*\(/,
    allow: /^packages\/testkit\/|\.fixture$/,
    probe: {
      // The actor spelling, not just the raw request API: this is the likelier
      // mistake now that context.ts exists.
      violates: "'use cache'\nexport async function board() {\n  const actor = await getActor()\n}",
      clean: "'use cache'\nexport async function board(actorId) {\n  return load(actorId)\n}",
    },
  },
  {
    id: 'no-locale-case-fold',
    why:
      'Identifier case-folding must be locale-independent: use foldIdentifier() ' +
      '(packages/accounts/src/case-fold.ts), never toLocaleLowerCase(). With no ' +
      'locale argument the fold depends on the *host*, so under tr_TR "IVAN" ' +
      'becomes "ıvan" — F18\'s duplicate-username-by-case check stops holding, ' +
      'and a username_lower written on one host stops matching on another. A ' +
      'unit test cannot catch this because it passes in every other locale, ' +
      'which is exactly why the rule is enforced textually here.',
    files: /\.(ts|tsx)$/,
    pattern: /toLocale(Lower|Upper)Case\s*\(\s*\)/,
    // The rule's own definition and the test that documents the hazard both
    // have to name the banned call to be about it.
    allow: /^(packages\/accounts\/src\/case-fold\.ts|.*\.test\.ts)/,
    probe: {
      violates: "const lower = username.toLocaleLowerCase()",
      // The explicit-locale form is a real, legitimate use (formatting for a
      // human), so the rule must only reject the no-argument fold.
      clean: "const shown = city.toLocaleLowerCase('tr-TR')",
    },
  },
  {
    id: 'no-module-scope-logger',
    why:
      'Bind the logger where you log, not at module scope. A module-level ' +
      'instance captures the request context once at import time (i.e. empty), ' +
      'so every line it writes is missing its requestId — and it builds pino ' +
      'eagerly, which reads env.LOG_LEVEL and turns merely importing the module ' +
      'into an environment validation. That is what breaks `next build`, whose ' +
      'page-data collection imports server modules with no production secrets.',
    files: /\.(ts|tsx)$/,
    /*
     * Anchored to column 0: module scope is exactly what has no indentation, so
     * this catches the hoisted binding while leaving `const log = logger(...)`
     * inside a function body alone — which is fine and is what container.ts does.
     */
    pattern: /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(await\s+)?logger\(/m,
    probe: {
      violates: "const log = logger({ module: 'x' })",
      // Binding inside a function body is fine and must stay fine.
      clean: "function f() {\n  const log = logger({ module: 'x' })\n}",
    },
  },
  {
    id: 'no-next-in-domain',
    why:
      'Domain packages must not import next/*. Enforced structurally by ' +
      'dependency-cruiser too; this catches it in string form (dynamic import).',
    files: /\.(ts|tsx)$/,
    pattern: /from\s+['"]next(\/|['"])|require\(['"]next(\/|['"])/,
    allow: /^packages\/(core|drivers|ui|theme-kit|testkit|shared)\//,
    probe: {
      violates: "import { redirect } from 'next/navigation'",
      clean: "import { redirect } from './navigation'",
    },
  },
  {
    id: 'no-lazy-require-of-db',
    why:
      "@meith/db must be imported statically, never with require(). Turbopack " +
      'resolves it as an async module — its graph reaches postgres.js — and a ' +
      'synchronous require() of an async module yields the pending namespace ' +
      'rather than the exports, so every destructured binding is undefined and ' +
      'the first call fails with "getDb is not a function". It is intermittent ' +
      'in a build (it depends on whether the chunk was awaited elsewhere first) ' +
      'and reliable at runtime, which is the worst combination: three call ' +
      'sites shipped this way and CI never saw any of them, because CI only ' +
      'ever built DATA_SOURCE=fixture and none of the three run on that path. ' +
      'Importing costs nothing that matters: getDb() creates its client lazily ' +
      'and refuses in fixture mode, so nothing opens a socket at import.',
    files: /^apps\/forum\/.*\.tsx?$/,
    pattern: /require\(\s*['"]@meith\/db['"]\s*\)/,
    probe: {
      violates: "const { getDb } = require('@meith/db') as typeof import('@meith/db')",
      clean: "import { getDb } from '@meith/db'",
    },
  },
  {
    id: 'no-adhoc-content-visibility',
    why:
      'F47: no query may name a visibility state. Every viewer-facing read takes a ' +
      'ContentScope from Authorizer.contentScope and turns it into SQL with ' +
      "visibleIn() in packages/db/src/visibility.ts. A hand-written " +
      "`visibility = 'visible'` is how the twentieth read path ships without one — " +
      'or ships with `<> \'deleted\'`, which lets the moderation queue out to the ' +
      'public while looking like a filter. The exempt files are the counter and ' +
      'write paths, where naming a state is the definition of the work (D41) rather ' +
      'than a decision about a reader.',
    files: /^(packages\/db\/src\/[^/]+\.tsx?|apps\/forum\/(app|src)\/.*\.tsx?)$/,
    /*
     * Query-shaped only, on purpose. A domain rule saying "a deleted post cannot
     * be edited" and a view model deciding whether to offer Restore both compare
     * a state legitimately — they act on a row that has already been filtered.
     * The rule this guard enforces is narrower and checkable: a *query* never
     * names a state.
     */
    pattern:
      /\beq\(\s*\w+\.visibility\s*,|\bvisibility\b\s*(=|<>)\s*['"]|\bvisibility\b\s+in\s*\(/,
    allow:
      /^packages\/db\/src\/(visibility|visibility-counters|content-counters|counter-recount|post-writes|thread-writes|thread-tools|thread-counters|thread-surgery|inline-moderation)\.ts$|\.test\.ts$/,
    probe: {
      violates: ".where(and(eq(posts.threadId, id), eq(posts.visibility, 'visible')))",
      clean: '.where(and(eq(posts.threadId, id), visibleIn(posts.visibility, scope)))',
    },
    /*
     * Two more legal shapes. The write path compares a state against a *value*
     * rather than a literal, and the vocabulary itself has to be able to say the
     * word — an exemption nobody probes is one that quietly widens.
     */
    alsoClean: [
      'update posts set visibility = ${record.to} where id = ${id}',
      "const states = scope.states.includes('deleted')",
    ],
  },
]
