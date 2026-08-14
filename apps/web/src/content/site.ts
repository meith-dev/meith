import type { Facts } from "./facts"

export const site = {
  name: "Meith",
  // What the header shows. `url` is what canonical links, the sitemap and
  // robots.txt are built from, and it has to be the host that answers rather
  // than the one that redirects to it.
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

/*
 * ── The photographs ───────────────────────────────────────────────────────
 *
 * Every image on this site is a real page of a real board, captured by
 * `pnpm site:shots` from the demo seed. The names are a contract with
 * `e2e/screenshot-site.spec.ts`, which writes them.
 *
 * This registry exists because the page used to argue in prose what it could
 * simply show. "It looks like your community, not like software" is a
 * sentence a reader has no reason to believe; five screenshots of the same
 * board in five themes is not an argument at all, which is why it is better.
 *
 * Dimensions are recorded so the browser reserves the right box before the
 * image lands. They are the capture size — a desktop shot is 1280×820 at two
 * device pixels to the CSS pixel, which is what stops it looking soft.
 */
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
  /*
   * It says what the thing is, in the first four words, in the words somebody
   * would use to describe it to a friend.
   *
   * This is a reversal. The page used to open on a failure — "The group chat
   * forgets" — on the argument that nobody searches for a category. That is
   * true of search and false of a visitor who has already arrived: somebody
   * landing here from a link deserves to know what they are looking at before
   * they are told what is wrong with their life. The five `/for/*` pages are
   * where the search intent is served, and they still open on the failure.
   */
  headline: { before: "A community forum,", emphasis: "on a server of your own." },
  lede:
    "Somewhere your members talk, and somewhere anybody can find what was said afterwards. " +
    "Threads stay put, search reaches back years, and no algorithm decides who sees what.",
  primary: "See a live board",
  secondary: "Set one up",
  caption: "A real board, photographed. Every picture on this page is one.",
} as const

/*
 * Point two of eight, and the only one with no copy at all.
 *
 * "Works on mobile" is a claim; a phone standing in front of a desktop is the
 * demonstration, and a reader has taken it in before they could have read a
 * sentence about it. Writing one would only invite the doubt.
 */
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
  /*
   * The one measurement the page quotes, and it is quoted because search is
   * the claim most obviously worth doubting: an archive that is slow to search
   * is an archive nobody searches. Read from `docs/performance.md`, which is
   * generated by the load harness — so a page that quotes a figure the
   * documentation stopped stating fails the build rather than going stale.
   */
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

/*
 * ── The five themes ───────────────────────────────────────────────────────
 *
 * Every one of these ships in this repository and every one of these
 * screenshots is the same board on the same afternoon. That is the whole
 * point: a theme changes what a board looks like and nothing else, and five
 * pictures of one board prove it in a way no sentence can.
 *
 * `key` is the theme's own key, so the shot it names is the shot
 * `e2e/screenshot-site.spec.ts` took of it.
 */
export interface ThemeShowcase {
  readonly key: string
  readonly title: string
  readonly blurb: string
  readonly light: Shot
  readonly dark: Shot
}

/*
 * Both schemes, always. A theme here is two sets of tokens rather than one —
 * a colour that reads on paper-white disappears at midnight, and every theme
 * in this repository is built with both in mind. Showing one would be showing
 * half of each theme, and quite possibly the half the reader is not in.
 */
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

/*
 * The pair of shots for one theme, by key.
 *
 * Every segment page shows the board in the theme that suits its audience — a
 * club sees Clubhouse, a clan sees Raidframe — so that a reader arriving from
 * a search sees something that looks like it was made for them rather than a
 * generic board with their name written over it.
 */
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

/*
 * ── Alongside, not instead ────────────────────────────────────────────────
 *
 * The section that removes the objection every other section has to work
 * around: nobody is abandoning their group chat, and a page that implies they
 * should is a page a committee votes down.
 *
 * Two lists of things a reader recognises, and no argument between them. The
 * lede used to run to forty-five words explaining what the columns were about
 * to demonstrate; the columns did not need the help.
 */
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

/*
 * The six capabilities, each carrying an id so a segment page can pick the
 * four that matter to it and put them in its own order. A club leads on the
 * committee room; a gaming clan leads on what an applicant can read before
 * they join. Same six facts, different argument.
 *
 * Each body is one sentence now rather than three. The cards are a list of
 * what is here, not six essays — the link at the foot of each is where the
 * argument lives, and that was always the deal.
 */
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

/*
 * ── Open source, your server, no fees ─────────────────────────────────────
 *
 * One band where there used to be three, running to five hundred and twenty
 * words between them: a deployment section with two routes and a cost note, a
 * licence section with a two-point explainer, and a migration note.
 *
 * Three facts survive, because they are the three a reader actually decides
 * on: it is free software, it runs on a machine of yours, and the bill follows
 * the machine rather than the membership. The Coolify-or-by-hand split and the
 * LGPL explainer were duplicating `docs/quickstart.md`,
 * `docs/self-hosting.md` and the licence itself, all of which are one click
 * away and none of which were improved by being summarised here.
 */
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

/*
 * The last of the eight, and the one that earns its place by counting rather
 * than claiming. Every figure here is read out of the documentation at build
 * time by `src/content/facts.ts`, and that documentation is generated from the
 * code it describes — so a strip that says ninety-three hooks says it because
 * there are ninety-three hooks.
 */
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
  colophon:
    "Rendered from the Markdown in the repository. No analytics and no third-party scripts — " +
    "the only thing this site stores is the colour scheme you pick, in your own browser.",
} as const
