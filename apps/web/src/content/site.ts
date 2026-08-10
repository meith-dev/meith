import { compact } from "../format"
import type { Facts } from "./facts"

export const site = {
  name: "Meith",
  domain: "meith.dev",
  url: "https://meith.dev",
  demo: "https://demo.meith.dev",
  repository: "https://github.com/meith-dev/meith",
  tagline: "Open-source community software you run on your own server.",
  description:
    "Meith is open-source community software for people who want to own where they " +
    "gather. One Postgres database and nothing else, permissions resolved per member per " +
    "community, typed theme and plugin APIs, and no third-party script between your members " +
    "and their board.",
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
  badge: `${licence.short} · Self-hosted · Postgres`,
  headline: { before: "Open-source community software ", emphasis: "where your people gather." },
  lede:
    "The internet used to feel like a neighbourhood. Today it more often feels like a " +
    "fragmented crowd. Meith is community software for putting the neighbourhood back — " +
    "open source, self-hostable, and built for communities that have work to do together.",
  primary: "Start a board",
  secondary: "View live demo",
  assurance: "No hosted captcha, and no third-party script between your members and your board.",
} as const

export const terminal: {
  readonly cwd: string
  readonly lines: readonly { readonly text: string; readonly output?: boolean }[]
} = {
  cwd: "~/boards",
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

export const boardPreview = {
  caption: "A board, in outline — its forums, what is in them, and the last thing said.",
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

export interface Benefit {
  readonly title: string
  readonly body: string
}

export const benefits: readonly Benefit[] = [
  {
    title: "Own the place",
    body:
      "Your board lives on your server, at your domain. No platform to change the rules " +
      "under you, rank the feed, or shut down and take the archive with it.",
  },
  {
    title: "Your members are nobody's product",
    body:
      "No ads, no trackers, no third-party scripts. What your members write stays on your " +
      "machine, and nothing about reading it is sold to anybody.",
  },
  {
    title: "Nothing said here gets lost",
    body:
      "Conversations live in threads, threads stay where they were put, and search reaches " +
      "back through all of it — this year's question finds an answer from years ago.",
  },
  {
    title: "Free, and staying that way",
    body:
      "Free software under the LGPL. Whatever anybody decides later, the version you run " +
      "stays free, forkable, and yours to keep.",
  },
]

export interface Capability {
  readonly title: string
  readonly body: string
  readonly doc: string
  readonly anchor: string | null
  readonly link: string
}

export const capabilities: readonly Capability[] = [
  {
    title: "A place for every kind of member",
    body:
      "Open forums for everyone, a members-only floor, a staff room nobody else sees. " +
      "Who can read, post, search or reply is decided per member, per forum — and every " +
      "way into the board, search and feeds included, respects the same rules.",
    doc: "operating",
    anchor: "permissions",
    link: "How permissions work",
  },
  {
    title: "A board that looks like your community",
    body:
      "Colours, layout, light and dark — restyle the whole board or install a different " +
      "theme entirely. A theme can only change how things look, never whether they work, so " +
      "a new coat of paint never costs you the board.",
    doc: "theme-api",
    anchor: null,
    link: "How themes work",
  },
  {
    title: "Add features without fear",
    body:
      "Plugins add what your community is missing — and stay in their lane. One that " +
      "misbehaves fails alone: the page renders, the thread posts, the board carries on " +
      "as if it had never been installed.",
    doc: "plugin-api",
    anchor: null,
    link: "What plugins can do",
  },
  {
    title: "Years of answers, still findable",
    body:
      "Search that understands a thread about your question beats a passing mention of it, " +
      "and stays quick however deep the archive goes. The answer somebody wrote years ago " +
      "keeps earning its keep.",
    doc: "performance",
    anchor: null,
    link: "How search holds up",
  },
  {
    title: "Bots stay out, people get in",
    body:
      "A trap only bots fall into, questions you write about your own community, and first " +
      "posts held for a quick look. No puzzle grids, and no third-party gatekeeper deciding " +
      "who is human enough to join.",
    doc: "operating",
    anchor: "spam",
    link: "How the spam controls work",
  },
  {
    title: "The chores run themselves",
    body:
      "Backups, migrations, member admin, scheduled tasks — everything you should not need " +
      "to click through a browser for is a command or an API call, safe to script because " +
      "it obeys the same permissions you do.",
    doc: "rest-api",
    anchor: null,
    link: "The API and the CLI",
  },
]

const HEADLINE_SCENARIO = "Thread, page 1"

export const performance = {
  eyebrow: "Built to stay quick",
  heading: "Reading never drags.",
  lede:
    "Long threads, deep pages, a search across everything ever written — pages come back " +
    "before anyone wonders whether the board is busy. And because it stays quick as the " +
    "archive grows, a decade of history is a feature of your board rather than a weight on it.",
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
      `Measured, not asserted: against a board of ${compact(facts.performance.posts)} posts, ` +
      `a thread page renders in ${thread.p95Ms} ms at the 95th percentile — and a run over ` +
      `its ${thread.budgetMs} ms budget fails the build.`
    )
  },
  link: "Every measurement, and how it was taken",
} as const

export const deployment = {
  eyebrow: "Where it runs",
  heading: "Your own server. Guided, or by hand.",
  lede:
    "Your community lives on a machine you control — which is the whole point, and less work " +
    "than it sounds. Four containers either way: Postgres, a one-shot migration the others " +
    "wait on, the web server, and the worker that runs the background tick.",
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
