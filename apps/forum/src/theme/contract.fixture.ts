/**
 * F77 — one set of view models, for every theme.
 *
 * The rendering-contract suite (`contract.test.ts`) drives every registered
 * theme through every stable slot with exactly these props. Sharing the fixtures
 * is the point: two themes rendering the same data are comparable, and a theme
 * that cannot render this set cannot render a board.
 *
 * ## `requires` is the contract, and it is deliberately short
 *
 * Each slot lists the strings its output must contain. Not "should look like" —
 * a theme is free to be a table, a card grid or a wall of text — but the things
 * a reader loses if the theme drops them: the link to the thread, the body of
 * the post, the region the page composed and handed over.
 *
 * The temptation is to require every value in the model, which would be easy to
 * generate and wrong: a theme that shows the online list as a count, or omits
 * `moderateHref` because it renders moderation elsewhere, is making a legitimate
 * design choice. Requiring everything makes the suite a copy of the default
 * theme's markup, and then the second theme's job becomes matching the first —
 * which is the opposite of what F78 is for.
 *
 * So each entry here is a decision about what a theme *owes* a reader, and
 * adding one should be an argument, not a reflex.
 *
 * Values are distinctive on purpose (`/f/3-general`, `Bikeshedding`) so a
 * substring match cannot pass by accident against boilerplate.
 */

import type { SlotModels, SlotName } from '@meith/theme-kit'

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

const TIME = { iso: '2026-03-12T09:14:00.000Z', label: '12 Mar 2026, 09:14' }
const OLDER = { iso: '2025-11-01T20:00:00.000Z', label: '1 Nov 2025, 20:00' }

const VIEWER = {
  isGuest: false,
  userId: 7,
  username: 'Wren',
  profileHref: '/member/7-wren',
  avatarUrl: '/avatar/7.png',
  canAccessAdminCp: false,
  canAccessModCp: true,
}

const GUEST = {
  isGuest: true,
  userId: null,
  username: null,
  profileHref: null,
  avatarUrl: null,
  canAccessAdminCp: false,
  canAccessModCp: false,
}

const AUTHOR = { userId: 12, username: 'Marlow', profileHref: '/member/12-marlow' }

const LAST_POST = {
  threadTitle: 'Bikeshedding the bike shed',
  href: '/thread/91-bikeshedding?post=4102',
  author: AUTHOR,
  at: TIME,
}

const FORUM = {
  id: 3,
  title: 'General discussion',
  description: 'Anything that does not fit elsewhere.',
  href: '/f/3-general',
  type: 'forum' as const,
  threadCount: 412,
  postCount: 9130,
  lastPost: LAST_POST,
  isUnread: true,
  subforums: [{ label: 'Introductions', href: '/f/8-introductions' }],
}

const THREAD = {
  id: 91,
  title: 'Bikeshedding the bike shed',
  href: '/thread/91-bikeshedding',
  prefix: { label: 'Poll', token: 'thread-pinned' },
  author: AUTHOR,
  replyCount: 27,
  viewCount: 1840,
  isSticky: true,
  isLocked: false,
  isUnread: true,
  isMoved: false,
  lastPost: LAST_POST,
}

const POST_AUTHOR = {
  ...AUTHOR,
  avatarUrl: '/avatar/12.png',
  title: 'Registered',
  postCount: 318,
  joinedAt: OLDER,
  signatureHtml: '<p>Sent from a rotary telephone</p>',
  isOnline: true,
  fields: [{ label: 'Location', value: 'Bristol' }],
}

const POST_ACTIONS = {
  quoteHref: '/thread/91-bikeshedding/reply?quote=4102',
  editHref: '/post/4102/edit',
  restoreHref: null,
  reportHref: '/report/post/4102',
  warnHref: null,
  moderateHref: null,
  rateHref: null,
}

