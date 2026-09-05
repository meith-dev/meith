import type { Facts } from './facts'

export const site = {
  name: 'Meith',
  domain: 'meith.dev',
  url: 'https://www.meith.dev',
  demo: 'https://demo.meith.dev',
  repository: 'https://github.com/meith-dev/meith',
  tagline: 'Open-source, self-hosted community software for conversations worth keeping.',
  description:
    'Meith is open-source, self-hosted forum software for communities that want to own their conversations, data and infrastructure.',
  seoTitle: 'Meith — Open-source community software you own',
} as const

export const licence = {
  spdx: 'MIT',
  name: 'MIT License',
  file: 'LICENSE.md',
} as const

export const licenceHref = `${site.repository}/blob/main/${licence.file}`

export const scaffoldCommand = 'npx create-meith my-community'

export interface Shot {
  readonly file: string
  readonly alt: string
  readonly width: number
  readonly height: number
}

const DESKTOP = { width: 2560, height: 1640 } as const
const PHONE = { width: 780, height: 1560 } as const

function pair(name: string, alt: string, size: typeof DESKTOP | typeof PHONE) {
  return {
    light: { file: `/shots/${name}-light.png`, alt, ...size },
    dark: { file: `/shots/${name}-dark.png`, alt, ...size },
  }
}

export const shots = {
  threadMobile: pair(
    'thread-mobile',
    'The same board on a phone, showing a thread: posts in the order they were written, each with its author and the date.',
    PHONE,
  ),
  search: pair(
    'search',
    'Search results for “training”, each with the matched word picked out of the line it appears in.',
    DESKTOP,
  ),
  dues: pair(
    'dues',
    'A membership page: a monthly supporter plan, a ninety-day pass and a lifetime membership, each with its price.',
    DESKTOP,
  ),
} as const satisfies Record<string, { readonly light: Shot; readonly dark: Shot }>

export const hero = {
  badge: 'Open source · Self-hosted · MIT licensed',
  headline: {
    before: 'Built for communities.',
    emphasis: 'Owned by them.',
  },
  lede:
    'Meith is open-source, self-hosted forum software for conversations worth keeping. Give ' +
    'your community a place of its own — on your domain, on your infrastructure, with your ' +
    'data under your control.',
  primary: 'Get started',
  demo: 'Try the demo',
  source: 'View on GitHub',
  facts: ['Open source', 'MIT licensed', 'Self-hosted', 'No per-member pricing'],
  caption: 'Screenshots from a working Meith board, on a desktop and on a phone.',
} as const

export const devices = {
  label: 'The same board on a phone and on a desktop',
} as const

export const keeps = {
  eyebrow: 'Alongside the chat',
  heading: 'Chat is for now. Meith is for keeps.',
  lede:
    'Discord, Slack and group chats are great at what is happening right now. They are less ' +
    'good at remembering the answer someone gave two years ago.',
  body:
    'Meith gives your community a permanent home for the things worth keeping — discussions, ' +
    'answers, decisions, guides, and everything the next person should not have to ask again.',
  aside: {
    heading: 'Nothing is ranked for you.',
    body:
      'No feed and no algorithm. An announcement sits where you put it, a thread keeps its ' +
      'URL, and search reaches the whole archive.',
  },
  columns: [
    {
      title: 'Keep in chat',
      items: ['The banter', 'Tonight’s plans', 'Quick questions', '“Anyone around?”'],
    },
    {
      title: 'Keep in Meith',
      items: ['Answers', 'Announcements', 'Decisions', 'Guides', 'Events', 'Community knowledge'],
    },
  ],
} as const

export interface Pillar {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly doc: string
  readonly link: string
}

export const ownership = {
  eyebrow: 'Ownership',
  heading: 'A home for your community. Not another platform.',
  lede:
    'Your community should not disappear because a platform changes direction. A Meith board ' +
    'runs on a server you rent, at a domain you own, from a database you can take with you.',
  pillars: [
    {
      id: 'own',
      title: 'Own the whole thing',
      body:
        'Your domain, your server, your PostgreSQL. There is no Meith-hosted control plane, ' +
        'no account with a company in the middle, and nothing that can be switched off from ' +
        'outside your community.',
      doc: 'deployment',
      link: 'How a board is deployed',
    },
    {
      id: 'keep',
      title: 'Keep what your community knows',
      body:
        'Threads keep their URLs for years. Search covers the whole archive, so the answer ' +
        'from three organisers ago keeps earning its keep.',
      doc: 'search',
      link: 'How search works',
    },
    {
      id: 'yours',
      title: 'Make it yours',
      body:
        'The name, the colours and the theme are your call. Five themes ship with the board ' +
        'and a theme of your own is a normal package in the repository.',
      doc: 'themes',
      link: 'How themes work',
    },
    {
      id: 'cost',
      title: 'Pay for infrastructure, not popularity',
      body:
        'There is no licence fee and nothing priced per member. You pay for the machine the ' +
        'board runs on, and a community that doubles in size does not double its software ' +
        'bill.',
      doc: 'docker-compose',
      link: 'What a board runs on',
    },
    {
      id: 'handover',
      title: 'Handed over, not started over',
      body:
        'Nothing lives in anybody’s personal account. When the people running the board ' +
        'change, the roles move on and the board stays the community’s.',
      doc: 'organiser-guide',
      link: 'Handing a board over',
    },
  ],
} as const satisfies { readonly pillars: readonly Pillar[] } & Record<string, unknown>

