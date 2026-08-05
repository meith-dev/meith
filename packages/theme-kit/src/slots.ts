/**
 * F25 — the slot registry.
 *
 * Every point at which a theme may replace markup is named here, exactly once,
 * with the **kind** of component that is allowed to fill it. The registry is the
 * subject of three separate mechanisms, which is why it is data rather than
 * documentation:
 *
 *  - `SlotModels` (view-models.ts) gives each slot a typed, JSON-shaped props
 *    contract, and `tsc` fails if a slot here has no model or a model here has
 *    no slot;
 *  - `SlotComponent` (theme.ts) resolves each slot's kind to a *different*
 *    function type, so an `async` client slot does not compile;
 *  - `scripts/slot-kinds.mjs` reads this file and every theme manifest and fails
 *    the build if the module implementing a slot declares the wrong side of the
 *    server/client boundary.
 *
 * ## Why the kind is declared, and not merely documented
 *
 * A guest thread page must ship near-zero JavaScript. If `PostBit` ever becomes
 * a client component the entire post list — every post, every author block —
 * is serialised into the browser payload and hydrated, and the product's main
 * advantage over the PHP boards is gone. Nothing about that failure is visible
 * in review: the page renders identically, passes every test, and is simply
 * slow and heavy forever.
 *
 * So the boundary is declared per slot and checked mechanically. There are two
 * client slots in this list, both editor islands, and adding a third should feel
 * like a decision.
 *
 * ## Why the whole list exists before any page
 *
 * A slot API retrofitted over finished pages does not work — you get the slots
 * the pages happened to make convenient, not the ones a theme needs. Slots for
 * features that are not built yet (`WhoIsOnline`, F75) are named now and left
 * unimplemented; a theme fills in what it can and `resolveTheme` reports the
 * rest as missing rather than pretending.
 *
 * **The list is derived, not transcribed.** The plan's R6 names the slot list
 * and this repository does not carry the plan text, so these 25 are derived from
 * the pages Phases 2–3 actually build and cross-checked
 * against MyBB's template names. Where R6 disagrees, R6 wins and this file
 * changes — see docs/deviations.md D35, which records the divergence rather than
 * leaving it to be discovered.
 */

/**
 * `server` — rendered on the server, may be `async`, ships no JavaScript.
 * `client` — a `"use client"` island. May hold state; costs bytes.
 */
export type SlotKind = 'server' | 'client'

export interface SlotSpec {
  readonly kind: SlotKind
  /** The plan feature that builds the page this slot appears on. */
  readonly feature: string
  /** What a theme is replacing when it fills this slot. */
  readonly purpose: string
}

/**
 * Every slot, with its kind. Declared `as const` so `SLOTS[K]['kind']` is a
 * literal type and `SlotComponent` can branch on it.
 */
