import type { Facts } from './facts'
import { scaffoldCommand } from './site'

export interface Audience {
  readonly slug: string
  readonly name: string
  readonly lowerName: string
  readonly secondary?: boolean
  readonly card: { readonly heading: string; readonly line: string; readonly cta: string }
  readonly meta: { readonly title: string; readonly description: string }
  readonly hero: {
    readonly badge: string
    readonly headline: { readonly before: string; readonly emphasis: string }
    readonly lede: string
  }
}

export interface DocLink {
  readonly label: string
  readonly doc: string
}

export interface Point {
  readonly title: string
  readonly body: string
}

export const developers = {
  slug: 'developers',
  name: 'Developers',
  lowerName: 'developers',
  card: {
    heading: 'Treat your community like software.',
    line:
      'Version-controlled configuration, typed extensions, custom themes, plugins, an API, ' +
      'repeatable deployments, and infrastructure you control.',
    cta: 'Meith for Developers',
  },
  meta: {
    title: 'Meith for Developers — Code-first community software',
    description:
      'Build and operate your community like software with version-controlled configuration, ' +
      'TypeScript extensions, themes, plugins and self-hosted infrastructure.',
  },
  hero: {
    badge: 'For developers, engineering teams and technical operators',
    headline: {
      before: 'Your community,',
      emphasis: 'version controlled.',
    },
    lede:
      'Meith gives developers a code-first foundation for building and operating community ' +
      'spaces. Self-host it, configure it in code, extend it with TypeScript, and deploy it ' +
      'like the rest of your stack.',
  },
  intro: {
    heading: 'Forum software designed to feel like software.',
    body:
      'Configuration lives in code. Extensions are typed. Deployments are repeatable. Themes ' +
      'and plugins belong in the repository alongside the rest of the project. Run your ' +
      'community like an application, not an account.',
  },
  repository: {
    eyebrow: 'The board repository',
    heading: 'A board is a repository. The rest is contracts.',
    lede:
      'npx create-meith writes a board that pins the engine at one exact version and ' +
      'registers its themes and plugins in typed config the compiler checks. A plugin arrives ' +
      'as a reviewable diff, an upgrade is a version bump, and the whole board rebuilds from ' +
      'clone plus backup.',
    points: [
      {
        title: 'Configuration in code',
        body:
          'package.json pins the engine, meith.config.ts registers the themes, and ' +
          'board.plugins.json names the plugins. What the board is made of is versioned.',
      },
      {
        title: 'A deliberate boundary',
        body:
          'What the community does — forums, permissions, members, every thread — lives in ' +
          'PostgreSQL and is run from the browser. A deploy can never delete a forum, and an ' +
          'organiser can never break the build.',
      },
      {
        title: 'Infrastructure in the repo',
        body:
          'The scaffold includes a Dockerfile, a compose file and a CI workflow. Review, ' +
          'diff and revert the deployment the same way you review the code.',
      },
      {
        title: 'One engine, many boards',
        body:
          'Each board is its own small repository pinning its own version, so an agency or a ' +
          'platform team can run several without any of them becoming a snowflake.',
      },
    ],
    links: [
      { label: 'Configuration in code', doc: 'configuration' },
      { label: 'Upgrading a board', doc: 'upgrading' },
    ],
  },
  experience: {
    eyebrow: 'Developer experience',
    heading: 'Clone it, run it, no database required.',
    body:
      'With no DATABASE_URL set, a board runs in fixture mode: a realistic, deterministic ' +
      'dataset served from memory — forums, threads, members and search — so you can browse ' +
      'every screen and develop a theme or plugin without PostgreSQL or Docker. Point it at a ' +
      'database the moment you want to write.',
    link: { label: 'The quickstart', doc: 'quickstart' },
  },
  extensibility: {
    eyebrow: 'Type-safe extensibility',
    heading: 'Stable contracts, typed end to end.',
    lede:
      'Meith is not a closed application. Everything you extend it through is a documented, ' +
      'versioned contract with TypeScript types on it, and every reference below is generated ' +
      'from the code it describes.',
    counts(facts: Facts): readonly { readonly label: string; readonly value: string }[] {
      return [
        { label: 'Theme slots', value: String(facts.theme.slots) },
        { label: 'Plugin hooks', value: String(facts.plugins.hooks) },
        { label: 'API endpoints', value: String(facts.api.endpoints) },
        { label: 'API scopes', value: String(facts.api.scopes) },
      ]
    },
    points: [
      {
        title: 'Themes',
        body:
          'Your community should not look like everyone else’s install. A theme fills ' +
          'documented slots with typed view models, ships as a package in the repository, ' +
          'and changes how the board looks and nothing else.',
        doc: 'themes',
        link: 'How themes work',
      },
      {
        title: 'Plugins',
        body:
          'A plugin is a TypeScript package attached to typed hooks — filters, events and UI ' +
          'regions — with crash isolation, so one that misbehaves fails alone and the board ' +
          'carries on without it.',
        doc: 'plugins',
        link: 'What plugins can do',
      },
      {
        title: 'API and CLI',
        body:
          'A REST API with scoped tokens covers anything an administrator can do by hand, ' +
          'published as an OpenAPI document. The operator CLI handles backups, upgrades and ' +
          'imports from a terminal.',
        doc: 'api',
        link: 'The API reference',
      },
      {
        title: 'Marketplace',
        body:
          'A reviewed feed of plugins and themes. Scaffold your own with create-meith, publish ' +
          'it, and install it into any board as a dependency.',
        doc: 'first-plugin',
        link: 'Write your first plugin',
      },
    ],
  },
  performance: {
    eyebrow: 'Performance',
    heading: 'Fast on day one. Fast ten years later.',
    lede:
      'Communities accumulate history. Meith is designed not to punish you for keeping it: ' +
      'pages are server-rendered HTML with no bundle to hydrate, and the budgets are enforced ' +
      'by the load runner rather than promised in a README.',
    method(facts: Facts): readonly { readonly label: string; readonly value: string }[] {
      return [
        {
          label: 'Benchmark board',
          value: `${facts.performance.posts.toLocaleString('en-IE')} posts, ${facts.performance.threads.toLocaleString('en-IE')} threads`,
        },
        {
          label: 'Longest thread',
          value: `${facts.performance.longestThread.toLocaleString('en-IE')} posts`,
        },
        { label: 'Topology', value: 'One web process, per-process cache, no Redis' },
        { label: 'Recorded', value: facts.performance.measured },
      ]
    },
    scenarios: ['Thread, page 1', 'Thread, deep page', 'Search, rare term', 'Board index'],
    note:
      'p95 over sixty iterations, one read at a time. The absolute numbers belong to the ' +
      'machine they were measured on; what travels is the shape, and a release that breaks a ' +
      'budget is never published.',
    link: { label: 'The full performance reference', doc: 'performance' },
  },
  selfHosting: {
    eyebrow: 'Self-hosting',
    heading: 'Your database. Your server. Your call where it runs.',
    lede:
      'A production board is four services — PostgreSQL, a one-shot migration, the web app ' +
      'and a worker — on infrastructure you choose. The board does not depend on a ' +
      'Meith-hosted control plane, and nobody outside your community can switch it off.',
    points: [
      {
        title: 'Deploy where you want',
        body:
          'A guided route with Coolify, Docker Compose by hand behind your own proxy, or a ' +
          'serverless route on Vercel. None of them is one click, and each is written down.',
      },
      {
        title: 'Operate it like a service',
        body:
          'Health checks, an optional Prometheus endpoint, webhooks, backups as CLI commands ' +
          'and a disaster-recovery runbook. Built for an evening a month, not a pager.',
      },
      {
        title: 'Leave whenever you like',
        body:
          'The board is a repository and a PostgreSQL database. Back it up, move it, or ' +
          'take it apart with the CLI. Nothing lives anywhere else.',
      },
    ],
    links: [
      { label: 'Deployment', doc: 'deployment' },
      { label: 'Operations', doc: 'operating' },
      { label: 'Backups', doc: 'backups' },
    ],
  },
  openSource: {
    eyebrow: 'Open source',
    heading: 'Read the implementation before you depend on it.',
    body:
      'Meith is MIT licensed with no hosted edition holding features back. Inspect the code, ' +
      'fork it, extend it, and contribute upstream. Upgrades are versioned with the changes ' +
      'written down, and the extension APIs are the same ones the shipped themes and plugins ' +
      'use — there is no proprietary layer underneath.',
    link: 'View the source on GitHub',
  },
  closing: {
    heading: 'Build a community like you build software.',
    body:
      `${scaffoldCommand} writes the repository, the deploy kit and the CI workflow. Run it ` +
      'in fixture mode over a coffee, then put it on your own domain.',
    docs: 'Read the docs',
  },
} as const satisfies Audience & Record<string, unknown>
