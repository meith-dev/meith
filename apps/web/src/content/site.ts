/**
 * Everything the marketing pages say, in one file.
 *
 * The landing page, the metadata, the footer and the docs shell all read from
 * here rather than carrying their own copy of a headline or an install command.
 * The reason is the one that motivated this whole app: the install command
 * previously appeared four times — in `README.md`, twice in `site/index.html`,
 * and in `docs/operating.md` — and there was no way to change it once.
 *
 * Two things are deliberately *not* here.
 *
 * Documentation prose lives in `docs/` at the workspace root and is rendered
 * from those files; see `src/docs/registry.ts`.
 *
 * Figures that the code already counts — slots, hooks, endpoints, measured p95s
 * — live in `facts.ts`, which reads them out of the generated references at
 * build time. A number typed into this file is a number that goes quietly wrong;
 * everything below is a *sentence*, and the sentences that quote a figure take it
 * as an argument.
 */

import type { Facts } from "./facts"

export const site = {
  name: "Meith",
  domain: "meith.dev",
  url: "https://meith.dev",
  repository: "https://github.com/meith-dev/meith",
  tagline: "Forum software for communities that want to build something together.",
  description:
    "Meith is open-source forum software named for the meitheal: neighbours coming " +
    "together for a shared task. Run it on a server you rent — guided by Coolify, or " +
    "from the compose file — for about €4 a month.",
} as const

/** The line the hero offers to copy, and the only place it is spelled out. */
export const installCommand = "npx create-meith my-board"

/**
 * The licence, and where to read it.
 *
 * Every link from this site goes to `LICENSE.md`, which is the LGPLv3 text
 * itself. `COPYING` is named alongside it wherever there is room, because LGPLv3
 * is not a standalone licence — it is a set of additional permissions on top of
 * the GNU GPL, which it incorporates by reference — so a reader who has only the
 * Lesser text has permissions modifying a document they have not got.
 */
export const licence = {
  spdx: "LGPL-3.0-or-later",
  short: "LGPL-3.0",
  name: "GNU Lesser General Public License v3",
  /** The licence text, and where every link on this site points. */
  file: "LICENSE.md",
  /** The GPL text it incorporates, which travels with it. */
  incorporates: "COPYING",
} as const

export const licenceHref = `${site.repository}/blob/main/${licence.file}`

export const hero = {
  eyebrow: "Open source, LGPL-3.0 · self-hosted on your own server · Postgres",
  headline: { before: "Many hands, ", emphasis: "one field." },
  /*
   * Kept in full. This paragraph is the one piece of copy on the site that does
   * the actual arguing, and shortening it in the name of concision took the
   * argument out — "open-source forum software" is a description, and the
   * neighbourhood is the reason anybody would want one.
   */
  lede:
    "The internet used to feel like a neighbourhood. Today it more often feels like a " +
    "fragmented crowd. Meith is forum software for putting the neighbourhood back — " +
    "open source, self-hostable, and built for communities that have work to do together.",
  primary: "Start a board",
  secondary: "Read the docs",
  /*
   * The one line of small print in the hero, and it is a claim rather than a
   * disclaimer: no hosted captcha is a decision about your members, and it is the
   * thing every other board asks you to accept without mentioning.
   */
  assurance:
    "No hosted captcha, no third-party script between your members and your board.",
} as const

/**
 * The illustration beside the headline.
 *
 * A drawing of a board rather than a screenshot: it says what the software is in
 * the half-second before anybody reads a word, and being a drawing it cannot go
 * stale against a theme somebody changed. The caption says as much, because a
 * picture of an interface implies a screenshot unless it tells you otherwise.
 */
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

/** The one measurement the page leads with, named as the reference names it. */
const HEADLINE_SCENARIO = "Thread, page 1"

/**
 * The four figures under the hero.
 *
 * Every one is read out of a document a script wrote from the code, which is
 * what makes them worth printing: a performance number on a marketing page is
 * usually the best one anybody ever measured, and this one is regenerated by
 * `pnpm perf` and fails the build when it is stale.
 */
