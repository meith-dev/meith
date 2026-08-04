/**
 * Everything the marketing pages say, in one file.
 *
 * The landing page, the metadata, the footer and the docs shell all read from
 * here rather than carrying their own copy of a headline or an install command.
 * The reason is the one that motivated this whole app: the install command
 * previously appeared four times — in `README.md`, twice in `site/index.html`,
 * and in `docs/operating.md` — and there was no way to change it once.
 *
 * Documentation prose is deliberately *not* here. That lives in `docs/` at the
 * workspace root and is rendered from those files; see `src/docs/registry.ts`.
 */

export const site = {
  name: "Meith",
  domain: "meith.dev",
  url: "https://meith.dev",
  repository: "https://github.com/meith-dev/meith",
  tagline: "Forum software for communities that want to build something together.",
  description:
    "Meith is open-source forum software named for the meitheal: neighbours coming " +
    "together for a shared task. Self-host it or deploy it serverlessly.",
} as const

/** The line the hero offers to copy, and the only place it is spelled out. */
export const installCommand = "npx create-meith my-board"

export const hero = {
  headline: { before: "Many hands, ", emphasis: "one field." },
  lede:
    "The internet used to feel like a neighbourhood. Today it more often feels like a " +
    "fragmented crowd. Meith is forum software for putting the neighbourhood back — " +
    "open source, self-hostable, and built for communities that have work to do together.",
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
      "of it stronger than the day's work alone would explain. The field gets cut because " +
      "the whole townland is standing in it.",
    "Meith is the digital infrastructure for doing exactly that. Whether your people are " +
      "filling a regional networking gap, building open-source software, or keeping a " +
      "niche hobby alive, Meith gives them somewhere to gather and grow.",
  ],
} as const

/**
 * What a board gets. Each one names the document that explains it, so a reader
 * who wants the detail is one click from it rather than one search away.
 */
export const capabilities = [
  {
    title: "Permissions that mean it",
    body:
      "Around 45 permission fields, resolved per member per forum. Search, feeds and the " +
      "API all answer to the same model, so there is no path that quietly reads around it.",
    doc: "operating",
    anchor: "permissions",
  },
  {
    title: "Themes that can't break the board",
    body:
      "A frozen slot contract with a generated reference. A theme fills slots — it cannot " +
      "reach past them, so upgrading is not a merge conflict with your own design.",
    doc: "theme-api",
    anchor: null,
  },
  {
    title: "Plugins with contained failures",
    body:
      "Typed hook payloads and a boundary that holds. A plugin that throws gets logged and " +
      "stepped over; it does not take the page down with it.",
    doc: "plugin-api",
    anchor: null,
  },
  {
    title: "Search that ranks properly",
    body:
      "Postgres full text, weighted so a thread's subject beats a passing mention in a long " +
      "reply, and paged on a keyset so results never repeat or skip.",
    doc: "performance",
    anchor: null,
  },
  {
    title: "Spam controls that fail open",
    body:
      "A honeypot, a fill-time floor, questions you write yourself, held first posts and " +
      "hourly limits counted in the database — so every instance shares one allowance. No " +
      "third party meets your members before you do.",
    doc: "operating",
    anchor: "spam",
  },
  {
    title: "A way off MyBB",
    body:
      "A resumable importer. Point it at the old database, and run it again if it stops — a " +
      "decade-old board can come across in several sittings.",
    doc: "mybb-parity",
    anchor: null,
  },
  {
    title: "An operator CLI",
    body:
      "Migrations, users, settings, scheduled tasks, search reindexing. Everything you should " +
      "not need a browser and an admin login to do.",
    doc: "operating",
    anchor: "migrations",
  },
] as const

export const deployment = {
  eyebrow: "Running it",
  heading: "Serverless or your own machine. Both are first class.",
  options: [
    {
      title: "Deploy it",
      body:
        "Push to Vercel with a pooled Postgres. The scheduled tick is already wired in the " +
        "generated config, so background work runs without a server you have to babysit.",
    },
    {
      title: "Host it",
      body:
        "One standalone Docker image running three roles — web, worker, migrations — so they " +
        "cannot drift apart. Your data stays on hardware you can point at.",
    },
  ],
} as const

/** The install sequence. Four steps because `/install` is the fourth thing. */
export const quickStart = {
  eyebrow: "Quick start",
  heading: "Four steps to a board.",
  steps: [
    {
      title: "Scaffold it.",
      command: installCommand,
      body: "A project of your own, with the deploy config and environment template already in place.",
    },
    {
      title: "Point it at a database.",
      command: "cp .env.example .env.local",
      body:
        "Fill in DATABASE_URL and AUTH_SECRET. Any Postgres will do — on serverless, use the " +
        "transaction pooler.",
    },
    {
      title: "Open /install.",
      command: null,
      body:
        "The preflight check runs first and reports what it found before offering you a form. " +
        "Read it: nearly every way a new board fails is visible there.",
    },
    {
      title: "Name it, and open the doors.",
      command: null,
      body:
        "Migrations, your administrator account and a first forum. Then the installer disables " +
        "itself, permanently.",
    },
  ],
  transcript: [
    { command: "npx create-meith my-board", note: null },
    { command: "cd my-board && npm install", note: null },
    { command: "cp .env.example .env.local", note: "DATABASE_URL, AUTH_SECRET" },
    { command: "npm run dev", note: "then open /install" },
  ],
} as const

export const footer = {
  proverb: "Ar scáth a chéile a mhaireann na daoine.",
  translation: "People live in one another's shelter.",
} as const
