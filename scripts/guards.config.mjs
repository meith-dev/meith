#!/usr/bin/env node
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
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is this guard's job
    pattern: /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\u200e\u202e]/,
    probe: {
      violates: 'const sep = "\u001f"',
      clean: 'const sep = "\\u001f"\n\tconst indented = 1',
    },
  },
  {
    id: 'no-runtime-filesystem-scan',
    why:
      'Invariant 6: everything installable is registered in community.config.ts, and ' +
      'nothing is discovered by scanning a directory at runtime. A serverless ' +
      'bundle contains only what the bundler could see statically, so a readdir ' +
      'over themes/ or plugins/ is empty in production while working perfectly ' +
      'on the developer machine that wrote it. It also makes the installed set ' +
      'unknowable at build time, so a broken plugin is a 500 rather than a ' +
      'compile error. Import it in community.config.ts instead.',
    files: /\.(ts|tsx)$/,
    pattern: /\b(readdir|readdirSync|globSync|opendir|opendirSync)\s*\(/,
    allow:
      /^(scripts\/|apps\/cli\/|packages\/create-meith\/|packages\/testkit\/|packages\/db\/src\/migrate\.ts|packages\/drivers\/src\/images\/locate-wasm\.ts)/,
    probe: {
      violates: "const themes = await readdir('./themes')",
      clean: "import themes from './community.config'",
    },
  },
  {
    id: 'single-env-reader',
    why:
      'process.env may only be read in packages/core/src/env.ts. A stray read is a ' +
      'config value that is never validated and blows up at request time in prod ' +
      'instead of at boot. apps/community/bin/ is allowed too: forum-web.mjs, like the ' +
      'bins under apps/cli/, runs as an operator-invoked script outside the ' +
      'request/response cycle, not application code — see FORUM_WORKSPACE_ROOT / ' +
      'FORUM_ALIASES_FROM there. e2e/ is allowed for the same reason as ' +
      'packages/testkit/: the harness builds and spawns the board under test, so it ' +
      'passes an environment through to a child process rather than reading config.',
    files: /\.(ts|tsx|mjs)$/,
    pattern: /process\.env(?!\.NEXT_RUNTIME\b)/,
    allow:
      /^(packages\/core\/src\/env\.ts|scripts\/|apps\/(cli|worker)\/|apps\/community\/bin\/|e2e\/|.*\.config\.(ts|mts|mjs|js|cjs)$|.*\.test\.ts|packages\/testkit\/)/,
    probe: {
      violates: 'const url = process.env.DATABASE_URL',
      clean: "import { env } from '@meith/core'\nconst url = env.DATABASE_URL",
    },
    alsoClean: ["if (process.env.NEXT_RUNTIME !== 'nodejs') return"],
  },
  {
    id: 'no-hardcoded-colour',
    why:
      'Components must consume design tokens so a board can be re-themed from the ' +
      'database. A literal hex/rgb/hsl in a component is a colour that no ' +
      'theme override can ever reach.',
    files: /\.(tsx)$/,
    pattern: /(#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()/,
    allow: /^themes\/[^/]+\/src\/tokens\.ts/,
    probe: {
      violates: "<div className='x' style={{ color: '#ff0000' }} />",
      clean: "<div className='bg-background text-foreground' />",
    },
  },
  {
    id: 'no-request-state-in-cache',
    why:
      "Reading cookies()/headers() inside a cached function bakes one user's data " +
      'into a shared cache entry — the classic "logged in as someone else" bug. ' +
      'Pass the viewer in as an explicit cache-key argument instead.',
    files: /\.(ts|tsx)$/,
    pattern:
      /['"]use cache['"][\s\S]{0,2000}?\b(cookies|headers|draftMode|getActor|getUserId)\s*\(/,
    allow: /^packages\/testkit\/|\.fixture$/,
    probe: {
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
      'becomes "ıvan" — the duplicate-username-by-case check stops holding, ' +
      'and a username_lower written on one host stops matching on another. A ' +
      'unit test cannot catch this because it passes in every other locale, ' +
      'which is exactly why the rule is enforced textually here.',
    files: /\.(ts|tsx)$/,
    pattern: /toLocale(Lower|Upper)Case\s*\(\s*\)/,
    allow: /^(packages\/accounts\/src\/case-fold\.ts|.*\.test\.ts)/,
    probe: {
      violates: 'const lower = username.toLocaleLowerCase()',
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
    pattern: /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(await\s+)?logger\(/m,
    probe: {
      violates: "const log = logger({ module: 'x' })",
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
      '@meith/db must be imported statically, never with require(). Turbopack ' +
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
    files: /^apps\/community\/.*\.tsx?$/,
    pattern: /require\(\s*['"]@meith\/db['"]\s*\)/,
    probe: {
      violates: "const { getDb } = require('@meith/db') as typeof import('@meith/db')",
      clean: "import { getDb } from '@meith/db'",
    },
  },
  {
    id: 'no-adhoc-content-visibility',
    why:
      'No query may name a visibility state. Every viewer-facing read takes a ' +
      'ContentScope from Authorizer.contentScope and turns it into SQL with ' +
      'visibleIn() in packages/db/src/visibility.ts. A hand-written ' +
      "`visibility = 'visible'` is how the twentieth read path ships without one — " +
      "or ships with `<> 'deleted'`, which lets the moderation queue out to the " +
      'public while looking like a filter. The exempt files are the counter and ' +
      'write paths, where naming a state is the definition of the work rather ' +
      'than a decision about a reader.',
    files: /^(packages\/db\/src\/[^/]+\.tsx?|apps\/community\/(app|src)\/.*\.tsx?)$/,
    pattern: /\beq\(\s*\w+\.visibility\s*,|\bvisibility\b\s*(=|<>)\s*['"]|\bvisibility\b\s+in\s*\(/,
    allow:
      /^packages\/db\/src\/(visibility|visibility-counters|content-counters|counter-recount|post-writes|thread-writes|thread-tools|thread-counters|thread-surgery|inline-moderation)\.ts$|\.test\.ts$/,
    probe: {
      violates: ".where(and(eq(posts.threadId, id), eq(posts.visibility, 'visible')))",
      clean: '.where(and(eq(posts.threadId, id), visibleIn(posts.visibility, scope)))',
    },
    alsoClean: [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a probe fixture — the placeholder is what the guard must not match
      'update posts set visibility = ${record.to} where id = ${id}',
      "const states = scope.states.includes('deleted')",
    ],
  },
  {
    id: 'no-db-in-app-routes',
    why:
      'A file under app/ reads through the container in src/server/container.ts, ' +
      'never @meith/db directly. The container is what makes a route testable ' +
      'without Postgres and what lets DATA_SOURCE=fixture serve a whole board ' +
      'from memory: a route that reaches past it works on a developer machine ' +
      'with a database and 500s on the demo. Two admin pages predate the rule ' +
      'and are exempted by name below — they are the debt, not the precedent, ' +
      'so the exemption list only ever gets shorter.',
    files: /^apps\/community\/app\/.*\.tsx?$/,
    pattern: /from\s+['"]@meith\/db['"]|require\(\s*['"]@meith\/db['"]\s*\)/,
    allow: /^apps\/community\/app\/admin\/(users\/\[id\]\/merge|forums\/\[id\])\/page\.tsx$/,
    probe: {
      violates: "import { getDb } from '@meith/db'",
      clean: "import { getContainer } from '@/server/container'",
    },
  },
  {
    id: 'no-literal-cache-tag',
    why:
      'Every cache tag is spelled once, in CacheTags (packages/core/src/cache.ts), ' +
      'and never written as a literal at a call site. A writer invalidating ' +
      '"forum-tree" while a reader cached under "forumTree" leaves stale data ' +
      'that no test catches: both sides pass in isolation and only disagree in ' +
      'production, where the symptom is a board that will not update. Going ' +
      'through the table makes the mismatch a type error instead.',
    files: /\.(ts|tsx)$/,
    pattern: /(?:invalidateTags\s*\(\s*\[\s*|revalidateTag\s*\(\s*)['"]/,
    allow: /^packages\/testkit\/|\.test\.tsx?$/,
    probe: {
      violates: "await cache.invalidateTags(['forum-tree'])",
      clean: 'await cache.invalidateTags([CacheTags.forumTree()])',
    },
    alsoClean: [
      'revalidateTag(CacheTags.thread(threadId))',
      'await drivers().cache.invalidateTags([tag])',
      'await drivers().cache.invalidateTags(GLOBAL_TAGS)',
    ],
  },
  {
    id: 'no-slot-rendering-slot',
    why:
      'A slot never resolves another slot. The page resolves both and passes the ' +
      'rendered one in through regions. If ThreadView reached for PostBit ' +
      'itself, a child theme overriding PostBit would be ignored inside the ' +
      "parent's ThreadView — the override silently applies everywhere except " +
      'the one page it was written for. One place resolves slots so that an ' +
      'override means the same thing wherever it lands.',
    files: /^(themes|examples)\/[^/]+\/src\/slots\/.*\.tsx?$/,
    pattern: /\b(requireSlot|hasSlot)\s*\(/,
    probe: {
      violates: "const PostBit = requireSlot(theme, 'PostBit')",
      clean: 'export function ThreadView({ regions }) {\n  return regions.posts\n}',
    },
  },
  {
    id: 'no-third-party-browser-code',
    why:
      'What the board imports is an allowlist: relative paths, @/, @meith/*, ' +
      '@board/* (the community.config.ts / community.plugins.ts seam), ' +
      'node:*, next, react, react-dom and server-only. Everything else is a ' +
      "third party in a member's browser, and that is not a dependency " +
      "decision — it is a decision about somebody else's members, so it is " +
      'made here rather than in a package.json line. This rule exists because ' +
      'an analytics beacon was rendered into the root layout behind a ' +
      'NODE_ENV check: invisible on every developer machine, loaded on every ' +
      'self-hosted board in production, with no setting to turn it off. ' +
      'dependency-cruiser will not catch the next one — it has no allowlist, ' +
      'and the package is a declared dependency either way, so the import ' +
      'reads as legitimate to every other mechanical check here. Tests are ' +
      'exempt because a test ships to nobody.',
    files: /^apps\/community\/(app|src)\/.*\.tsx?$/,
    pattern:
      /(?:\bfrom\s+|\bimport\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](?!\.|@\/|@meith\/|@board\/|node:|(?:next|react|react-dom|server-only)(?:\/|['"]))[^'"\s]+['"]/,
    allow: /\.test\.tsx?$/,
    probe: {
      violates: 'import { Analytics } from "@vercel/analytics/next"',
      clean: 'import { getSettings } from "@/server/settings"',
    },
    alsoClean: [
      'import forumConfig from "@board/config"',
      'import { Inter } from "next/font/google"',
      'import { renderToString } from "react-dom/server"',
      'import { randomUUID } from "node:crypto"',
      'import { env } from "@meith/core"',
      "import 'server-only'",
      'import "@/styles/globals.css"',
      'import { threadPath } from "../thread-path"',
      'tells "we asked for this" from "we made it up a millisecond ago"',
    ],
  },
  {
    id: 'no-fixed-locale-format',
    why:
      'Naming a locale at a formatting call site pins that string to one language ' +
      "for every reader of every board. Format through the viewer's Translator " +
      '(@meith/i18n) instead — t.number(), t.parts(), or an ICU message with a ' +
      '{n, number} placeholder — or through formatCount() in a theme, which reads ' +
      'the locale adopted for the render. This rule exists because 31 call sites ' +
      "shipped as .toLocaleString('en'): a German board grouped its post counts " +
      'with commas, and nothing failed, because a hardcoded locale is always ' +
      'internally consistent. The bare no-argument forms are worse still — they ' +
      'follow the *host*, so the same board renders differently depending on which ' +
      'machine served the page, and a client component disagrees with the server ' +
      'that rendered it. packages/i18n is exempt because deciding what a locale ' +
      'means is its job, and apps/web is a single-language marketing site.',
    files: /^(apps\/community|packages|themes|plugins|examples)\/.*\.(ts|tsx)$/,
    pattern: /\.toLocale(String|DateString|TimeString)\s*\(/,
    allow: /^(packages\/(i18n|testkit)\/|.*\.test\.tsx?$)/,
    probe: {
      violates: "<span>{forum.postCount.toLocaleString('en')}</span>",
      clean: '<span>{formatCount(forum.postCount)}</span>',
    },
    alsoClean: [
      'const shown = translator.number(forum.postCount)',
      "const label = t.t('stats.posts', { count })",
      "value.toLocaleLowerCase('tr-TR')",
    ],
  },
  {
    id: 'no-adhoc-local-redirect-check',
    why:
      'A redirect or return target is validated only by isSafeLocalPath ' +
      '(apps/community/src/server/safe-path.ts). The bare ' +
      'startsWith("/") && !startsWith("//") idiom accepts /\\evil.com, which a ' +
      'browser resolves as //evil.com — an open redirect that turns a login link ' +
      'into an off-site hop. isSafeLocalPath also rejects the backslash, control ' +
      'characters, and any target whose resolved origin is not this board.',
    files: /^apps\/community\/.*\.tsx?$/,
    pattern: /\.startsWith\(\s*['"]\/\//,
    allow: /^apps\/community\/src\/server\/safe-path\.ts$/,
    probe: {
      violates: "if (next.startsWith('/') && !next.startsWith('//')) return next",
      clean: "return isSafeLocalPath(next) ? next : '/'",
    },
  },
  {
    id: 'no-address-outside-the-fingerprint',
    why:
      'An address is truncated in one place only: retainedIpPrefix() and its two ' +
      'counting siblings in apps/community/src/server/request-fingerprint.ts. ' +
      'Every other module asks that module for a prefix, because it is where the ' +
      'demo rule lives: a board whose administrator password is printed on the ' +
      'page must keep no addresses at all, or one visitor reads the last one out ' +
      'of the admin log. A fresh truncateIp() call site is a column that fills up ' +
      'again on the demo and nowhere else, which no test on any other board can ' +
      'see. docs/demo-mode.md carries the reasoning.',
    files: /^apps\/community\/.*\.tsx?$/,
    pattern: /truncateIp\s*\(/,
    allow: /^(apps\/community\/src\/server\/request-fingerprint\.ts|.*\.test\.tsx?$)/,
    probe: {
      violates: 'ipPrefix: truncateIp(await remoteAddress()) ?? null,',
      clean: 'ipPrefix: await retainedIpPrefix(),',
    },
    alsoClean: [
      'const prefix = await countingPrefix()',
      'const address = await remoteAddress()\n\tif (!ipAllowed(address, allowlist)) return',
    ],
  },
  {
    id: 'no-relative-board-config-import',
    why:
      'community.config.ts, community.plugins.ts, and community.demo.plugins.ts are ' +
      'reached through one seam — @board/config and @board/plugins (tsconfig path ' +
      'aliases in tsconfig.base.json and apps/community/tsconfig.json) — never a ' +
      'relative path into apps/community, at any depth or through any intermediate ' +
      'directory. For a board to become an external workspace later, every consumer ' +
      'must resolve board config through a name a consuming workspace can supply, not ' +
      "through a relative path that assumes today's directory layout. The board files " +
      'may still import each other by relative path (community.config.ts pulls in ' +
      'community.plugins.ts, which pulls in community.demo.plugins.ts); that is the ' +
      "seam's own definition, not a caller reaching around it — see " +
      'docs/architecture.md, "The board-config seam", and see docs/plugin-api.md for ' +
      'why community.demo.plugins.ts exists at all.',
    files: /\.(ts|tsx)$/,
    pattern:
      /(?:\bfrom\s+|\bimport\s*\(\s*|\bvi\.mock\(\s*)['"]\.[^'"]*community\.(?:config|plugins|demo\.plugins)['"]/,
    allow:
      /^apps\/community\/community\.(?:config|plugins)\.ts$|^boards\/stock\/community\.(?:config|plugins)\.ts$|^packages\/create-meith\/src\/scaffold\.ts$|^templates\/[^/]+\/community\.(?:config|plugins)\.ts$/,
    probe: {
      violates: "import forumConfig from '../../community.config'",
      clean: "import forumConfig from '@board/config'",
    },
    alsoViolates: [
      "import { showcasePlugins } from '../../community.demo.plugins'",
      "import forumConfig from '../apps/community/community.config'",
      "import { installedPluginDefinitions } from '../../boards/stock/community.plugins'",
    ],
    alsoClean: [
      "await import('@board/plugins')",
      "vi.mock('@board/config', () => ({ default: {} }))",
    ],
  },
]
