export type SlotKind = 'server' | 'client'

export interface SlotSpec {
  readonly kind: SlotKind
  readonly purpose: string
}

export const SLOTS = {
  Shell: {
    kind: 'server',
    purpose: 'Page frame with skip link, header, main landmark and footer, including error pages.',
  },
  Header: {
    kind: 'server',
    purpose: 'Board title or logo, and the region the user panel sits in.',
  },
  UserPanel: {
    kind: 'server',
    purpose:
      'Actor-specific greeting and account links, or guest sign-in prompt. Do not cache globally.',
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
    purpose: 'Server-rendered flash message or board notice.',
  },

  Announcement: {
    kind: 'server',
    purpose: 'Dated, authored announcement shown above forums until expiry.',
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
      'One forum in a listing: title, description, counters, last post, ' + 'subforum links.',
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
      'Newest threads, rendered on the server and refreshed through the app’s shared live region.',
  },
  LatestPosts: {
    kind: 'server',
    purpose: 'Newest posts and excerpts, refreshed with LatestThreads.',
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
    purpose: 'Resolved page links that work without JavaScript.',
  },

  ThreadView: {
    kind: 'server',
    purpose: 'A thread page body: the post list, pagination, reply affordance.',
  },
  PostBit: {
    kind: 'server',
    purpose: 'Post author, body and footer, rendered on the server.',
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
    purpose: 'GET search form with supplied input names.',
  },
  SearchResults: {
    kind: 'server',
    purpose: 'Search hits, excerpts and filtering controls.',
  },

  DiscoveryView: {
    kind: 'server',
    purpose: 'Discovery listing with the viewer’s available tabs.',
  },

  PanelShell: {
    kind: 'server',
    purpose: 'Member, moderator or admin panel frame with navigation and content.',
  },
  PanelNav: {
    kind: 'server',
    purpose: 'Panel navigation with current state resolved by the app before rendering.',
  },
  PanelPage: {
    kind: 'server',
    purpose: 'Panel page heading, supporting text, actions and body.',
  },
  PanelSection: {
    kind: 'server',
    purpose: 'Labelled content section inside a panel page.',
  },

  AuthPage: {
    kind: 'server',
    purpose: 'Authentication-page frame with an app-rendered form.',
  },

  ForumJump: {
    kind: 'server',
    purpose:
      'GET forum selector with a submit button; keyboard selection must not navigate automatically.',
  },

  RedirectNotice: {
    kind: 'server',
    purpose: 'Post-action notice with a meta-refresh destination and fallback link.',
  },
  ErrorNotice: {
    kind: 'server',
    purpose: 'Error or not-found content. Must render without database access.',
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