export const SLOTS = {
  /* ---- Shell ---- */
  Shell: {
    kind: 'server',
    feature: 'F27',
    purpose:
      'The outermost frame: skip link, header, main landmark, footer. Wraps ' +
      'every page including the error pages.',
  },
  Header: {
    kind: 'server',
    feature: 'F27',
    purpose: 'Board title or logo, and the region the user panel sits in.',
  },
  UserPanel: {
    kind: 'server',
    feature: 'F27',
    purpose:
      'Greeting and account links, or the sign-in prompt for a guest. Varies ' +
      'by actor, which is why no page wrapping it may be cached globally.',
  },
  Navigation: {
    kind: 'server',
    feature: 'F27',
    purpose: 'The breadcrumb trail. Board → category → forum → thread.',
  },
  Footer: {
    kind: 'server',
    feature: 'F27',
    purpose: 'Board footer: copyright, timezone note, links.',
  },
  Notice: {
    kind: 'server',
    feature: 'F27',
    purpose:
      'A board-wide announcement or a flash message. Server-rendered so a ' +
      'notice is present in the first response, not after hydration.',
  },

  Announcement: {
    kind: 'server',
    feature: 'F71',
    purpose:
      'One announcement: a dated, authored notice shown above the forums. ' +
      'Distinct from Notice, which is a flash message about what the viewer ' +
      'just did — these are for everybody and last until they expire.',
  },

  /* ---- Board index ---- */
  BoardIndex: {
    kind: 'server',
    feature: 'F29',
    purpose: 'The index page body: the ordered list of category blocks.',
  },
  CategoryBlock: {
    kind: 'server',
    feature: 'F29',
    purpose: 'One top-level category and the forum rows under it.',
  },
  ForumRow: {
    kind: 'server',
    feature: 'F29',
    purpose:
      'One forum in a listing: title, description, counters, last post, ' +
      'subforum links.',
  },
  BoardStats: {
    kind: 'server',
    feature: 'F75',
    purpose: 'Board totals and the newest member.',
  },
  WhoIsOnline: {
    kind: 'server',
    feature: 'F75',
    purpose: 'The online list and its record.',
  },

  /* ---- Forum display ---- */
  ForumDisplay: {
    kind: 'server',
    feature: 'F30',
    purpose: 'A forum page body: subforums, thread list, pagination.',
  },
  ThreadRow: {
    kind: 'server',
    feature: 'F30',
    purpose: 'One thread in a listing: prefix, title, author, counters, last post.',
  },
  SubforumList: {
    kind: 'server',
    feature: 'F30',
    purpose: 'The compact list of child forums shown above a thread list.',
  },
  Pagination: {
    kind: 'server',
    feature: 'F30',
    purpose:
      'Page links. Server-rendered and href-based: paging must work with ' +
      'JavaScript disabled, so this can never become an island.',
  },

  /* ---- Thread view ---- */
  ThreadView: {
    kind: 'server',
    feature: 'F31',
    purpose: 'A thread page body: the post list, pagination, reply affordance.',
  },
  PostBit: {
    kind: 'server',
    feature: 'F31',
    purpose:
      'One post: author block, body, footer. **The** load-bearing server ' +
      'slot — see this file’s header for what marking it `client` costs.',
  },
  PostActions: {
    kind: 'server',
    feature: 'F31',
    purpose:
      'Per-post controls (quote, edit, report, moderate). Links and forms, ' +
      'not buttons with handlers, so they work without JavaScript.',
  },
  QuickReply: {
    kind: 'client',
    feature: 'F45',
    purpose:
      'The inline reply island at the foot of a thread. Enhances the full ' +
      'reply page; it never becomes the only way to reply.',
  },

  /* ---- Posting ---- */
  PostForm: {
    kind: 'server',
    feature: 'F39',
    purpose:
      'The composer page: subject, message, prefix, options. A native form ' +
      'posting to a Server Action — the editor toolbar is the island, not this.',
  },
  EditorToolbar: {
    kind: 'client',
    feature: 'F45',
    purpose:
      'Formatting toolbar, preview, attachment picker. Mounted beside the ' +
      'textarea; removing it must leave a working plain-textarea form.',
  },

  /* ---- Members ---- */
  MemberProfile: {
    kind: 'server',
    feature: 'F33',
    purpose: 'A member’s profile page body: identity, stats, recent activity.',
  },

  /* ---- Search ---- */
  SearchForm: {
    kind: 'server',
    feature: 'F73',
    purpose:
      'The search form. A GET form with named inputs, so a search is a URL ' +
      'that can be linked and cached.',
  },

  /* ---- Navigation ---- */
  ForumJump: {
    kind: 'server',
    feature: 'F27',
    purpose:
      'The jump box at the foot of every page. A GET form with a submit ' +
      'control, never a select that navigates on change — choosing an option ' +
      'is not committing to it, and arrow-keying through one would teleport a ' +
      'keyboard user to the first forum in the list.',
  },

  /* ---- Errors and redirects ---- */
  RedirectNotice: {
    kind: 'server',
    feature: 'F34',
    purpose:
      'The MyBB-style interstitial: "your post was made, continuing in a ' +
      'moment", with a real link for anyone the meta refresh does not carry.',
  },
  ErrorNotice: {
    kind: 'server',
    feature: 'F34',
    purpose:
      'The themed body of an error or not-found page. Must not depend on the ' +
      'database: it is what renders when the database is the thing that failed.',
  },
} as const satisfies Readonly<Record<string, SlotSpec>>

/** Every slot name. The union, derived from the registry — never hand-written. */
export type SlotName = keyof typeof SLOTS

/** The registry as an iterable list. Ordered as declared, which is page order. */
export const SLOT_NAMES = Object.keys(SLOTS) as readonly SlotName[]

/** Narrow an arbitrary string to a slot name. Used when validating a manifest. */
export function isSlotName(value: string): value is SlotName {
  return Object.hasOwn(SLOTS, value)
}

/** The declared kind of a slot. */
export function slotKind(name: SlotName): SlotKind {
  return SLOTS[name].kind
}
