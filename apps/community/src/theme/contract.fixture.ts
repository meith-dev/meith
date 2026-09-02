import type { SlotModels, SlotName } from '@meith/theme-kit'

const COUNT = (value: number) => ({ value, label: String(value) })

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
  threadCount: COUNT(412),
  postCount: COUNT(9130),
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
  replyCount: COUNT(27),
  viewCount: COUNT(1840),
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
  groups: [
    { title: 'Registered', nameClass: null },
    { title: 'Supporters', nameClass: 'gname-9' },
  ],
  postCount: COUNT(318),
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
  permalink: '/thread/91-bikeshedding#post-12',
  author: POST_AUTHOR,
  bodyHtml: '<p>The shed should be teak.</p>',
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
  pageCountIsExact: true,
  pages: [
    { page: 1, href: '/f/3-general?page=1', isCurrent: false },
    { page: 2, href: '/f/3-general?page=2', isCurrent: true },
    { page: 3, href: '/f/3-general?page=3', isCurrent: false },
  ],
  previousHref: '/f/3-general?page=1',
  nextHref: '/f/3-general?page=3',
}

const region = (name: string): string => `REGION-${name}`

const pluginRegion = (name: string): string => `PLUGIN-${name}`

export interface SlotFixture<K extends SlotName> {
  readonly model: SlotModels[K]
  readonly requires: readonly string[]
}

