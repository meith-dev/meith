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
  'antispam',
  'groups',
  'authorization',
  'forums',
  'threads',
  'posts',
  'profile-fields',
  'messages',
  'relations',
  'reputation',
  'signatures',
  'admin',
  'markdown',
  'moderation',
  'notifications',
  'settings',
  'subscriptions',
  'events',
  'tasks',
  'api',
  'install',
  'upgrade',
  'import',
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
          'apps/(forum|web)/app/.*/(page|layout|route|template|loading|error|not-found|default|sitemap|robots|opengraph-image|icon)\\.(ts|tsx)$',
          'apps/(forum|web)/app/(page|layout|route|template|loading|error|not-found|global-error|sitemap|robots)\\.(ts|tsx)$',
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
        'R2: only @meith/db may speak to postgres. Domain packages take repository ' +
        'interfaces so they can be tested against the in-memory fixture.',
      from: { path: `^packages/(${DOMAIN})/` },
      to: { path: '(^|/)node_modules/(postgres|pg|drizzle-orm)(/|$)' },
    },
    {
      /*
       * Both forms of the same target are matched deliberately.
       *
       * With `tsConfig` pointing at tsconfig.base.json, `@meith/db` resolves via
       * the path alias to the real file `packages/db/src/index.ts`. Without a
       * resolvable alias it stays an unresolved bare specifier, and under some
       * pnpm layouts it appears as `node_modules/@meith/db`. A rule written for
       * only one of those three shapes reports a clean run while enforcing
       * nothing — which is exactly what happened here: the original
       * `^packages/drivers/`-only rule never covered @meith/db at all, and a
       * probe importing getDb() into packages/forums passed silently.
       *
       * Verify with: create packages/<domain>/src/__probe.ts importing @meith/db
       * and confirm this rule fires before trusting a green run.
       */
      name: 'domain-no-infra-impl',
      severity: 'error',
      comment:
        'R2: domain packages depend on repository/port *interfaces* declared in ' +
        '@meith/core, never on @meith/db or @meith/drivers implementations. This is ' +
        'what lets the same business logic run against Postgres, the in-memory ' +
        'fixture, and the test suite, and lets Redis replace Vercel KV without ' +
        'editing a single domain file.',
      from: { path: `^packages/(${DOMAIN})/` },
      to: {
        path: [
          '^packages/(db|drivers)/',
          '(^|/)node_modules/@meith/(db|drivers)(/|$)',
          '^@meith/(db|drivers)$',
        ],
      },
    },

    /* ---- R2: layering ---- */
    {
      name: 'core-depends-on-nothing',
      severity: 'error',
      comment:
        '@meith/core is the bottom of the stack: types, env, errors, ports. If core ' +
        'imports a sibling the dependency graph has no floor.',
      from: { path: '^packages/core/' },
      to: {
        path: [
          '^packages/(?!core/)',
          '(^|/)node_modules/@meith/(?!core(/|$))',
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
          `(^|/)node_modules/@meith/(db|drivers|${DOMAIN})(/|$)`,
        ],
      },
    },
    {
      /*
       * F80. The strongest form of "a plugin cannot leak a private forum" is
       * that it cannot reach the query layer at all. `@meith/plugin-kit` hands a
       * plugin what a viewer may already see; a plugin importing `@meith/db` or a
       * domain package would be outside every guarantee the host makes, and no
       * amount of failure isolation would help.
       */
      name: 'plugins-use-the-kit-only',
      severity: 'error',
      comment:
        'A plugin extends the board through @meith/plugin-kit. It must not import ' +
        '@meith/db, a driver, or a domain package: the host isolates failures, not ' +
        'privilege, and a plugin with its own database access can read anything.',
      from: { path: '^plugins/' },
      to: {
        path: [
          `^packages/(db|drivers|${DOMAIN})/`,
          `(^|/)node_modules/@meith/(db|drivers|${DOMAIN})(/|$)`,
        ],
      },
    },
    {
      name: 'ui-is-presentation-only',
      severity: 'error',
      comment:
        '@meith/ui is dumb components. Data fetching lives in the app layer.',
      from: { path: '^packages/ui/' },
      to: {
        path: [
          `^packages/(db|drivers|${DOMAIN})/`,
          `(^|/)node_modules/@meith/(db|drivers|${DOMAIN})(/|$)`,
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
        /*
         * Build output. `.next-e2e` is the same thing under another name — the
         * browser suite builds into it so a run does not invalidate the dev
         * server's cache — and it is inside `apps/forum/`, which this scans.
         */
        '\\.next(-e2e)?/',
        'dist/',
        '\\.test\\.ts$',
        '\\.spec\\.ts$',
        '^packages/testkit/',
      ],
    },
    tsPreCompilationDeps: true,
    /*
     * Must be tsconfig.base.json, which is where the `@meith/<name>` path
     * aliases live. Pointing at the root tsconfig.json (which only holds
     * `references`) leaves every workspace import unresolvable: dependency-cruiser
     * reports `couldNotResolve: true` with the bare specifier as the `resolved`
     * value, so any rule matching a *path* silently never fires. That made the
     * R2 driver-isolation rules inert while still reporting a clean run — the
     * worst possible failure mode for a guard. Verified with a probe module.
     */
    tsConfig: { fileName: 'tsconfig.base.json' },
    /*
     * The app's `@/*` alias, which lives in `apps/forum/tsconfig.json` and so
     * not in the `tsconfig.base.json` above. Without it every `@/…` edge from
     * `app/` is invisible to this tool — see the file's own header for what
     * that costs.
     */
    webpackConfig: { fileName: '.dependency-cruiser.webpack.cjs' },
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
