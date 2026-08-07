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
 *
 * ## What changed, and why
 *
 * This copy used to be built around the meitheal — the Irish practice the
 * project is named for — and the page carried a band explaining it, a proverb in
 * Irish, and a headline ("Many hands, one field") that only made sense once you
 * had read both. It was well written and it was aimed at the wrong reader. The
 * person who lands here is deciding whether to run a piece of server software,
 * and the first screen has to answer what it is, what it needs, and whether it
 * holds up. The name still comes from where it comes from; the page no longer
 * opens with the etymology.
 */

import type { Facts } from "./facts"

export const site = {
  name: "Meith",
  domain: "meith.dev",
  url: "https://meith.dev",
  repository: "https://github.com/meith-dev/meith",
  tagline: "Open-source forum software you run on your own server.",
  description:
    "Meith is open-source forum software for communities that want to own where they " +
    "gather. One Postgres database and nothing else, permissions resolved per member per " +
    "forum, typed theme and plugin APIs, and no third-party script between your members " +
    "and their board.",
} as const

/**
 * The line the hero offers to copy, and the only place it is spelled out.
 *
 * It was `npx create-meith my-board` for as long as this page has existed, and
 * that command does not work: `create-meith` is not published, and the project
 * it scaffolds pins `@meith/web`, `@meith/cli` and `@meith/theme-default`, none
 * of which are on npm either. A copy button is a promise that what it hands you
 * runs, and the first thing anybody does with a landing page is paste the one
 * command on it — so this is the clone, which does.
 *
 * It goes back when the packages are published, and not before.
 */
export const installCommand = "git clone https://github.com/meith-dev/meith.git"

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
  /*
   * Three facts in a pill, above the headline. They are the three things a
   * reader has to know before the headline is worth reading — what the licence
   * is, whose machine it runs on, and what it will ask them to operate — and
   * every one of them is a question that otherwise sends somebody hunting
   * through a README.
   *
   * The first slot said "Open source", which the headline below now says in its
   * first two words: three lines apart, in the two largest treatments on the
   * page. Naming the licence spends that slot on something the headline cannot
   * carry, and it comes from `licence` rather than being retyped, so the pill
   * cannot claim a licence the repository does not ship.
   */
  badge: `${licence.short} · Self-hosted · Postgres`,
  /*
   * The emphasis is the claim, so it has to be worth the accent colour.
   *
   * This line used to read "Self-hosted forum software that *holds up*", and two
   * thirds of it repeated the pill directly above — leaving "holds up" as the
   * only argument in the headline, which is a hedge rather than a claim. At this
   * measure it also got a line to itself, so the vaguest words on the page were
   * set largest and coloured.
   *
   * What replaced it says where the software puts people rather than what it is.
   * "Gather" is `site.description`'s own verb, and is deliberately not
   * "connect" — the word every social network already uses about its groups, and
   * therefore the one word here that cannot tell a reader why they are on this
   * page rather than that one.
   *
   * The headline argues against nothing, and does not need to. The lede below it
   * makes the neighbourhood-against-crowd case in two sentences and makes it
   * better than five words can; a combative headline above that would be the
   * same point twice. Naming the category is not this line's job either —
   * `site.tagline` carries it into the description meta tag, the footer and
   * `llms.txt`, where the readers who need the plain sentence are.
   */
  headline: { before: "Open-source forum software ", emphasis: "where communities gather." },
  /*
   * Kept in full. This paragraph is the one piece of copy on the site that does
   * the actual arguing, and shortening it in the name of concision took the
   * argument out — "open-source forum software" is a description, and the
   * neighbourhood is the reason anybody would want one. What it no longer has to
   * carry is the etymology: the headline above it makes the claim, the badge
   * above that names the licence and the database, and this is free to say why.
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
   *
   * It used to end "nothing that needs a cookie banner", and that was false. A
   * board sets `meith_theme`, `meith_scheme` and a session cookie, and it ships a
   * consent notice — see `apps/forum/src/view/consent.ts`, which exists precisely
   * because the optional category (analytics, off until allowed) does need asking
   * about. The strictly-necessary ones are exempt under ePrivacy 5(3); the
   * optional one is not, and a marketing page is the last place that distinction
   * should be flattened into a boast.
   */
  assurance: "No hosted captcha, and no third-party script between your members and your board.",
} as const

