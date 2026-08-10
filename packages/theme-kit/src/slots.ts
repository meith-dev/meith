export type SlotKind = 'server' | 'client'

export interface SlotSpec {
  readonly kind: SlotKind
  readonly feature: string
  readonly purpose: string
}

export const SLOTS = {
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
  LatestThreads: {
    kind: 'server',
    feature: 'F29',
    purpose:
      'The newest threads on the board, for the index sidebar. Server, not ' +
      'client, even though the panel refreshes itself: the app polls a Server ' +
      'Action that renders this slot again, so the live half is one island ' +
      'around the region rather than a client component per panel.',
  },
  LatestPosts: {
    kind: 'server',
    feature: 'F29',
    purpose:
      'The newest posts on the board, with an excerpt of each. Same server ' +
      'rendering and same refresh path as LatestThreads.',
  },

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

  MemberProfile: {
    kind: 'server',
    feature: 'F33',
    purpose: 'A member’s profile page body: identity, stats, recent activity.',
  },

  SearchForm: {
    kind: 'server',
    feature: 'F73',
    purpose:
      'The search form. A GET form with named inputs, so a search is a URL ' +
      'that can be linked and cached.',
  },

  ForumJump: {
    kind: 'server',
    feature: 'F27',
    purpose:
      'The jump box at the foot of every page. A GET form with a submit ' +
      'control, never a select that navigates on change — choosing an option ' +
      'is not committing to it, and arrow-keying through one would teleport a ' +
      'keyboard user to the first forum in the list.',
  },

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

export type SlotName = keyof typeof SLOTS

export const SLOT_NAMES = Object.keys(SLOTS) as readonly SlotName[]

export function isSlotName(value: string): value is SlotName {
  return Object.hasOwn(SLOTS, value)
}

export function slotKind(name: SlotName): SlotKind {
  return SLOTS[name].kind
}
