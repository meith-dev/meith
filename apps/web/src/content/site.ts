import type { Facts } from "./facts"

export const site = {
  name: "Meith",
  domain: "meith.dev",
  url: "https://meith.dev",
  repository: "https://github.com/meith-dev/meith",
  tagline: "Forum software for communities that want to build something together.",
  description:
    "Meith is open-source forum software named for the meitheal: neighbours coming " +
    "together for a shared task. Runs on your own server — guided by Coolify, or " +
    "straight from the compose file.",
} as const

export const installCommand = "git clone https://github.com/meith-dev/meith.git"

export const licence = {
  spdx: "LGPL-3.0-or-later",
  short: "LGPL-3.0",
  name: "GNU Lesser General Public License v3",
  file: "LICENSE.md",
  incorporates: "COPYING",
} as const

export const licenceHref = `${site.repository}/blob/main/${licence.file}`

export const hero = {
  eyebrow: "Open source, LGPL-3.0 · runs on your own server · Postgres",
  headline: { before: "Many hands, ", emphasis: "one field." },
  lede:
    "The internet used to feel like a neighbourhood. Today it more often feels like a " +
    "fragmented crowd. Meith is forum software for putting the neighbourhood back — " +
    "open source, self-hostable, and built for communities that have work to do together.",
  primary: "Start a board",
  secondary: "Read the docs",
  assurance:
    "No hosted captcha, no third-party script between your members and your board.",
} as const

export const boardSketch = {
  caption: "A board, in outline. Forums, what is in them, and the last thing said.",
  name: "An Baile",
  blurb: "community board",
  forums: [
    { title: "Introductions", blurb: "Say hello, and what you make.", threads: 412, posts: 3_180 },
    { title: "Build logs", blurb: "Work in progress, in public.", threads: 1_204, posts: 18_332 },
    { title: "Tools & swaps", blurb: "Lend, borrow, hand on.", threads: 289, posts: 2_047 },
  ],
  latest: { thread: "Anyone got a spare tenon saw?", forum: "Tools & swaps", when: "4 min ago" },
} as const

export interface Stat {
  readonly value: string
  readonly label: string
}

const HEADLINE_SCENARIO = "Thread, page 1"

export function proof(facts: Facts): readonly Stat[] {
  const { performance, theme, plugins, api } = facts
  const thread = performance.scenarios.find((scenario) => scenario.page === HEADLINE_SCENARIO)

  if (!thread) {
    throw new Error(
      `docs/performance.md no longer measures “${HEADLINE_SCENARIO}”, which the landing page ` +
        "leads with. Name a scenario it does measure, here in src/content/site.ts.",
    )
  }

  return [
    {
      value: "~45",
      label: "permission fields, resolved per member per forum",
    },
    {
      value: `${thread.p95Ms} ms`,
      label: `p95 for a thread page, against a ${thread.budgetMs} ms budget`,
    },
    {
      value: `${theme.slots} slots`,
      label: `a theme may fill, ${theme.stable} of them frozen until v2`,
    },
    {
      value: `${plugins.hooks} hooks`,
      label: `a plugin may listen on, and ${api.endpoints} endpoints on the REST API`,
    },
  ]
}

export interface Capability {
  readonly title: string
  readonly body: string
  readonly doc: string
  readonly anchor: string | null
  readonly link: string
}

export const capabilities: readonly Capability[] = [
  {
    title: "Permissions that mean it",
    body:
      "Around 45 fields, resolved per member per forum rather than by a three-tier guess. " +
      "Search, feeds and the API all ask the same authorizer, so there is no path that " +
      "quietly reads around the rules.",
    doc: "operating",
    anchor: "permissions",
    link: "How permissions work",
  },
  {
    title: "Themes that cannot break the board",
    body:
      "A theme fills a frozen set of slots and is handed a view model. It cannot reach past " +
      "that contract, which is what makes it replaceable rather than a fork you maintain " +
      "against every release.",
    doc: "theme-api",
    anchor: null,
    link: "The theme contract",
  },
  {
    title: "Plugins whose failures stay theirs",
    body:
      "Typed hooks behind a boundary that holds. A filter that throws leaves the value as it " +
      "was and the chain carries on; a plugin cannot take a page down with it, and the " +
      "reference plugin is tested against every hook that fires.",
    doc: "plugin-api",
    anchor: null,
    link: "What a plugin may do",
  },
  {
    title: "Search that does not fall over",
    body:
      "Postgres full text, weighted so a thread's subject beats a passing mention, and paged " +
      "on a keyset so a deep page costs what the first one did. Results never repeat and " +
      "never skip.",
    doc: "performance",
    anchor: null,
    link: "What it measures",
  },
  {
    title: "Spam controls that fail open",
    body:
      "A hidden-field trap, a fill-time floor, questions you write yourself, held first posts, " +
      "and hourly limits counted in the database so every instance shares one allowance. A " +
      "challenge with nothing configured does nothing rather than refusing everybody.",
    doc: "operating",
    anchor: "spam",
    link: "What each control is worth",
  },
  {
    title: "An API, and a CLI for the rest",
    body:
      "A token is a restriction on an actor, never a grant to one: it resolves the owner's " +
      "permissions on every call. Everything you should not need a browser for — migrations, " +
      "users, settings, scheduled tasks, reindexing — is a command.",
    doc: "rest-api",
    anchor: null,
    link: "Every endpoint and scope",
  },
]