/**
 * The install, as a transcript.
 *
 * The one illustration a piece of self-hosted software owes the reader: the
 * whole claim of the page is that this runs on a machine they already have, and
 * a shell transcript is that claim in the form the audience reads proof in. The
 * first line is `installCommand` rather than a copy of it, so the page cannot
 * show one command and offer another.
 */
export const terminal: {
  readonly cwd: string
  readonly lines: readonly { readonly text: string; readonly output?: boolean }[]
} = {
  cwd: "~/boards",
  /*
   * Every line is held to the width of the longest command above it. A
   * transcript that scrolls sideways is a transcript nobody reads the end of,
   * and the end is the part that says it worked.
   *
   * The four services are named rather than counted, because "four containers"
   * is the claim the paragraph beside this makes and these are what they are.
   */
  lines: [
    { text: installCommand },
    { text: "cd meith && cp .env.example .env" },
    { text: "docker compose up -d --build" },
    { text: "✔ db        started", output: true },
    { text: "✔ migrate   exited (0)", output: true },
    { text: "✔ web       started", output: true },
    { text: "✔ worker    started", output: true },
    { text: "→ open /install to name the board", output: true },
  ],
}

/**
 * The illustration beside the headline.
 *
 * A drawing of a board rather than a screenshot: it says what the software is in
 * the half-second before anybody reads a word, and being a drawing it cannot go
 * stale against a theme somebody changed. The caption says as much, because a
 * picture of an interface implies a screenshot unless it tells you otherwise.
 */
export const boardPreview = {
  caption: "A board, in outline — forums, what is in them, and the last thing said.",
  name: "Workshop",
  blurb: "community board",
  forums: [
    { title: "Announcements", blurb: "Releases, and what changed.", threads: 96, posts: 1_204 },
    { title: "Build logs", blurb: "Work in progress, in public.", threads: 1_204, posts: 18_332 },
    { title: "Help & support", blurb: "Ask, answer, search first.", threads: 2_891, posts: 21_470 },
  ],
  latest: {
    thread: "Migrating a 12-year MyBB archive",
    forum: "Help & support",
    when: "4 min ago",
  },
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
      value: `${thread.p95Ms} ms`,
      label: `p95 for a thread page, against a ${thread.budgetMs} ms budget`,
    },
    {
      value: "~45",
      label: "permission fields, resolved per member per forum",
    },
    {
      value: `${theme.slots}`,
      label: `theme slots, ${theme.stable} of them frozen until v2`,
    },
    {
      value: `${plugins.hooks}`,
      label: `plugin hooks, and ${api.endpoints} endpoints on the REST API`,
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
  heading: "Your own server. Guided, or by hand.",
  lede:
    "Four containers either way: Postgres, a one-shot migration the others wait on, the web " +
    "server, and the worker that runs the background tick.",
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
        "The same four containers without the panel: a clone, an .env with three generated " +
        "secrets, one command, and a reverse proxy you already run. The advanced route, and the " +
        "one the transcript above is running.",
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

export const documentation = {
  eyebrow: "Documentation",
  heading: "Organised by what you are trying to do.",
  lede:
    "Four of the references are generated from the code they describe, and one that " +
    "disagrees with your board fails the build rather than misleading you. Every page is " +
    "rendered from the Markdown in the repository — there is no second copy to fall behind.",
} as const

export const closing = {
  heading: "Start a board this afternoon.",
  body:
    "A board of your own, on a machine of your own, in about half an hour. Read the source " +
    "before you run it — all of it is there.",
  /*
   * What you actually need, beside the ask. Three rows rather than a paragraph,
   * because this is the question somebody has at exactly this point on the page
   * and the answer is short enough to be a list.
   */
  requirements: [
    { label: "A machine", value: "Your own, with Docker" },
    { label: "A domain", value: "Pointed at it" },
    { label: "Everything else", value: "Comes up beside it" },
  ],
} as const

/**
 * The colophon describes *this site*, not a board — which is the distinction the
 * line it replaces got wrong.
 *
 * This site has no analytics and sets no cookie at all: the colour scheme goes to
 * `localStorage` (see `theme-storage.ts`), which is why it can say so plainly. A
 * board is a different piece of software with different obligations, and it has
 * its own consent notice for the one thing that needs one.
 */
export const footer = {
  colophon:
    "Rendered from the Markdown in the repository. No analytics and no third-party scripts — " +
    "the only thing this site stores is the colour scheme you pick, in your own browser.",
} as const
