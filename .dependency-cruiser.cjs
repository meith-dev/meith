/**
 * R2 architectural boundaries, mechanically enforced.
 *
 * The plan's rule R2 is the load-bearing constraint of the whole build: domain
 * packages must stay free of Next.js and of driver *implementations*, so that
 * business logic is testable without a framework and swappable without a
 * rewrite. A convention nobody checks is a convention nobody keeps, so every
 * clause of R2 below is a hard `error` — CI fails, not warns.
 */

/** Domain packages: pure business logic. */
const DOMAIN = [
  'accounts',
  'groups',
  'authorization',
  'forums',
  'threads',
  'posts',
  'bbcode',
  'settings',
  'events',
  'tasks',
].join('|')

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular imports make initialisation order undefined and break tree-shaking.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Dead modules rot. Delete them or wire them up.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$',
          '\\.d\\.ts$',
          /*
           * Test-support modules are imported only by *.test.ts, which is not
           * part of the production graph depcruise walks — so they legitimately
           * have no non-test importer and are not dead code.
           */
          '\\.(fixture|test)\\.ts$',
          /*
           * `*.type-test.ts` is checked by `tsc`, not by vitest: its assertions
           * are `@ts-expect-error` directives. It has no importer by design.
           */
          '\\.type-test\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts|json)$',
          /*
           * Tooling configs are invoked by a CLI, never imported.
           */
          '(^|/)(drizzle|postcss|next|vitest|playwright)\\.config\\.(js|cjs|mjs|ts)$',
          /*
           * Next's App Router resolves these by file convention, so they have
           * no importer in the module graph by design. Flagging them as dead
           * code would make the rule useless for every real page.
           */
          'apps/forum/app/.*/(page|layout|route|template|loading|error|not-found|default|sitemap|robots|opengraph-image|icon)\\.(ts|tsx)$',
          'apps/forum/app/(page|layout|route|template|loading|error|not-found|global-error|sitemap|robots)\\.(ts|tsx)$',
          'apps/forum/(instrumentation|middleware|proxy)\\.(ts|tsx)$',
        ],
      },
      to: {},
    },

    /* ---- R2: domain packages are framework-free ---- */
    {
      name: 'domain-no-next',
      severity: 'error',
      comment:
        'R2: domain packages must not import next/*. Business logic that reaches for ' +
        'cookies(), headers() or revalidateTag() cannot be unit-tested and cannot run ' +
        'in the worker or the CLI. Take the value as an argument instead.',
      from: { path: `^packages/(${DOMAIN})/` },
      to: { path: '^(next|next/.+|react|react-dom|server-only)$' },
    },
    {
      name: 'domain-no-raw-sql-client',
      severity: 'error',
      comment:
        'R2: only @forum/db may speak to postgres. Domain packages take repository ' +
        'interfaces so they can be tested against the in-memory fixture.',
      from: { path: `^packages/(${DOMAIN})/` },
      to: { path: '(^|/)node_modules/(postgres|pg|drizzle-orm)(/|$)' },
    },
    {
      /*
       * Both forms of the same target are matched deliberately.
       *
       * With `tsConfig` pointing at tsconfig.base.json, `@forum/db` resolves via
       * the path alias to the real file `packages/db/src/index.ts`. Without a
       * resolvable alias it stays an unresolved bare specifier, and under some
       * pnpm layouts it appears as `node_modules/@forum/db`. A rule written for
       * only one of those three shapes reports a clean run while enforcing
       * nothing — which is exactly what happened here: the original
       * `^packages/drivers/`-only rule never covered @forum/db at all, and a
       * probe importing getDb() into packages/forums passed silently.
       *
       * Verify with: create packages/<domain>/src/__probe.ts importing @forum/db
       * and confirm this rule fires before trusting a green run.
       */
      name: 'domain-no-infra-impl',
      severity: 'error',
      comment:
        'R2: domain packages depend on repository/port *interfaces* declared in ' +
        '@forum/core, never on @forum/db or @forum/drivers implementations. This is ' +
        'what lets the same business logic run against Postgres, the in-memory ' +
        'fixture, and the test suite, and lets Redis replace Vercel KV without ' +
        'editing a single domain file.',
      from: { path: `^packages/(${DOMAIN})/` },
      to: {
        path: [
          '^packages/(db|drivers)/',
          '(^|/)node_modules/@forum/(db|drivers)(/|$)',
          '^@forum/(db|drivers)$',
        ],
      },
    },

    /* ---- R2: layering ---- */
    {
      name: 'core-depends-on-nothing',
      severity: 'error',
      comment:
        '@forum/core is the bottom of the stack: types, env, errors, ports. If core ' +
        'imports a sibling the dependency graph has no floor.',
      from: { path: '^packages/core/' },
      to: {
        path: [
          '^packages/(?!core/)',
          '(^|/)node_modules/@forum/(?!core(/|$))',
        ],
      },
    },
    {
      name: 'no-app-internals-from-packages',
      severity: 'error',
      comment:
        'Packages must not reach back up into apps/. Dependencies point one way.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'themes-are-presentation-only',
      severity: 'error',
      comment:
        'R6: a theme renders slots it is handed. It must not query the database or ' +
        'import domain logic, or theming becomes a security surface.',
      from: { path: '^themes/' },
      to: {
        path: [
          `^packages/(db|drivers|${DOMAIN})/`,
          `(^|/)node_modules/@forum/(db|drivers|${DOMAIN})(/|$)`,
        ],
      },
    },
    {
      name: 'ui-is-presentation-only',
      severity: 'error',
      comment:
        '@forum/ui is dumb components. Data fetching lives in the app layer.',
      from: { path: '^packages/ui/' },
      to: {
        path: [
          `^packages/(db|drivers|${DOMAIN})/`,
          `(^|/)node_modules/@forum/(db|drivers|${DOMAIN})(/|$)`,
        ],
      },
    },

    /* ---- F02: one env reader ---- */
    {
      name: 'no-deprecated-core',
      severity: 'error',
      comment: 'Deprecated Node core modules.',
      from: {},
      to: { dependencyTypes: ['core'], path: '^(punycode|domain|sys)$' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        'node_modules',
        '\\.next/',
        'dist/',
        '\\.test\\.ts$',
        '\\.spec\\.ts$',
        '^packages/testkit/',
      ],
    },
    tsPreCompilationDeps: true,
    /*
     * Must be tsconfig.base.json, which is where the `@forum/<name>` path
     * aliases live. Pointing at the root tsconfig.json (which only holds
     * `references`) leaves every workspace import unresolvable: dependency-cruiser
     * reports `couldNotResolve: true` with the bare specifier as the `resolved`
     * value, so any rule matching a *path* silently never fires. That made the
     * R2 driver-isolation rules inert while still reporting a clean run — the
     * worst possible failure mode for a guard. Verified with a probe module.
     */
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
