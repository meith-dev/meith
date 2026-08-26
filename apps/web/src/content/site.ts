import type { Facts } from './facts'

export const site = {
  name: 'Meith',
  domain: 'meith.dev',
  url: 'https://www.meith.dev',
  demo: 'https://demo.meith.dev',
  repository: 'https://github.com/meith-dev/meith',
  tagline: 'A forum for your community, on a server of your own.',
  description:
    'Open-source forum software for communities that want durable discussions, clear permissions, and control of their own server.',
} as const

export const licence = {
  spdx: 'MIT',
  name: 'MIT License',
  file: 'LICENSE.md',
} as const

export const licenceHref = `${site.repository}/blob/main/${licence.file}`

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
  badge: 'Open source · Self-hosted · No per-member pricing',
  headline: {
    before: 'A forum your community can rely on.',
    emphasis: 'On a server you control.',
  },
  lede:
    'Keep announcements, decisions, and useful answers in searchable threads. Run the board ' +
    'from a browser, keep private forums private, and move it with you when operators change.',
  primary: 'Explore the demo',
  secondary: 'Install Meith',
  caption: 'Screenshots from a working Meith board.',
} as const

export const devices = {
  label: 'The same board on a phone and on a desktop',
} as const

const HEADLINE_SCENARIO = 'Thread, page 1'

export const finding = {
  eyebrow: 'Search, and no feed',
  heading: 'Find the answer somebody wrote years ago.',
  lede:
    'Moderators move on and founders step back, but the answers stay. Search covers the whole ' +
    'archive, and puts the thread that settles your question ahead of a passing mention of it.',
  ranking: {
    heading: 'Nothing is ranked for you.',
    body:
      'No feed, no ranking, no “see more”. An announcement sits where you put it, and ' +
      'everybody in that forum sees it.',
  },
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
      `Proved against a board of ${facts.performance.posts.toLocaleString('en-IE')} posts — ` +
      `years of a busy community's history: a thread still opens in ${thread.p95Ms} ms, and a ` +
      `release that breaks its ${thread.budgetMs} ms budget is never published.`
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
  eyebrow: 'Themes',
  heading: 'It can wear your colours.',
  lede:
    'Five looks ship with the board, each in light and dark. A theme changes how the board ' +
    'looks and nothing else — so a new coat of paint can never cost you the board.',
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

export const alongside = {
  eyebrow: 'Alongside what you already have',
  heading: 'Chat is for now. This is for keeps.',
  lede:
    'Keep the group chat. Put the things that need to still be true next month somewhere they ' +
    'will survive it.',
  columns: [
    {
      title: 'Leave in the chat',
      items: [
        "who's about tonight",
        "tonight's plan",
        'the banter',
        '“on my way”',
        'the photo from Saturday',
      ],
    },
    {
      title: 'Put on the board',
      items: [
        'announcements',
        'decisions and minutes',
        'how we do things',
        'events & sign-ups',
        'the good answers',
        'the archive',
        'what a newcomer needs in six months',
      ],
    },
  ],
} as const

export interface Capability {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly doc: string
  readonly anchor: string | null
  readonly link: string
}

export const capabilities: readonly Capability[] = [
  {
    id: 'permissions',
    title: 'A room for everyone, and one for the organisers',
    body:
      'Newcomers, members and the people running the place each see their own forums — and ' +
      'search, feeds and the API keep the secret too.',
    doc: 'operating',
    anchor: null,
    link: 'How permissions work',
  },
  {
    id: 'themes',
    title: 'It wears your colours',
    body:
      'The name, the logo and the colours are settings in the admin panel, not code — a new ' +
      'look never risks a working board.',
    doc: 'organiser-guide',
    anchor: null,
    link: 'What you can change yourself',
  },
  {
    id: 'plugins',
    title: 'Add what your community is missing',
    body:
      'Plugins stay in their lane. One that misbehaves fails on its own, and the board ' +
      'carries on without it.',
    doc: 'plugins',
    anchor: null,
    link: 'What plugins can do',
  },
  {
    id: 'search',
    title: 'Years of answers, still findable',
    body:
      'The archive stays quick however deep it gets, so the answer from three admins ago ' +
      'keeps earning its keep.',
    doc: 'performance',
    anchor: null,
    link: 'How search holds up',
  },
  {
    id: 'spam',
    title: 'Bots stay out, people get in',
    body:
      'A trap only bots fall into, and sign-up questions only your members can answer. No ' +
      'puzzle grids at the door.',
    doc: 'operating',
    anchor: null,
    link: 'How the spam controls work',
  },
  {
    id: 'chores',
    title: 'Handed over, not started over',
    body:
      'Nothing lives in anybody’s personal account. When the person who set it up moves on, ' +
      'the roles move on too — and the board stays the community’s.',
    doc: 'organiser-guide',
    anchor: null,
    link: 'Running it day to day',
  },
]

export function capabilitiesByIds(ids: readonly string[]): readonly Capability[] {
  return ids.map((id) => {
    const capability = capabilities.find((entry) => entry.id === id)
    if (!capability) {
      throw new Error(
        `No capability with id “${id}”. A segment in src/content/segments.ts names one that ` +
          `src/content/site.ts does not define. It defines: ` +
          `${capabilities.map((entry) => entry.id).join(', ')}.`,
      )
    }
    return capability
  })
}

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
  heading: 'Yours to run, and yours to keep.',
  body:
    'Open source under the MIT licence, on a machine your community rents, at a domain it ' +
    'owns. No company in the middle, nobody who can price it later or ' +
    'switch it off — and when the people running it change, the board is handed over whole, ' +
    'not rebuilt from scratch.',
  emphasis:
    'The bill follows the machine, never the membership: two hundred members cost what twenty do.',
  links: [
    { label: 'Set one up', doc: 'quickstart' },
    { label: 'Deploying by hand', doc: 'docker-compose' },
  ],
  licenceLink: 'Read the licence',
} as const

