export const PERMISSION_ACTIONS = [
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

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

const ALL: readonly PermissionAction[] = PERMISSION_ACTIONS

const MEMBER_PUBLIC: readonly PermissionAction[] = [
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

const MEMBER_READONLY: readonly PermissionAction[] = [
  'view',
  'editOwn',
  'deleteOwn',
  'upload',
  'download',
  'search',
  'subscribe',
]

const MOD_PUBLIC: readonly PermissionAction[] = ALL

const MOD_READONLY: readonly PermissionAction[] = [
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

export type ExpectedMatrix = Record<string, Record<string, readonly PermissionAction[]>>

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