export const audiencesBand = {
  eyebrow: 'Who it’s for',
  heading: 'Built for communities of all kinds.',
  lede:
    'A flexible foundation for communities that care about ownership, permanence and control. ' +
    'Each audience gets a page of its own.',
  link: 'Who is Meith for?',
} as const

export const developerTeaser = {
  eyebrow: 'For developers',
  heading: 'Your community, version controlled.',
  body:
    'A Meith board starts as a repository. Configuration, themes and plugins live alongside ' +
    'your code, so changes are reviewable, deployments are repeatable and upgrades are version ' +
    'bumps.',
  link: 'Explore Meith for Developers',
} as const

const HEADLINE_SCENARIO = 'Thread, page 1'

export const performance = {
  eyebrow: 'Performance',
  heading: 'Fast on day one. Fast ten years later.',
  lede:
    'Communities accumulate history. Meith is designed not to punish you for keeping it: every ' +
    'page is rendered on the server, works with JavaScript switched off, and is measured against ' +
    'a board with years of posts in it.',
  evidence(facts: Facts): string {
    const thread = facts.performance.scenarios.find(
      (scenario) => scenario.page === HEADLINE_SCENARIO,
    )

    if (!thread) {
      throw new Error(
        `docs/reference/performance.md no longer measures “${HEADLINE_SCENARIO}”, which the landing page ` +
          'quotes. Name a scenario it does measure, here in src/content/site.ts.',
      )
    }

    return (
      `Measured against a board of ${facts.performance.posts.toLocaleString('en-IE')} posts in ` +
      `${facts.performance.threads.toLocaleString('en-IE')} threads: a thread opens in ` +
      `${thread.p95Ms} ms at the 95th percentile, against a ${thread.budgetMs} ms budget. A ` +
      'release that breaks a budget is never published.'
    )
  },
  method(facts: Facts): string {
    return (
      `Single web process, no Redis, one read at a time, p95 over sixty iterations. Recorded ` +
      `${facts.performance.measured}. The numbers belong to that machine; the shape travels.`
    )
  },
  link: 'Every measurement, and how it was taken',
} as const

export interface ThemeShowcase {
  readonly key: string
  readonly title: string
  readonly blurb: string
  readonly light: Shot
  readonly dark: Shot
}

function themePair(key: string, title: string): { light: Shot; dark: Shot } {
  return {
    light: {
      file: `/shots/theme-${key}-light.png`,
      alt: `The board in ${title}, light.`,
      ...DESKTOP,
    },
    dark: { file: `/shots/theme-${key}-dark.png`, alt: `The board in ${title}, dark.`, ...DESKTOP },
  }
}

export const themes = {
  eyebrow: 'Customisation',
  heading: 'Make it unmistakably yours.',
  lede:
    'Your community should not look like everyone else’s install. Five themes ship with the ' +
    'board, each in light and dark, and a theme changes how the board looks and nothing else.',
  link: 'How themes work',
  schemes: [
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
  ],
  list: [
    {
      key: 'default',
      title: 'Default',
      blurb: 'What a board looks like out of the box.',
      ...themePair('default', 'the default theme'),
    },
    {
      key: 'clubhouse',
      title: 'Clubhouse',
      blurb: 'For a club with a crest and a fixture list.',
      ...themePair('clubhouse', 'Clubhouse'),
    },
    {
      key: 'midnight',
      title: 'Midnight',
      blurb: 'A terminal, for a community that lives in one.',
      ...themePair('midnight', 'Midnight'),
    },
    {
      key: 'phasebook',
      title: 'Phasebook',
      blurb: 'The social shape everybody already knows.',
      ...themePair('phasebook', 'Phasebook'),
    },
    {
      key: 'raidframe',
      title: 'Raidframe',
      blurb: "A game board's HUD, for clans and guilds.",
      ...themePair('raidframe', 'Raidframe'),
    },
  ],
} satisfies { readonly list: readonly ThemeShowcase[] } & Record<string, unknown>