export const SLOT_FIXTURES: { readonly [K in SlotName]?: SlotFixture<K> } = {
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
    requires: ['The Bike Shed', region('user-panel'), '/discover/unanswered'],
  },

  UserPanel: {
    model: {
      viewer: VIEWER,
      links: [{ label: 'User CP', href: '/usercp' }],
      unreadNotifications: COUNT(3),
      unreadMessages: COUNT(1),
      children: region('log-out'),
    },
    requires: ['Wren', '/usercp', region('log-out')],
  },

  Navigation: {
    model: {
      items: [
        { label: 'Board index', href: '/' },
        { label: 'General discussion', href: '/f/3-general' },
      ],
    },
    requires: ['Board index', 'General discussion'],
  },

  Footer: {
    model: {
      boardTitle: 'The Bike Shed',
      links: [{ label: 'Contact', href: '/contact' }],
      timezoneLabel: 'Europe/London',
      poweredBy: { label: 'Powered by Meith', href: 'https://meith.dev' },
      regions: { controls: region('footer-controls') },
    },
    requires: ['Europe/London', '/contact', region('footer-controls')],
  },

  Notice: {
    model: {
      kind: 'warning',
      message: 'Scheduled maintenance at 22:00.',
      dismissHref: '/notice/4/dismiss',
    },
    requires: ['Scheduled maintenance at 22:00.'],
  },

  Announcement: {
    model: {
      title: 'The board is moving',
      bodyHtml: '<p>New address on <strong>Friday</strong>.</p>',
      postedBy: AUTHOR,
      postedAt: TIME,
      forum: { label: 'General discussion', href: '/f/3-general' },
    },
    requires: ['The board is moving', '<strong>Friday</strong>', 'Marlow'],
  },

  BoardIndex: {
    model: {
      markAllReadAction: '/mark-read',
      regions: {
        categories: region('categories'),
        stats: region('stats'),
        online: region('online'),
        latest: region('latest'),
        plugins: pluginRegion('index.footer'),
        announcements: region('announcements'),
      },
    },
    requires: [
      region('categories'),
      region('stats'),
      region('online'),
      region('latest'),
      pluginRegion('index.footer'),
      region('announcements'),
    ],
  },

  CategoryBlock: {
    model: {
      category: { ...FORUM, id: 1, title: 'Forum', type: 'category', href: '/f/1-forum' },
      children: region('forum-rows'),
    },
    requires: ['Forum', region('forum-rows')],
  },

  ForumRow: {
    model: { forum: FORUM },
    requires: ['General discussion', '/f/3-general', LAST_POST.href],
  },

  BoardStats: {
    model: {
      threadCount: COUNT(412),
      postCount: COUNT(913),
      memberCount: COUNT(187),
      newestMember: AUTHOR,
      computedAt: TIME,
    },
    requires: ['412', '913', '187', 'Marlow'],
  },

  WhoIsOnline: {
    model: {
      guestCount: COUNT(14),
      members: [
        {
          ...AUTHOR,
          location: { label: 'Reading a thread', href: '/thread/91-bikeshedding' },
          isInvisible: false,
          lastSeen: TIME,
        },
      ],
      memberCount: COUNT(1),
      total: COUNT(15),
      recordCount: COUNT(240),
      recordAt: OLDER,
      fullListHref: '/online',
    },
    requires: ['Marlow', '14'],
  },

  LatestThreads: {
    model: {
      threads: [
        {
          title: 'Bikeshedding the bike shed',
          href: '/thread/91-bikeshedding',
          forum: { label: 'General discussion', href: '/f/3-general' },
          author: AUTHOR,
          replyCount: COUNT(27),
          startedAt: TIME,
        },
      ],
      capturedAt: TIME,
    },
    requires: ['Bikeshedding the bike shed', '/thread/91-bikeshedding', 'General discussion'],
  },

  LatestPosts: {
    model: {
      posts: [
        {
          threadTitle: 'Bikeshedding the bike shed',
          href: '/thread/91-bikeshedding?post=4102',
          forum: { label: 'General discussion', href: '/f/3-general' },
          author: AUTHOR,
          excerpt: 'The roof should be corrugated, not slate.',
          postedAt: TIME,
        },
      ],
      capturedAt: TIME,
    },
    requires: [
      '/thread/91-bikeshedding?post=4102',
      'The roof should be corrugated, not slate.',
      'General discussion',
    ],
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
        announcements: region('announcements'),
      },
    },
    requires: [
      'General discussion',
      region('threads'),
      region('pagination'),
      '/f/3-general/new',
      region('announcements'),
    ],
  },

  ThreadRow: {
    model: {
      thread: { ...THREAD, visibility: 'deleted' },
      select: null,
      regions: { pluginBadges: pluginRegion('threadrow-badges') },
    },
    requires: [
      'Bikeshedding the bike shed',
      '/thread/91-bikeshedding',
      '27',
      'data-visibility',
      pluginRegion('threadrow-badges'),
    ],
  },

  SubforumList: {
    model: { forums: [{ ...FORUM, id: 8, title: 'Introductions', href: '/f/8-introductions' }] },
    requires: ['Introductions', '/f/8-introductions'],
  },

  Pagination: {
    model: PAGINATION,
    requires: ['/f/3-general?page=1', '/f/3-general?page=3'],
  },

  ThreadView: {
    model: {
      thread: THREAD,
      forum: { label: 'General discussion', href: '/f/3-general' },
      replyHref: '/thread/91-bikeshedding/reply',
      markReadAction: '/thread/91-bikeshedding/mark-read',
      watch: { subscribed: true, action: '/thread/91-bikeshedding/unwatch' },
      regions: {
        posts: region('posts'),
        pagination: region('pagination'),
        quickReply: region('quick-reply'),
      },
    },
    requires: [
      'Bikeshedding the bike shed',
      '/thread/91-bikeshedding/unwatch',
      region('posts'),
      region('pagination'),
    ],
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
    requires: [
      'The shed should be teak.',
      'Marlow',
      'Registered',
      'Supporters',
      '#post-12',
      region('post-actions'),
      pluginRegion('postbit.badges'),
      pluginRegion('postbit.footer'),
    ],
  },

  PostActions: {
    model: { actions: POST_ACTIONS, postId: 4102 },
    requires: ['/post/4102/edit', '/report/post/4102'],
  },

  QuickReply: {
    model: {
      threadId: 91,
      placeholder: 'Quick reply',
      submitLabel: 'Post reply',
      fullReplyHref: '/thread/91-bikeshedding/reply',
      children: region('quick-reply-form'),
    },
    requires: [region('quick-reply-form')],
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
    requires: [region('composer'), 'Your reply is empty.', '/thread/91-bikeshedding'],
  },

  EditorToolbar: {
    model: {
      textareaId: 'post-message',
      groupLabel: 'Formatting',
      buttons: [
        {
          tag: 'bold',
          insertion: null,
          label: 'Bold',
          title: 'Bold (Ctrl+B)',
          keyShortcut: 'Control+b',
          icon: null,
          placeholder: 'bold text',
        },
        {
          tag: 'link',
          insertion: null,
          label: 'Link',
          title: 'Link',
          keyShortcut: null,
          icon: null,
          placeholder: null,
        },
      ],
      attachment: { inputId: 'post-message-attachment', label: 'Insert attachment' },
      previewAction: null,
    },
    requires: ['Formatting', 'Bold (Ctrl+B)', 'Insert attachment'],
  },

  MemberProfile: {
    model: {
      user: AUTHOR,
      avatarUrl: '/avatar/12.png',
      title: 'Registered',
      groups: [
        { title: 'Registered', nameClass: null },
        { title: 'Supporters', nameClass: 'gname-9' },
      ],
      joinedAt: OLDER,
      lastVisitAt: TIME,
      postCount: COUNT(318),
      signatureHtml: '<p>Sent from a rotary telephone</p>',
      fields: [{ label: 'Location', value: 'Bristol' }],
      actions: [{ label: 'Send a message', href: '/messages/new?to=12' }],
      regions: { plugins: pluginRegion('profile.panel') },
    },
    requires: [
      'Marlow',
      '318',
      'Bristol',
      'Registered',
      'Supporters',
      pluginRegion('profile.panel'),
    ],
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
      advanced: {
        label: 'Advanced options',
        isOpen: true,
        author: {
          field: 'author',
          label: 'Posted by',
          value: 'Marlow',
          placeholder: 'Anybody',
          hint: 'Usernames, separated by commas. Up to 5.',
        },
        toggles: [
          {
            field: 'subforums',
            value: 'yes',
            label: 'Include subforums of the forum above',
            isOn: true,
          },
        ],
        choices: [
          {
            field: 'when',
            label: 'Posted',
            options: [
              { value: 'any', label: 'Any time', isSelected: false },
              { value: 'week', label: 'Past week', isSelected: true },
            ],
          },
          {
            field: 'in',
            label: 'Matching in',
            options: [
              { value: 'everything', label: 'Titles and post text', isSelected: true },
              { value: 'titles', label: 'Thread titles only', isSelected: false },
            ],
          },
        ],
      },
    },
    requires: [
      'name="q"',
      'method="get"',
      'That search is too short.',
      'General discussion',
      'name="author"',
      'name="subforums"',
      'Past week',
      'Thread titles only',
    ],
  },

  AuthPage: {
    model: {
      title: 'Welcome back',
      alert: 'That confirmation link is no longer valid.',
      links: [
        { label: 'Forgot your password?', href: '/reset', lead: null },
        { label: 'Create an account', href: '/register', lead: 'New here?' },
      ],
      regions: {
        lede: region('auth-lede'),
        form: region('auth-form'),
        note: region('auth-note'),
      },
    },
    requires: [
      'Welcome back',
      'That confirmation link is no longer valid.',
      '/reset',
      'New here?',
      'Create an account',
      region('auth-lede'),
      region('auth-form'),
      region('auth-note'),
    ],
  },

  SearchResults: {
    model: {
      terms: 'teak veneer',
      searchedAt: TIME,
      hits: [
        {
          postId: 4102,
          threadTitle: 'Bikeshedding the bike shed',
          href: '/thread/91-bikeshedding?post=4102',
          excerptHtml: 'the <b>teak</b> one, before anybody repaints it',
          authorUsername: 'Marlow',
          postedAt: TIME,
        },
      ],
      nextHref: '/search/abc?rank=0.4&after=4102',
      nextLabel: 'Next 20 results',
      newSearchHref: '/search',
      within: {
        action: '/search',
        field: 'q',
        value: 'teak veneer ',
        label: 'Search within these results',
        hint: 'Adds your words to the ones above.',
        submitLabel: 'Search within',
        hidden: [{ name: 'forum', value: '3' }],
      },
      refine: {
        action: '/search/abc',
        label: 'Filter and sort these results',
        summary: '2 matching posts.',
        note: null,
        sorts: [
          { label: 'Best match', href: '/search/abc', isCurrent: true },
          { label: 'Newest first', href: '/search/abc?sort=newest', isCurrent: false },
        ],
        sortsLabel: 'Sort by',
        choices: [
          {
            field: 'forum',
            label: 'In',
            options: [
              { value: '', label: 'Every forum', isSelected: true },
              { value: '3', label: 'General discussion (2)', isSelected: false },
            ],
          },
        ],
        submitLabel: 'Apply',
        applied: [{ label: 'Past week', removeHref: '/search/abc' }],
        clearHref: '/search/abc',
      },
    },
    requires: [
      'teak veneer',
      'Bikeshedding the bike shed',
      '/thread/91-bikeshedding?post=4102',
      'method="get"',
      'name="q"',
      'Search within',
      '/search/abc?rank=0.4&amp;after=4102',
      '/search/abc?sort=newest',
      'General discussion (2)',
      'Past week',
      '2 matching posts.',
    ],
  },

  DiscoveryView: {
    model: {
      title: 'Unanswered',
      blurb: 'Threads nobody has replied to yet.',
      tabsLabel: 'Discovery views',
      tabs: [
        { href: '/discover/new', label: 'New posts', isCurrent: false },
        { href: '/discover/unanswered', label: 'Unanswered', isCurrent: true },
      ],
      rows: [
        {
          threadId: 91,
          title: 'Bikeshedding the bike shed',
          href: '/thread/91-bikeshedding',
          forum: { label: 'General discussion', href: '/3-general' },
          authorUsername: 'Marlow',
          replyCount: COUNT(0),
          lastPostAt: TIME,
          lastPostUsername: null,
        },
      ],
      nextHref: '/discover/unanswered?at=2026-03-12T09%3A14%3A00.000Z&after=91',
      nextLabel: 'Next 20 threads',
      emptyMessage: 'Nothing here right now.',
      refusal: null,
    },
    requires: [
      'Unanswered',
      'Bikeshedding the bike shed',
      '/thread/91-bikeshedding',
      'General discussion',
      'aria-current="page"',
      'Next 20 threads',
    ],
  },

  PanelShell: {
    model: {
      panel: 'usercp',
      links: [{ label: 'Moderator CP', href: '/modcp' }],
      linksLabel: 'Other panels',
      regions: { nav: region('panel-nav') },
      children: region('panel-body'),
    },
    requires: [region('panel-nav'), region('panel-body'), '/modcp', 'Other panels'],
  },

  PanelNav: {
    model: {
      panel: 'usercp',
      label: 'Sections',
      currentTitle: 'Options',
      sections: [
        {
          href: '/usercp',
          title: 'Overview',
          icon: 'overview',
          count: null,
          current: null,
          isRecord: false,
          isOpen: false,
          isOverview: true,
          children: [],
        },
        {
          href: '/messages',
          title: 'Private messages',
          icon: 'messages',
          count: 3,
          current: null,
          isRecord: false,
          isOpen: false,
          isOverview: false,
          children: [],
        },
        {
          href: '/usercp/options',
          title: 'Options',
          icon: 'settings',
          count: null,
          current: 'here',
          isRecord: false,
          isOpen: true,
          isOverview: false,
          children: [
            {
              href: '/usercp/options/advanced',
              title: 'Advanced',
              icon: null,
              count: null,
              current: null,
              isRecord: false,
            },
          ],
        },
      ],
    },
    requires: [
      'Sections',
      'Overview',
      'Private messages',
      '3',
      'Options',
      'aria-current="page"',
      '/usercp/options/advanced',
    ],
  },

  PanelPage: {
    model: {
      panel: 'admincp',
      frame: 'panel',
      title: 'Attachments',
      back: { label: 'Content', href: '/admin/content' },
      width: 'wide',
      gap: 'loose',
      regions: {
        lede: region('page-lede'),
        meta: region('page-meta'),
        actions: region('page-actions'),
      },
      children: region('page-body'),
    },
    requires: [
      'Attachments',
      '/admin/content',
      region('page-lede'),
      region('page-meta'),
      region('page-actions'),
      region('page-body'),
    ],
  },

  PanelSection: {
    model: {
      title: 'Waiting for you',
      headingId: 'waiting-heading',
      regions: {
        description: region('section-description'),
        actions: region('section-actions'),
      },
      children: region('section-body'),
    },
    requires: [
      'Waiting for you',
      'waiting-heading',
      region('section-description'),
      region('section-actions'),
      region('section-body'),
    ],
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
    requires: ['method="get"', 'name="forum"', 'type="submit"', 'Go', 'Jump to forum', 'Chat'],
  },

  RedirectNotice: {
    model: {
      message: 'Your reply was posted.',
      targetHref: '/thread/91-bikeshedding?post=4103',
      delaySeconds: 3,
    },
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
    requires: ['No such thread', 'req-8f21'],
  },
}
