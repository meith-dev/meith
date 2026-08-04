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
    "Open-source forum software for communities that have work to do together. " +
    "Self-hosted or serverless, on a database you own.",
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
      "of it stronger than the day's work alone would explain. Meith is somewhere to do " +
      "that on the internet.",
  ],
} as const

/**
 * The three claims the landing page makes.
 *
 * Three, because a page that argues seven points is a page nobody finishes. Each
 * one names the document that backs it up, so the assertion is one click from
 * its evidence — and the page never has to become the argument.
 */
export const headlines = [
  {
    title: "Permissions that mean it",
    body:
      "Around 45 permission fields, resolved per member per forum. Search, feeds and the API " +
      "all answer to the same model, so nothing quietly reads around it.",
    doc: "operating",
    anchor: "permissions",
    link: "How permissions work",
  },
  {
    title: "Themes and plugins that can't break it",
    body:
      "A theme fills a frozen set of slots; a plugin listens on typed hooks behind a boundary " +
      "that holds. Neither can reach past its contract, so upgrading is not a merge conflict.",
    doc: "theme-api",
    anchor: null,
    link: "The theme contract",
  },
  {
    title: "A way off MyBB",
    body:
      "A resumable importer, legacy URL redirects, and a written account of every place this " +
      "board behaves differently from the one you are leaving.",
    doc: "mybb-parity",
    anchor: null,
    link: "What changes",
  },
] as const

export const footer = {
  proverb: "Ar scáth a chéile a mhaireann na daoine.",
  translation: "People live in one another's shelter.",
} as const
