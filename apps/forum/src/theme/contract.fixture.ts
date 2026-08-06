import type { SlotModels, SlotName } from '@meith/theme-kit'

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
      unreadNotifications: 3,
      unreadMessages: 1,
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
    },
    requires: ['Europe/London', '/contact'],
  },

  Notice: {
    model: { kind: 'warning', message: 'Scheduled maintenance at 22:00.', dismissHref: '/notice/4/dismiss' },
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
        plugins: pluginRegion('index.footer'),
        announcements: region('announcements'),
      },
    },
    requires: [
      region('categories'),
      region('stats'),
      region('online'),
      pluginRegion('index.footer'),
      region('announcements'),
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
    model: { thread: THREAD, select: null },
    requires: ['Bikeshedding the bike shed', '/thread/91-bikeshedding', '27'],
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