export const memberships = {
  eyebrow: 'Memberships',
  heading: 'Take memberships online, and stop chasing them.',
  body:
    'Dues comes with the board: the plans you set, sold through your own Stripe account as a ' +
    'subscription, a pass or a lifetime. Paying opens the members-only forum by itself, ' +
    'lapsing closes it by itself — and the spreadsheet retires.',
  emphasis: 'The money is between you and Stripe. No cut, and no per-member fee.',
  link: 'The memberships guide',
} as const

export const extensible = {
  eyebrow: 'For the member who codes',
  heading: 'And the rest is yours to add.',
  lede:
    'Somebody technical in the community gets a corner too: plugins with typed hooks, themes ' +
    'that fill documented slots, and an API for anything an administrator can do by hand.',
  counts(facts: Facts): readonly { readonly label: string; readonly value: string }[] {
    return [
      { label: 'Theme slots', value: String(facts.theme.slots) },
      { label: 'Plugin hooks', value: String(facts.plugins.hooks) },
      { label: 'API endpoints', value: String(facts.api.endpoints) },
      { label: 'Scopes on them', value: String(facts.api.scopes) },
    ]
  },
  links: [
    { label: 'What plugins can do', doc: 'plugins' },
    { label: 'How themes work', doc: 'themes' },
    { label: 'The API and the CLI', doc: 'api' },
  ],
} as const

export const chooser = {
  eyebrow: "Who it's for",
  heading: 'Find the version of this that is about you.',
  lede:
    "A club has fixtures and subs. A residents' association has the road. A clan has a " +
    'roster. Each gets a page of its own.',
} as const

export const closing = {
  heading: 'Give your community somewhere to keep things.',
  body:
    'Set up by one person in an evening, run from a browser by the people who run everything ' +
    'else. Have a look at a real board first.',
  action: 'Set one up',
  requirements: [
    { label: 'A server', value: 'Rented by the community, from a few euro a month' },
    { label: 'A domain', value: 'Pointed at it' },
    { label: 'A volunteer', value: 'With a free evening, once' },
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
