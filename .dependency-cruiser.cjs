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
          '\\.(fixture|test)\\.ts$',
          '\\.type-test\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts|json)$',
          '(^|/)(drizzle|postcss|next|vitest|playwright)\\.config\\.(js|cjs|mjs|ts)$',
          'apps/(forum|web)/app/.*/(page|layout|route|template|loading|error|not-found|default|sitemap|robots|opengraph-image|icon)\\.(ts|tsx)$',
          'apps/(forum|web)/app/(page|layout|route|template|loading|error|not-found|global-error|sitemap|robots)\\.(ts|tsx)$',
          'apps/forum/(instrumentation|middleware|proxy)\\.(ts|tsx)$',
        ],
      },
      to: {},
    },

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
        '\\.next(-e2e)?/',
        'dist/',
        '\\.test\\.ts$',
        '\\.spec\\.ts$',
        '^packages/testkit/',
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
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