const POST = {
  id: 4102,
  number: 12,
  permalink: '/thread/91-bikeshedding?post=4102#post-4102',
  author: POST_AUTHOR,
  bodyHtml: '<p>The shed should be teak.</p>',
  /*
   * F45's multiquote source. Deliberately *different* from `bodyHtml` — it is
   * the BBCode a quote button copies, not the rendered post — so a theme that
   * mistakenly rendered it would fail the contract's `requires` rather than
   * pass by looking identical.
   */
  quoteSource: 'The shed should be teak.',
  postedAt: TIME,
  editedNote: 'Last edited by Marlow on 12 Mar 2026',
  isFirstPost: false,
  visibility: 'visible' as const,
  ignored: null,
  attachments: [
    {
      id: 55,
      filename: 'plan.png',
      size: '1.4 MB',
      isImage: true,
      href: '/attachment/55/plan.png',
      thumbnailHref: '/attachment/55/thumb.png',
      width: 800,
      height: 600,
    },
  ],
  actions: POST_ACTIONS,
}

const PAGINATION = {
  page: 2,
  pageCount: 4,
  pages: [
    { page: 1, href: '/f/3-general?page=1', isCurrent: false },
    { page: 2, href: '/f/3-general?page=2', isCurrent: true },
    { page: 3, href: '/f/3-general?page=3', isCurrent: false },
  ],
  previousHref: '/f/3-general?page=1',
  nextHref: '/f/3-general?page=3',
}

/**
 * A rendered region, as a page hands one over.
 *
 * A plain string rather than an element: `ReactNode` includes strings, the
 * marker survives `renderToStaticMarkup` verbatim, and a theme that forgets to
 * render a region loses a value the suite is watching for.
 */
const region = (name: string): string => `REGION-${name}`

/**
 * A plugin's contribution to a region (F80).
 *
 * Distinct from `region()` because it is a different claim: a theme that
 * forgets `regions.plugins` drops *plugin* output specifically, and nothing
 * else about the page changes. That failure is invisible from the plugin's
 * side — the host collected the node and handed it over — so it has to be
 * caught here, by requiring both themes to render it.
 */
const pluginRegion = (name: string): string => `PLUGIN-${name}`

export interface SlotFixture<K extends SlotName> {
  readonly model: SlotModels[K]
  /** Strings the rendered output must contain. See this file's header. */
  readonly requires: readonly string[]
}

/**
 * Every slot a theme must fill, with the props to fill it and what it owes.
 *
 * The two provisional slots are absent, and `contract.test.ts` asserts that the
 * absences are exactly those two — so a slot promoted out of provisional
 * without a fixture fails rather than going untested.
 */
