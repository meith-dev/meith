import { renderMarkdown } from '@meith/markdown'
import type { SlotModels, SlotName } from '@meith/theme-kit'

import { SLOT_FIXTURES } from './contract.fixture'

const base = SLOT_FIXTURES
const zero = { value: 0, label: '0' }
const guest = base.Shell.model.viewer
const thread = base.ThreadView.model.thread
const post = base.PostBit.model.post
const forum = base.ForumRow.model.forum
const selection = {
  name: 'ids',
  value: '4102',
  formId: 'fixture-selection',
  label: 'Select for moderation',
}

export const SLOT_VARIANTS: {
  readonly [K in SlotName]?: Readonly<Record<string, Partial<SlotModels[K]>>>
} = {
  Header: {
    guest: { viewer: guest },
    staff: {
      viewer: { ...base.Header.model.viewer, canAccessAdminCp: true, canAccessModCp: true },
    },
  },
  UserPanel: {
    guest: {
      viewer: guest,
      links: [
        { label: 'Log in', href: '/login' },
        { label: 'Register', href: '/register' },
      ],
      unreadNotifications: zero,
      unreadMessages: zero,
      children: null,
    },
    staff: {
      viewer: { ...base.UserPanel.model.viewer, canAccessAdminCp: true },
      links: [
        { label: 'Admin CP', href: '/admin' },
        { label: 'Moderator CP', href: '/modcp' },
      ],
      unreadNotifications: { value: 124, label: '124' },
    },
  },
  Notice: {
    info: { kind: 'info', message: 'Welcome to the community.' },
    success: { kind: 'success', message: 'Your changes were saved.' },
    error: { kind: 'error', message: 'Your changes could not be saved.' },
  },
  BoardIndex: {
    empty: {
      markAllReadAction: null,
      regions: { categories: null, stats: null, online: null, latest: null },
    },
  },
  ForumRow: {
    empty: {
      forum: {
        ...forum,
        isUnread: false,
        threadCount: zero,
        postCount: zero,
        lastPost: null,
        subforums: [],
      },
    },
    link: {
      forum: {
        ...forum,
        type: 'link',
        title: 'Community website',
        href: 'https://meith.dev',
        lastPost: null,
        subforums: [],
      },
    },
    long: {
      forum: {
        ...forum,
        title:
          'Community projects, questions, resources and announcements for everyone working together',
        description:
          'A longer description tests wrapping on narrow screens without hiding the activity counts or subforum navigation.',
      },
    },
  },
  ForumDisplay: {
    empty: {
      forum: { ...forum, threadCount: zero, postCount: zero, lastPost: null },
      regions: { threads: null, pagination: null, subforums: null },
    },
  },
  ThreadRow: {
    read: {
      thread: { ...thread, isSticky: false, isUnread: false, prefix: null, visibility: 'visible' },
    },
    locked: { thread: { ...thread, isLocked: true } },
    moved: { thread: { ...thread, isMoved: true } },
    unapproved: { thread: { ...thread, visibility: 'unapproved' }, select: selection },
    deleted: { thread: { ...thread, visibility: 'deleted' }, select: selection },
    long: {
      thread: {
        ...thread,
        title:
          'How should we organise the next community gathering when members are travelling from several different time zones?',
      },
    },
  },
  ThreadView: {
    guest: { replyHref: null, markReadAction: null, watch: null },
    locked: { thread: { ...thread, isLocked: true }, replyHref: null, watch: null },
    poll: {},
  },
  PostBit: {
    unapproved: { post: { ...post, visibility: 'unapproved' }, select: selection },
    deleted: { post: { ...post, visibility: 'deleted' }, select: selection },
    ignored: {
      post: {
        ...post,
        bodyHtml: '',
        quoteSource: '',
        attachments: [],
        ignored: { authorUsername: post.author.username, revealHref: '/fixtures?slot=PostBit' },
      },
    },
    guest: {
      post: {
        ...post,
        author: {
          ...post.author,
          userId: null,
          profileHref: null,
          avatarUrl: null,
          signatureHtml: null,
          groups: [],
          fields: [],
          isOnline: false,
        },
        attachments: [],
        editedNote: null,
      },
    },
    rich: {
      post: {
        ...post,
        bodyHtml: renderMarkdown(
          '## Formatting and media\n\n**Bold**, *italic*, ~~removed~~ and [linked text](/).\n\n> A nested conversation.\n>\n> > The earlier reply.\n\n- One item\n- Another item\n\n1. First step\n2. Next step\n\n- [x] Checked task\n- [ ] Open task\n\n```ts\nconst greeting = "Hello, community";\n```\n\n| Day | Activity |\n| --- | --- |\n| Friday | Meetup |\n\n:::spoiler\nThe shed is green.\n:::\n\nLongUnbrokenContentToCheckWrapping0123456789LongUnbrokenContentToCheckWrapping0123456789LongUnbrokenContentToCheckWrapping0123456789',
        ).html,
        author: {
          ...post.author,
          reputation: { value: 1240, label: '1,240' },
          badge: { src: '/placeholder-logo.svg', darkSrc: null, alt: 'Community helper' },
        },
        attachments: [
          ...post.attachments,
          {
            id: 56,
            filename: 'robots.txt',
            size: '124 B',
            isImage: false,
            href: '/robots.txt',
            thumbnailHref: null,
            width: null,
            height: null,
          },
        ],
      },
    },
  },
  PostActions: {
    guest: {
      actions: {
        quoteHref: null,
        editHref: null,
        restoreHref: null,
        reportHref: null,
        warnHref: null,
        moderateHref: null,
        rateHref: null,
      },
    },
    staff: {
      actions: {
        ...post.actions,
        restoreHref: '/fixtures',
        warnHref: '/fixtures',
        moderateHref: '/fixtures',
        rateHref: '/fixtures',
      },
    },
  },
  PostForm: {
    thread: { mode: 'thread', heading: 'Post a new thread', errorMessage: null },
    edit: { mode: 'edit', heading: 'Edit your post', errorMessage: null },
  },
  MemberProfile: {
    minimal: {
      avatarUrl: null,
      title: null,
      groups: [],
      signatureHtml: null,
      fields: [],
      actions: [],
      lastVisitAt: null,
      regions: {},
    },
  },
  SearchForm: {
    blank: {
      query: '',
      errorMessage: null,
      advanced: { ...base.SearchForm.model.advanced!, isOpen: false },
    },
  },
  SearchResults: {
    empty: {
      hits: [],
      nextHref: null,
      refine: {
        ...base.SearchResults.model.refine!,
        summary: 'No matching posts.',
        choices: [],
        applied: [],
      },
    },
  },
  DiscoveryView: {
    empty: { rows: [], nextHref: null },
    refused: {
      rows: [],
      nextHref: null,
      refusal: {
        message: 'Sign in to see your unread threads.',
        signInHref: '/login',
        signInLabel: 'Log in',
      },
    },
  },
  WhoIsOnline: {
    empty: {
      guestCount: zero,
      members: [],
      memberCount: zero,
      total: zero,
      recordCount: zero,
      recordAt: null,
    },
  },
  LatestThreads: { empty: { threads: [] } },
  LatestPosts: { empty: { posts: [] } },
  BoardStats: {
    empty: {
      threadCount: zero,
      postCount: zero,
      memberCount: zero,
      newestMember: null,
      computedAt: null,
    },
  },
  Pagination: {
    single: {
      page: 1,
      pageCount: 1,
      pages: [{ page: 1, href: '/fixtures?slot=Pagination', isCurrent: true }],
      previousHref: null,
      nextHref: null,
    },
  },
  PanelShell: { modcp: { panel: 'modcp' }, admincp: { panel: 'admincp' } },
  PanelNav: { modcp: { panel: 'modcp' }, admincp: { panel: 'admincp' } },
  PanelPage: {
    usercp: { panel: 'usercp' },
    modcp: { panel: 'modcp' },
    standalone: { panel: null, frame: 'standalone' },
  },
  AuthPage: {
    login: { alert: null },
    register: { title: 'Create an account', alert: null },
    reset: { title: 'Reset your password', alert: null },
  },
  ErrorNotice: {
    forbidden: {
      status: 403,
      title: 'Access denied',
      message: 'You do not have permission to view this page.',
    },
    unavailable: {
      status: 503,
      title: 'Temporarily unavailable',
      message: 'Please try again in a few minutes.',
    },
  },
}

export function fixtureModel<K extends SlotName>(name: K, variant = 'default'): SlotModels[K] {
  return { ...SLOT_FIXTURES[name].model, ...SLOT_VARIANTS[name]?.[variant] }
}

export function fixtureVariants(name: SlotName): readonly string[] {
  return ['default', ...Object.keys(SLOT_VARIANTS[name] ?? {})]
}