export function themeShots(key: string): { readonly light: Shot; readonly dark: Shot } {
  const entry = themes.list.find((theme) => theme.key === key)
  if (!entry) {
    throw new Error(
      `No theme with key “${key}”. A segment in src/content/segments.ts names one that ` +
        `src/content/site.ts does not show. It shows: ` +
        `${themes.list.map((theme) => theme.key).join(', ')}.`,
    )
  }
  return { light: entry.light, dark: entry.dark }
}

export const customisation = {
  points: [
    {
      title: 'Themes',
      body: 'Fill documented slots with your own look. A theme is code in the repository, not a preset.',
      doc: 'themes',
      link: 'Themes',
    },
    {
      title: 'Plugins',
      body: 'Typed TypeScript packages on documented hooks, isolated so one that fails fails alone.',
      doc: 'plugins',
      link: 'Plugins',
    },
    {
      title: 'API',
      body: 'A REST API for anything an administrator can do by hand, with scoped tokens.',
      doc: 'api',
      link: 'The API',
    },
    {
      title: 'Marketplace',
      body: 'A reviewed feed of plugins and themes, installed from the repository like any dependency.',
      doc: 'marketplace',
      link: 'The marketplace',
    },
  ],
} as const

export const terminal: {
  readonly cwd: string
  readonly lines: readonly { readonly text: string; readonly output?: boolean }[]
} = {
  cwd: 'first deploy',
  lines: [
    { text: '✔ postgres  started', output: true },
    { text: '✔ migrate   exited (0)', output: true },
    { text: '✔ web       started', output: true },
    { text: '✔ worker    started', output: true },
    { text: '→ open /install to name the board', output: true },
  ],
}

export const openSource = {
  eyebrow: 'Open source',
  heading: 'Open source means open source.',
  body:
    'Meith is MIT licensed, and there is no hosted edition holding features back. The whole ' +
    'engine is in the repository: read it, fork it, extend it, contribute upstream, and ' +
    'understand exactly what an upgrade changes before you take it.',
  points: [
    'MIT licensed, with no open-core upsell',
    'Self-hosted on your own infrastructure',
    'Your own PostgreSQL database',
    'No per-member licence fees',
    'Inspectable, forkable and extensible',
  ],
  links: [
    { label: 'Deploy it', doc: 'deployment' },
    { label: 'Docker Compose by hand', doc: 'docker-compose' },
  ],
  licenceLink: 'Read the licence',
} as const

export const memberships = {
  eyebrow: 'Memberships',
  heading: 'Memberships without another middleman.',
  body:
    'Optional, and part of the board rather than a separate service: plans you set, sold ' +
    'through your own Stripe account as a subscription, a pass or a lifetime. Paying opens the ' +
    'members-only forum by itself, and lapsing closes it.',
  emphasis: 'The money is between your community and Stripe. No cut, and no per-member fee.',
  link: 'The memberships guide',
} as const

export const devTerminal: {
  readonly cwd: string
  readonly lines: readonly { readonly text: string; readonly output?: boolean }[]
} = {
  cwd: 'quickstart',
  lines: [
    { text: scaffoldCommand },
    { text: 'cd my-community && npm install && npm run dev' },
    { text: '✔ fixture mode  no DATABASE_URL — serving from memory', output: true },
    { text: '✔ ready        http://localhost:3000', output: true },
  ],
}

export const closing = {
  heading: 'Give your community a place of its own.',
  body:
    'Scaffold a board in a minute, run it on your machine before it ever touches a server, ' +
    'then hand the day-to-day to the people who run the community.',
  action: 'Get started',
  demo: 'Try the demo',
  source: 'View on GitHub',
  requirements: [
    { label: 'A repository', value: 'npx create-meith, pushed to your GitHub' },
    { label: 'A server', value: "Rented in the community's name, from a few euro a month" },
    { label: 'An evening', value: 'Once — an upgrade is a version bump' },
  ],
} as const

export const footer = {
  note:
    'the board, its plugins and the compose file all carry this number, so an upgrade ' +
    'moves them together.',
  links: [
    { label: 'What changed', href: `${site.repository}/releases` },
    { label: 'How upgrades work', doc: 'upgrading' },
    { label: 'Report a problem', href: `${site.repository}/issues` },
  ],
} as const