export function proof(facts: Facts): readonly Stat[] {
  const { performance, theme, plugins, api } = facts
  const thread = performance.scenarios.find((scenario) => scenario.page === HEADLINE_SCENARIO)

  /*
   * A build failure rather than an em dash. A stat tile that quietly renders
   * "—" is the exact outcome reading these figures out of the references was
   * meant to prevent: the page still looks finished, and the number nobody can
   * see is the one that was supposed to be the argument.
   */
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

/**
 * What the board does, in six.
 *
 * Six rather than the seven the README lists, and each one names the failure it
 * is a fix for. A capability list that says "powerful permissions" is a list
 * nobody believes; one that says which page pays the cost, and what happens when
 * it is wrong, can be checked.
 */
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

/**
 * Getting to a board.
 *
 * The steps are the quickstart's, in its order, and the transcript is the same
 * five lines the README opens with. Both are here rather than written twice: the
 * page is a pointer at that document, not a second copy of it.
 */
export const install = {
  eyebrow: "Ten minutes",
  heading: "An empty directory to a board people can post on.",
  lede:
    "You need Node 22 or newer and a Postgres you can connect to. Nothing else — no " +
    "container to build first, no account to open, no key to wait for.",
  transcript: [
    "npx create-meith my-board",
    "cd my-board",
    "npm install",
    "cp .env.example .env.local   # DATABASE_URL, AUTH_SECRET",
    "npm run dev",
  ],
  steps: [
    {
      title: "Open /install",
      body:
        "The installer checks your environment before it offers you a form, and separates " +
        "what blocks the install from what will be wrong later.",
    },
    {
      title: "Five named steps",
      body:
        "Migrations, the board's name, your administrator account, a first forum, and then it " +
        "disables itself. A failure stops at the step that failed and says which.",
    },
    {
      title: "Then configure mail",
      body:
        "A board that has never had MAIL_DRIVER set sends no mail at all — the default writes " +
        "each message to the log. Two variables and one setting fix it, before you invite anybody.",
    },
  ],
  note:
    "Sealing the installer is deliberately last and cannot be undone: /install answers 404 " +
    "from then on. Run it against the database you are going to keep.",
  link: "The quickstart, in full",
} as const

/**
 * The measurements.
 *
 * Named by the scenario the reference names, so a scenario dropped from the load
 * runner fails this page rather than silently disappearing from it.
 */
export const performance = {
  eyebrow: "Measured, not asserted",
  heading: "Numbers from a board the size of a real one.",
  /*
   * No figures in this sentence on purpose. The size of the benchmark board and
   * the date it was measured are printed beside the table, from `facts.ts` —
   * writing "two and a third million posts" here would be a number nobody
   * regenerates, sitting directly above four that are regenerated every run.
   */
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

/**
 * Where it runs, and the shorter list this became.
 *
 * There were two options here and one of them was serverless. It went, and the
 * reason is worth keeping written down: a board needs a scheduler that goes off
 * every minute, a disk that survives a restart, and a process that outlives a
 * request. A server gives you all three by existing. A function gives you none,
 * and the third cannot be bought — so offering it as a route meant offering a
 * board that half worked, to the readers least equipped to notice which half.
 *
 * What is left is one route in two shapes — a panel on your own server, or the
 * compose file run by you — because "self-hosted" reads as "and you are on your
 * own with the certificate", and for one of these that is simply not true.
 */
export const deployment = {
  eyebrow: "Where it runs",
  heading: "A server you rent. Guided, or by hand.",
  options: [
    {
      title: "Guided, with Coolify",
      body:
        "A panel you install on the same server — still your machine, not a service. Point it " +
        "at the repository and it generates both secrets and the database password, issues the " +
        "certificate, tells the board its own URL, and redeploys on push. Nothing is typed in.",
      note: "About twenty minutes, from €4 a month.",
      action: { label: "Deploy it with Coolify", doc: "self-hosting" },
    },
    {
      title: "Or the compose file, directly",
      body:
        "Four containers: Postgres, a one-shot migration the others wait on, the web server, " +
        "and the worker that runs the background tick. A clone, a `.env`, one command, and a " +
        "reverse proxy you already run.",
      note: "Postgres and nothing else — no Redis, no broker, no search cluster.",
      action: { label: "Deploy it yourself", doc: "self-hosting" },
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

/**
 * The licence, as an argument rather than a footnote.
 *
 * It earns a band of its own because for this audience it is not boilerplate.
 * Anybody who has run a community for long enough has watched the software
 * underneath it get bought, relicensed or shut down, and "which licence" is a
 * question they ask early and are usually made to hunt for.
 *
 * The claim in `emphasis` is stated the careful way on purpose. Copyleft does
 * not stop a copyright holder relicensing what they publish *next*; what it
 * guarantees is that the version already released stays free and stays forkable,
 * which is the assurance actually being offered.
 */
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
  /*
   * Stated rather than left implicit. Somebody who opens the Lesser text alone
   * finds a document that modifies another one, and it is not obvious from
   * inside it where that other one is.
   */
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
    "A board of your own, on a database of your own, in about ten minutes. Read the source " +
    "before you run it — all of it is there.",
  /*
   * What you actually need, beside the ask. Three rows rather than a paragraph,
   * because this is the question somebody has at exactly this point on the page
   * and the answer is short enough to be a list.
   */
  requirements: [
    { label: "Runtime", value: "Node 22 or newer" },
    { label: "Database", value: "Postgres, anywhere" },
    { label: "Everything else", value: "Nothing" },
  ],
} as const

export const footer = {
  colophon:
    "Rendered from the Markdown in the repository. No analytics, no third-party script, " +
    "nothing that needs a cookie banner.",
} as const