export const performance = {
  eyebrow: "Measured, not asserted",
  heading: "Numbers from a board the size of a real one.",
  lede:
    "The load runner drives a board the size of one that has been busy for years, and records " +
    "the p95 of every page traffic actually goes to. The budgets are enforced: a run over one " +
    "fails the build, so these are the numbers the software is held to rather than its best day.",
  featured: [
    "Thread, page 1",
    "Thread, deep page",
    "Forum, page 1",
    "Permission filter",
    "Search, near-universal term",
  ],
  aside:
    "The absolute numbers belong to that machine. What travels is the shape — a deep page " +
    "costs what a first page does, because paging is a keyset and not an OFFSET.",
  link: "Every scenario, and why",
} as const

export const deployment = {
  eyebrow: "Where it runs",
  heading: "Your own server. Guided, or by hand.",
  options: [
    {
      title: "Guided, with Coolify",
      body:
        "A panel you install on the same server — still your machine, not a service. Point it " +
        "at the repository and it generates both secrets and the database password, issues the " +
        "certificate, tells the board its own URL, and redeploys on push. Nothing is typed in.",
      note: "About twenty minutes, start to finish.",
      action: { label: "The quickstart", doc: "quickstart" },
    },
    {
      title: "Or by hand, if you would rather",
      body:
        "The same four containers without the panel: Postgres, a one-shot migration the others " +
        "wait on, the web server, and the worker that runs the tick. A clone, a `.env`, one " +
        "command, and a reverse proxy you already run. The advanced route.",
      note: "Postgres and nothing else — no Redis, no broker, no search cluster.",
      action: { label: "Deploying by hand", doc: "self-hosting" },
    },
  ],
  link: "The operator handbook",
} as const

export const migration = {
  eyebrow: "Coming from MyBB",
  heading: "A way out that does not lose the archive.",
  body:
    "The importer is resumable, so a board with a decade of history can be moved across " +
    "several sessions rather than one long night. Old URLs redirect, so every link anybody " +
    "ever posted to your board still lands.",
  emphasis:
    "And every place a Meith board behaves differently from the one you are leaving is " +
    "written down, with the reason — read it before you promise anyone a like-for-like move.",
  link: "The parity decisions",
} as const

export const licensing = {
  eyebrow: "The licence",
  heading: "Yours to keep.",
  body:
    "Meith is free software under the GNU Lesser General Public License v3. Run a board on it " +
    "for anything, commercially included, without publishing a line of your configuration or a " +
    "word your members wrote.",
  points: [
    {
      title: "Themes and plugins are yours",
      body:
        "Both fill an interface this software provides, which is the case the Lesser GPL exists " +
        "to allow. License yours however you like — it is not obliged to be LGPL because the " +
        "board it runs in is.",
    },
    {
      title: "Changes to Meith come back",
      body:
        "Modify the board itself and those changes carry the same licence to whoever you hand " +
        "the modified version to. That is the copyleft, and it is the whole of what is asked.",
    },
  ],
  emphasis:
    "Which is the point of choosing it: the version you are running stays free software " +
    "whatever anybody decides later, and anybody can carry it on.",
  link: "Read the licence",
  note:
    "LGPLv3 is additional permissions on top of the GNU GPL, which it incorporates. Both texts " +
    "are in the repository, and both travel with any copy you pass on.",
} as const

export const story = {
  eyebrow: "The name",
  lead: {
    before: "A ",
    term: "meitheal",
    after:
      " is the old Irish practice of neighbours gathering to get one household's work " +
      "done, then moving on to the next.",
  },
  paragraphs: [
    "Nobody is paid and nobody keeps a ledger. Expertise is shared freely, the heavy " +
      "lifting is distributed across everyone who turned up, and the community comes out " +
      "of it stronger than the day's work alone would explain.",
    "That is a forum, described before there were any. Meith is somewhere to do it on the " +
      "internet — software you can hold the keys to, for a group of people who have " +
      "something to get done together.",
  ],
  proverb: "Ar scáth a chéile a mhaireann na daoine.",
  translation: "People live in one another's shelter.",
} as const

export const documentation = {
  eyebrow: "Documentation",
  heading: "Organised by what you are trying to do.",
  lede:
    "Four of the references are generated from the code they describe, and one that " +
    "disagrees with your board fails the build rather than misleading you. Every page is " +
    "rendered from the Markdown in the repository — there is no second copy to fall behind.",
} as const

export const closing = {
  heading: "Put the neighbourhood back.",
  body:
    "A board of your own, on a machine of your own, in about half an hour. Read the source " +
    "before you run it — all of it is there.",
  requirements: [
    { label: "A machine", value: "Your own, with Docker" },
    { label: "A domain", value: "Pointed at it" },
    { label: "Everything else", value: "Comes up beside it" },
  ],
} as const

export const footer = {
  colophon:
    "Rendered from the Markdown in the repository. No analytics, no third-party script, " +
    "nothing that needs a cookie banner.",
} as const
