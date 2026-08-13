export type SlotKind = 'server' | 'client'

export interface SlotSpec {
  readonly kind: SlotKind
  readonly purpose: string
}

export const SLOTS = {
  Shell: {
    kind: 'server',
    purpose:
      'The outermost frame: skip link, header, main landmark, footer. Wraps ' +
      'every page including the error pages.',
  },
  Header: {
    kind: 'server',
    purpose: 'Board title or logo, and the region the user panel sits in.',
  },
  UserPanel: {
    kind: 'server',
    purpose:
      'Greeting and account links, or the sign-in prompt for a guest. Varies ' +
      'by actor, which is why no page wrapping it may be cached globally.',
  },
  Navigation: {
    kind: 'server',
    purpose: 'The breadcrumb trail. Board → category → forum → thread.',
  },
  Footer: {
    kind: 'server',
    purpose: 'Board footer: copyright, timezone note, links.',
  },
  Notice: {
    kind: 'server',
    purpose:
      'A board-wide announcement or a flash message. Server-rendered so a ' +
      'notice is present in the first response, not after hydration.',
  },

  Announcement: {
    kind: 'server',
    purpose:
      'One announcement: a dated, authored notice shown above the forums. ' +
      'Distinct from Notice, which is a flash message about what the viewer ' +
      'just did — these are for everybody and last until they expire.',
  },

  BoardIndex: {
    kind: 'server',
    purpose: 'The index page body: the ordered list of category blocks.',
  },
  CategoryBlock: {
    kind: 'server',
    purpose: 'One top-level category and the forum rows under it.',
  },
  ForumRow: {
    kind: 'server',
    purpose:
      'One forum in a listing: title, description, counters, last post, ' +
      'subforum links.',
  },
  BoardStats: {
    kind: 'server',
    purpose: 'Board totals and the newest member.',
  },
  WhoIsOnline: {
    kind: 'server',
    purpose: 'The online list and its record.',
  },
  LatestThreads: {
    kind: 'server',
    purpose:
      'The newest threads on the board, for the index sidebar. Server, not ' +
      'client, even though the panel refreshes itself: the app polls a Server ' +
      'Action that renders this slot again, so the live half is one island ' +
      'around the region rather than a client component per panel.',
  },
  LatestPosts: {
    kind: 'server',
    purpose:
      'The newest posts on the board, with an excerpt of each. Same server ' +
      'rendering and same refresh path as LatestThreads.',
  },

  ForumDisplay: {
    kind: 'server',
    purpose: 'A forum page body: subforums, thread list, pagination.',
  },
  ThreadRow: {
    kind: 'server',
    purpose: 'One thread in a listing: prefix, title, author, counters, last post.',
  },
  SubforumList: {
    kind: 'server',
    purpose: 'The compact list of child forums shown above a thread list.',
  },
  Pagination: {
    kind: 'server',
    purpose:
      'Page links. Server-rendered and href-based: paging must work with ' +
      'JavaScript disabled, so this can never become an island.',
  },

  ThreadView: {
    kind: 'server',
    purpose: 'A thread page body: the post list, pagination, reply affordance.',
  },
  PostBit: {
    kind: 'server',
    purpose:
      'One post: author block, body, footer. **The** load-bearing server ' +
      'slot — see this file’s header for what marking it `client` costs.',
  },
  PostActions: {
    kind: 'server',
    purpose:
      'Per-post controls (quote, edit, report, moderate). Links and forms, ' +
      'not buttons with handlers, so they work without JavaScript.',
  },
  QuickReply: {
    kind: 'client',
    purpose:
      'The inline reply island at the foot of a thread. Enhances the full ' +
      'reply page; it never becomes the only way to reply.',
  },

  PostForm: {
    kind: 'server',
    purpose:
      'The composer page: subject, message, prefix, options. A native form ' +
      'posting to a Server Action — the editor toolbar is the island, not this.',
  },
  EditorToolbar: {
    kind: 'client',
    purpose:
      'Formatting toolbar, preview, attachment picker. Mounted beside the ' +
      'textarea; removing it must leave a working plain-textarea form.',
  },

  MemberProfile: {
    kind: 'server',
    purpose: 'A member’s profile page body: identity, stats, recent activity.',
  },

  SearchForm: {
    kind: 'server',
    purpose:
      'The search form. A GET form with named inputs, so a search is a URL ' +
      'that can be linked and cached.',
  },
  SearchResults: {
    kind: 'server',
    purpose:
      'The results page for one search: what matched, an excerpt of each hit, ' +
      'and the form that narrows the set. Separate from SearchForm because a ' +
      'result list is a listing and shares nothing with a filter panel but the ' +
      'word "search".',
  },

  DiscoveryView: {
    kind: 'server',
    purpose:
      'The body of a discovery listing — new posts, today, unanswered, and a ' +
      'member’s own threads and replies. One slot for all of them: they differ ' +
      'in what the query selected, never in what a reader is looking at.',
  },

  PanelShell: {
    kind: 'server',
    purpose:
      'The frame around a control panel: the navigation rail, the links to the ' +
      'other panels a viewer may reach, and the page beside them. Rendered for ' +
      'the member, moderator and admin panels alike — `panel` says which.',
  },
  PanelNav: {
    kind: 'server',
    purpose:
      'A control panel’s section navigation. Server, not client: which section ' +
      'is open is resolved from the request path before rendering, so the rail ' +
      'arrives correct rather than after hydration, and a panel needs no ' +
      'JavaScript to know where it is.',
  },
  PanelPage: {
    kind: 'server',
    purpose:
      'One control-panel page: its heading, the line under it, the controls ' +
      'beside it, and the body. Also the frame for the account, moderation and ' +
      'messaging pages that are panel-shaped without being in a panel.',
  },
  PanelSection: {
    kind: 'server',
    purpose:
      'A labelled section inside a panel page. Rendered by the page among its ' +
      'content rather than around it, which is why it is not part of PanelPage.',
  },

  AuthPage: {
    kind: 'server',
    purpose:
      'Signing in, registering, resetting a password, asking for a new ' +
      'confirmation link. One slot for all of them: the same card with a ' +
      'different form in it, and the form itself is an app-rendered region ' +
      'because every one of them posts to a Server Action.',
  },

  ForumJump: {
    kind: 'server',
    purpose:
      'The jump box at the foot of every page. A GET form with a submit ' +
      'control, never a select that navigates on change — choosing an option ' +
      'is not committing to it, and arrow-keying through one would teleport a ' +
      'keyboard user to the first forum in the list.',
  },

  RedirectNotice: {
    kind: 'server',
    purpose:
      'The MyBB-style interstitial: "your post was made, continuing in a ' +
      'moment", with a real link for anyone the meta refresh does not carry.',
  },
  ErrorNotice: {
    kind: 'server',
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
