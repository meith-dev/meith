import type { Facts } from "./facts"

export const site = {
  name: "Meith",
  domain: "meith.dev",
  url: "https://www.meith.dev",
  demo: "https://demo.meith.dev",
  repository: "https://github.com/meith-dev/meith",
  tagline: "A community forum you run on your own server.",
  description:
    "Meith is a free, open-source community forum you run yourself. Threads that stay put, " +
    "search that reaches back years, five themes, memberships, and no algorithm deciding who " +
    "sees what. No ads and no per-member pricing.",
} as const

export const licence = {
  spdx: "LGPL-3.0-or-later",
  short: "LGPL-3.0",
  name: "GNU Lesser General Public License v3",
  file: "LICENSE.md",
  incorporates: "COPYING",
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
    "thread-mobile",
    "The same board on a phone, showing a thread: posts in the order they were written, each with its author and the date.",
    PHONE,
  ),
  search: pair(
    "search",
    "Search results for “training”, each with the matched word picked out of the line it appears in.",
    DESKTOP,
  ),
  dues: pair(
    "dues",
    "A membership page: a monthly supporter plan, a ninety-day pass and a lifetime membership, each with its price.",
    DESKTOP,
  ),
} as const satisfies Record<string, { readonly light: Shot; readonly dark: Shot }>

export const hero = {
  badge: "Free and open source · Your own server · No per-member pricing",
  headline: { before: "A community forum,", emphasis: "on a server of your own." },
  lede:
    "Somewhere your members talk, and somewhere anybody can find what was said afterwards. " +
    "Threads stay put, search reaches back years, and no algorithm decides who sees what.",
  primary: "See a live board",
  secondary: "Set one up",
  caption: "A real board, photographed. Every picture on this page is one.",
} as const

export const devices = {
  label: "The same board on a phone and on a desktop",
} as const

const HEADLINE_SCENARIO = "Thread, page 1"

export const finding = {
  eyebrow: "Search, and no feed",
  heading: "Find the answer somebody wrote years ago.",
  lede:
    "It covers the whole archive, and puts the thread that answers your question ahead of a " +
    "passing mention of it.",
  ranking: {
    heading: "Nothing is ranked for you.",
    body:
      "No feed, no ranking. A notice sits where it was put, and everybody in that forum sees it.",
  },
  evidence(facts: Facts): string {
    const thread = facts.performance.scenarios.find(
      (scenario) => scenario.page === HEADLINE_SCENARIO,
    )

    if (!thread) {
      throw new Error(
        `docs/performance.md no longer measures “${HEADLINE_SCENARIO}”, which the landing page ` +
          "quotes. Name a scenario it does measure, here in src/content/site.ts.",
      )
    }

    return (
      `Measured against a board of ${facts.performance.posts.toLocaleString("en-IE")} posts: a ` +
      `thread page renders in ${thread.p95Ms} ms at the 95th percentile, and a run over its ` +
      `${thread.budgetMs} ms budget fails the build.`
    )
  },
  link: "Every measurement, and how it was taken",
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
    light: { file: `/shots/theme-${key}-light.png`, alt: `The board in ${title}, light.`, ...DESKTOP },
    dark: { file: `/shots/theme-${key}-dark.png`, alt: `The board in ${title}, dark.`, ...DESKTOP },
  }
}

export const themes = {
  eyebrow: "Themes",
  heading: "It can look like your community.",
  lede:
    "Five ship with the board, each in light and dark. A theme changes how a board looks and " +
    "nothing else — so a new coat of paint can never cost you the board.",
  link: "How themes work",
  schemes: [
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
  ],
  list: [
    {
      key: "default",
      title: "Default",
      blurb: "What a board looks like out of the box.",
      ...themePair("default", "the default theme"),
    },
    {
      key: "clubhouse",
      title: "Clubhouse",
      blurb: "For a club with a crest and a fixture list.",
      ...themePair("clubhouse", "Clubhouse"),
    },
    {
      key: "midnight",
      title: "Midnight",
      blurb: "A terminal, for a community that lives in one.",
      ...themePair("midnight", "Midnight"),
    },
    {
      key: "phasebook",
      title: "Phasebook",
      blurb: "The social shape everybody already knows.",
      ...themePair("phasebook", "Phasebook"),
    },
    {
      key: "raidframe",
      title: "Raidframe",
      blurb: "A game board's HUD, for clans and guilds.",
      ...themePair("raidframe", "Raidframe"),
    },
  ],
} satisfies { readonly list: readonly ThemeShowcase[] } & Record<string, unknown>

export function themeShots(key: string): { readonly light: Shot; readonly dark: Shot } {
  const entry = themes.list.find((theme) => theme.key === key)
  if (!entry) {
    throw new Error(
      `No theme with key “${key}”. A segment in src/content/segments.ts names one that ` +
        `src/content/site.ts does not show. It shows: ` +
        `${themes.list.map((theme) => theme.key).join(", ")}.`,
    )
  }
  return { light: entry.light, dark: entry.dark }
}