export const SLOT_FIXTURES: { readonly [K in SlotName]?: SlotFixture<K> } = {
  /*
   * The one fixture with a guest viewer, and it is the frame every page uses.
   * `username` and `profileHref` are null for a guest — most of a public board's
   * traffic — and a theme that reads them without checking renders "null" into
   * the wrapper of every page rather than into one region of one of them.
   */
  Shell: {
    model: { boardTitle: 'The Bike Shed', viewer: GUEST, children: region('body') },
    requires: [region('body')],
  },

  Header: {
    model: {
      boardTitle: 'The Bike Shed',
      homeHref: '/',
      viewer: VIEWER,
      navigation: [{ label: 'Unanswered', href: '/discover/unanswered' }],
      children: region('user-panel'),
    },
    /* The board's name and the way home. A header without them is decoration. */
    requires: ['The Bike Shed', region('user-panel'), '/discover/unanswered'],
  },

  UserPanel: {
    model: {
      viewer: VIEWER,
      links: [{ label: 'User CP', href: '/usercp' }],
      unreadNotifications: 3,
      unreadMessages: 1,
      children: region('log-out'),
    },
    /*
     * The log-out form is app-rendered and cannot be a link (D38). A theme that
     * drops `children` leaves a signed-in member with no way out.
     */
    requires: ['Wren', '/usercp', region('log-out')],
  },

  Navigation: {
    model: {
      items: [
        { label: 'Board index', href: '/' },
        { label: 'General discussion', href: '/f/3-general' },
      ],
    },
    /*
     * Labels, not hrefs. The last crumb is the page you are on, and a theme is
     * right to render it as text with `aria-current` rather than as a link to
     * here — which the first version of this fixture asserted against, wrongly.
     */
    requires: ['Board index', 'General discussion'],
  },

  Footer: {
    model: {
      boardTitle: 'The Bike Shed',
      links: [{ label: 'Contact', href: '/contact' }],
      timezoneLabel: 'Europe/London',
    },
    /* The zone the timestamps were formatted in; without it every time is a guess. */
    requires: ['Europe/London', '/contact'],
  },

  Notice: {
    model: { kind: 'warning', message: 'Scheduled maintenance at 22:00.', dismissHref: '/notice/4/dismiss' },
    requires: ['Scheduled maintenance at 22:00.'],
  },

  BoardIndex: {
    model: {
      markAllReadAction: '/mark-read',
      regions: {
        categories: region('categories'),
        stats: region('stats'),
        online: region('online'),
        plugins: pluginRegion('index.footer'),
      },
    },
    requires: [
      region('categories'),
      region('stats'),
      region('online'),
      pluginRegion('index.footer'),
    ],
  },

  CategoryBlock: {
    model: {
      category: { ...FORUM, id: 1, title: 'Community', type: 'category', href: '/f/1-community' },
      children: region('forum-rows'),
    },
    requires: ['Community', region('forum-rows')],
  },

  ForumRow: {
    model: { forum: FORUM },
    requires: ['General discussion', '/f/3-general', LAST_POST.href],
  },

  BoardStats: {
    /*
     * Three-digit counts, deliberately. A theme formats numbers — the default
     * one groups thousands — so `91300` is not in the output of a theme that is
     * behaving correctly, and a fixture that asserted on it would be asserting
     * that nobody may format anything.
     */
    model: {
      threadCount: 412,
      postCount: 913,
      memberCount: 187,
      newestMember: AUTHOR,
      computedAt: TIME,
    },
    requires: ['412', '913', '187', 'Marlow'],
  },

  WhoIsOnline: {
    model: {
      guestCount: 14,
      members: [
        {
          ...AUTHOR,
          location: { label: 'Reading a thread', href: '/thread/91-bikeshedding' },
          isInvisible: false,
          lastSeen: TIME,
        },
      ],
      total: 15,
      recordCount: 240,
      recordAt: OLDER,
      fullListHref: '/online',
    },
    requires: ['Marlow', '14'],
  },

  ForumDisplay: {
    model: {
      forum: FORUM,
      newThreadHref: '/f/3-general/new',
      markReadAction: '/f/3-general/mark-read',
      regions: {
        subforums: region('subforums'),
        threads: region('threads'),
        pagination: region('pagination'),
      },
    },
    requires: ['General discussion', region('threads'), region('pagination'), '/f/3-general/new'],
  },

  ThreadRow: {
    model: { thread: THREAD, select: null },
    requires: ['Bikeshedding the bike shed', '/thread/91-bikeshedding', '27'],
  },

  SubforumList: {
    model: { forums: [{ ...FORUM, id: 8, title: 'Introductions', href: '/f/8-introductions' }] },
    requires: ['Introductions', '/f/8-introductions'],
  },

  Pagination: {
    model: PAGINATION,
    /* Paging is anchors or it does not work without JavaScript (R5). */
    requires: ['/f/3-general?page=1', '/f/3-general?page=3'],
  },

  ThreadView: {
    model: {
      thread: THREAD,
      forum: { label: 'General discussion', href: '/f/3-general' },
      replyHref: '/thread/91-bikeshedding/reply',
      markReadAction: '/thread/91-bikeshedding/mark-read',
      regions: {
        posts: region('posts'),
        pagination: region('pagination'),
        quickReply: region('quick-reply'),
      },
    },
    requires: ['Bikeshedding the bike shed', region('posts'), region('pagination')],
  },

  PostBit: {
    model: {
      post: POST,
      select: null,
      regions: {
        actions: region('post-actions'),
        pluginBadges: pluginRegion('postbit.badges'),
        pluginFooter: pluginRegion('postbit.footer'),
      },
    },
    /*
     * The body, who wrote it, and a link to the post itself. Everything else on
     * a postbit is a theme's business; these three are the post.
     */
    requires: [
      'The shed should be teak.',
      'Marlow',
      '#post-4102',
      region('post-actions'),
      pluginRegion('postbit.badges'),
      pluginRegion('postbit.footer'),
    ],
  },

  PostActions: {
    model: { actions: POST_ACTIONS, postId: 4102 },
    requires: ['/post/4102/edit', '/report/post/4102'],
  },

  PostForm: {
    model: {
      mode: 'reply',
      heading: 'Reply to Bikeshedding the bike shed',
      cancelHref: '/thread/91-bikeshedding',
      cancelLabel: 'Back to the thread',
      errorMessage: 'Your reply is empty.',
      regions: { form: region('composer'), toolbar: region('toolbar') },
    },
    /*
     * The form is app-rendered because a Server Action reference cannot cross
     * this contract (D42). A theme that drops the region renders a page with no
     * way to post — and the error, or a member retypes a lost reply.
     */
    requires: [region('composer'), 'Your reply is empty.', '/thread/91-bikeshedding'],
  },

  MemberProfile: {
    model: {
      user: AUTHOR,
      avatarUrl: '/avatar/12.png',
      title: 'Registered',
      joinedAt: OLDER,
      lastVisitAt: TIME,
      postCount: 318,
      signatureHtml: '<p>Sent from a rotary telephone</p>',
      fields: [{ label: 'Location', value: 'Bristol' }],
      actions: [{ label: 'Send a message', href: '/messages/new?to=12' }],
      regions: { plugins: pluginRegion('profile.panel') },
    },
    requires: ['Marlow', '318', 'Bristol', pluginRegion('profile.panel')],
  },

  SearchForm: {
    model: {
      action: '/search',
      fields: { query: 'q', forum: 'forum', sort: 'sort' },
      query: 'teak',
      maxQueryLength: 128,
      forums: [
        { value: '', label: 'Every forum I can see', isSelected: true },
        { value: '3', label: 'General discussion', isSelected: false },
      ],
      sorts: [
        { value: 'relevance', label: 'Best match', isSelected: true },
        { value: 'newest', label: 'Newest first', isSelected: false },
      ],
      hint: null,
      errorMessage: 'That search is too short.',
    },
    /*
     * The field names come from the model, and a theme that hardcodes its own
     * submits a search the page cannot read. `method="get"` is required for the
     * same reason paging is anchors: a search is a URL.
     */
    requires: ['name="q"', 'method="get"', 'That search is too short.', 'General discussion'],
  },

  ForumJump: {
    model: {
      action: '/jump',
      field: 'forum',
      forums: [
        { value: '1', label: 'General', depth: 0, isCategory: true, isSelected: false },
        { value: '3', label: 'Chat', depth: 1, isCategory: false, isSelected: true },
      ],
      submitLabel: 'Go',
      label: 'Jump to forum',
    },
    /*
     * `method="get"` and a real submit control, both required.
     *
     * A theme that renders only the `<select>` and navigates on change breaks in
     * two ways at once: it does nothing without JavaScript, and it teleports a
     * keyboard user to the first option as they arrow through the list, because
     * `change` fires on every keystroke. The button is the interaction, not the
     * fallback — so the contract asserts it is in the markup.
     *
     * `name="forum"` comes from the model. A theme typing its own hardcodes the
     * app's query-string contract into markup the app does not own.
     */
    requires: ['method="get"', 'name="forum"', 'type="submit"', 'Go', 'Jump to forum', 'Chat'],
  },

  RedirectNotice: {
    model: {
      message: 'Your reply was posted.',
      targetHref: '/thread/91-bikeshedding?post=4103',
      delaySeconds: 3,
    },
    /* The link is the whole point: the meta refresh does not carry everybody. */
    requires: ['Your reply was posted.', '/thread/91-bikeshedding?post=4103'],
  },

  ErrorNotice: {
    model: {
      status: 404,
      title: 'No such thread',
      message: 'It may have been deleted or moved somewhere you cannot see.',
      homeHref: '/',
      requestId: 'req-8f21',
    },
    /* The request id is how a report becomes actionable. */
    requires: ['No such thread', 'req-8f21'],
  },
}
