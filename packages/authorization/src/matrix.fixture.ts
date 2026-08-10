export const F22_ACTIONS = [
  'view',
  'postThread',
  'postReply',
  'editOwn',
  'editOthers',
  'deleteOwn',
  'softDelete',
  'viewUnapproved',
  'viewDeleted',
  'approve',
  'lock',
  'stick',
  'move',
  'deleteThread',
  'merge',
  'split',
  'upload',
  'download',
  'search',
  'subscribe',
] as const

export type F22Action = (typeof F22_ACTIONS)[number]

const ALL: readonly F22Action[] = F22_ACTIONS

const MEMBER_PUBLIC: readonly F22Action[] = [
  'view',
  'postThread',
  'postReply',
  'editOwn',
  'deleteOwn',
  'upload',
  'download',
  'search',
  'subscribe',
]

const MEMBER_READONLY: readonly F22Action[] = [
  'view',
  'editOwn',
  'deleteOwn',
  'upload',
  'download',
  'search',
  'subscribe',
]

const MOD_PUBLIC: readonly F22Action[] = ALL

const MOD_READONLY: readonly F22Action[] = [
  'view',
  'editOwn',
  'editOthers',
  'deleteOwn',
  'softDelete',
  'viewUnapproved',
  'viewDeleted',
  'approve',
  'lock',
  'stick',
  'move',
  'deleteThread',
  'merge',
  'split',
  'upload',
  'download',
  'search',
  'subscribe',
]

export type ExpectedMatrix = Record<
  string,
  Record<string, readonly F22Action[]>
>

export const EXPECTED: ExpectedMatrix = {
  guest: {
    public: ['view', 'search'],
    publicSub: ['view', 'search'],
    private: [],
    password: [],
  },

  registered: {
    public: MEMBER_PUBLIC,
    publicSub: MEMBER_READONLY,
    private: [],
    password: [],
  },

  secondary: {
    public: MEMBER_PUBLIC,
    publicSub: MEMBER_READONLY,
    private: [],
    password: [],
  },

  forumModerator: {
    public: MOD_PUBLIC,
    publicSub: MOD_READONLY,
    private: [],
    password: [],
  },

  superModerator: {
    public: ALL,
    publicSub: ALL,
    private: ALL,
    password: ALL,
  },

  administrator: {
    public: ALL,
    publicSub: ALL,
    private: ALL,
    password: ALL,
  },

  banned: {
    public: [],
    publicSub: [],
    private: [],
    password: [],
  },

  awaiting: {
    public: ['view', 'search'],
    publicSub: ['view', 'search'],
    private: [],
    password: [],
  },
}