export const alongside = {
  eyebrow: "Alongside what you already have",
  heading: "Chat is for now. This is for keeps.",
  lede:
    "Keep the group chat. Put the things that need to still be true next month somewhere they " +
    "will survive it.",
  columns: [
    {
      title: "Leave in the chat",
      items: [
        "who's about tonight",
        "today's lifts",
        "the banter",
        "“on my way”",
        "the photo from Saturday",
      ],
    },
    {
      title: "Put on the board",
      items: [
        "fixtures & results",
        "decisions and minutes",
        "how we do things",
        "registration & fees",
        "recruitment",
        "the archive",
        "what a new member needs in six months",
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
    id: "permissions",
    title: "A room for everyone, and one for the committee",
    body:
      "Decided per member, per forum — and every way in, search and feeds included, obeys it.",
    doc: "operating",
    anchor: "permissions",
    link: "How permissions work",
  },
  {
    id: "themes",
    title: "It looks like your community",
    body:
      "Your colours, your crest, or a different theme entirely — never at the cost of it working.",
    doc: "theme-api",
    anchor: null,
    link: "How themes work",
  },
  {
    id: "plugins",
    title: "Add what you are missing",
    body:
      "Plugins stay in their lane. One that misbehaves fails on its own, and the board carries on.",
    doc: "plugin-api",
    anchor: null,
    link: "What plugins can do",
  },
  {
    id: "search",
    title: "Years of answers, still findable",
    body:
      "The archive stays quick however deep it gets, so an old answer keeps earning its keep.",
    doc: "performance",
    anchor: null,
    link: "How search holds up",
  },
  {
    id: "spam",
    title: "Bots stay out, people get in",
    body:
      "A trap only bots fall into, questions you write yourself, and no puzzle grids.",
    doc: "operating",
    anchor: "spam",
    link: "How the spam controls work",
  },
  {
    id: "chores",
    title: "Whoever runs it is not chained to it",
    body:
      "Backups, migrations, member admin — one command each, obeying the permissions a person has.",
    doc: "rest-api",
    anchor: null,
    link: "The API and the CLI",
  },
]

export function capabilitiesByIds(ids: readonly string[]): readonly Capability[] {
  return ids.map((id) => {
    const capability = capabilities.find((entry) => entry.id === id)
    if (!capability) {
      throw new Error(
        `No capability with id “${id}”. A segment in src/content/segments.ts names one that ` +
          `src/content/site.ts does not define. It defines: ` +
          `${capabilities.map((entry) => entry.id).join(", ")}.`,
      )
    }
    return capability
  })
}

export const terminal: {
  readonly cwd: string
  readonly lines: readonly { readonly text: string; readonly output?: boolean }[]
} = {
  cwd: "first deploy",
  lines: [
    { text: "✔ postgres  started", output: true },
    { text: "✔ migrate   exited (0)", output: true },
    { text: "✔ web       started", output: true },
    { text: "✔ worker    started", output: true },
    { text: "→ open /install to name the board", output: true },
  ],
}

export const openSource = {
  eyebrow: "Open source",
  heading: "Yours to run, and yours to keep.",
  body:
    "Free software under the GNU Lesser General Public License v3, on a machine you rent, at a " +
    "domain you own. No company in the middle, and nobody who can price it later or switch it off.",
  emphasis:
    "The bill follows the machine, never the membership: two hundred members cost what twenty do.",
  links: [
    { label: "Set one up", doc: "quickstart" },
    { label: "Deploying by hand", doc: "self-hosting" },
  ],
  licenceLink: "Read the licence",
} as const

export const memberships = {
  eyebrow: "Memberships",
  heading: "Take the subs online, and stop chasing them.",
  body:
    "Dues comes with the board: your own plans, sold through Stripe as a subscription, a pass or " +
    "a lifetime. Paying opens the members-only forum by itself, and lapses on its own.",
  emphasis: "The money is between you and Stripe. No cut, and no per-member fee.",
  link: "Read what Dues does",
} as const

export const extensible = {
  eyebrow: "Extensible",
  heading: "And the rest is yours to add.",
  lede:
    "Plugins add what you are missing, themes fill slots the board provides, and anything an " +
    "administrator can do by hand can be scripted.",
  counts(facts: Facts): readonly { readonly label: string; readonly value: string }[] {
    return [
      { label: "Theme slots", value: String(facts.theme.slots) },
      { label: "Plugin hooks", value: String(facts.plugins.hooks) },
      { label: "API endpoints", value: String(facts.api.endpoints) },
      { label: "Scopes on them", value: String(facts.api.scopes) },
    ]
  },
  links: [
    { label: "What plugins can do", doc: "plugin-api" },
    { label: "How themes work", doc: "theme-api" },
    { label: "The API and the CLI", doc: "rest-api" },
  ],
} as const

export const chooser = {
  eyebrow: "Who it's for",
  heading: "Find the version of this that is about you.",
  lede:
    "A club has fixtures and subs. A clan has a roster. Each gets a page of its own.",
} as const

export const closing = {
  heading: "Give your community somewhere to keep things.",
  body:
    "On a machine of your own, in about half an hour. Have a look at a real board first.",
  action: "Set one up",
  requirements: [
    { label: "A machine", value: "Your own, with Docker" },
    { label: "A domain", value: "Pointed at it" },
    { label: "Everything else", value: "Comes up beside it" },
  ],
} as const

export const footer = {
  note:
    "the board, its plugins and the compose file all carry this number, so an upgrade " +
    "moves them together.",
  links: [
    { label: "What changed", href: `${site.repository}/releases` },
    { label: "How upgrades work", doc: "upgrading" },
    { label: "Report a problem", href: `${site.repository}/issues` },
  ],
} as const
