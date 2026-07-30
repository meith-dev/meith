/**
 * The default in-memory board used when `DATA_SOURCE=fixture`.
 *
 * This is the app's *own* demo/dev data, intentionally separate from the F22
 * test fixture in `@forum/authorization`. The F22 board is tuned to exercise
 * every matrix cell; this one is tuned to be a believable little forum you can
 * click around in with no database attached. Coupling the two would mean a tweak
 * to a permission test could silently change what a demo visitor sees.
 *
 * Group IDs mirror the seed migration's canonical groups so that switching
 * `DATA_SOURCE` from `fixture` to `postgres` does not renumber anything.
 */
import {
  emptyPermissionSet,
  type ForumPermissions,
  type PermissionSet,
} from '@forum/core'
import type { GroupDefaults, MemoryBoard } from '@forum/authorization'

/** Canonical seed groups (must match the seed migration). */
export const SEED_GROUP = {
  guest: 1,
  registered: 2,
  administrators: 3,
  superModerators: 4,
} as const

/** Canonical seed forums. */
export const SEED_FORUM = {
  announcements: 100,
  general: 200,
  generalOffTopic: 201, // child of general
} as const

function group(over: Partial<PermissionSet>): PermissionSet {
  return { ...emptyPermissionSet(), ...over }
}

const READ = {
  canView: true,
  canViewThreads: true,
  canViewOthersThreads: true,
  canSearch: true,
} as const

const POST = {
  ...READ,
  canPostThreads: true,
  canPostReplies: true,
  canSubscribe: true,
} as const

const GROUPS: GroupDefaults[] = [
  { groupId: SEED_GROUP.guest, permissions: group(READ) },
  {
    groupId: SEED_GROUP.registered,
    permissions: group({ ...POST, canUploadAttachments: true }),
  },
  {
    groupId: SEED_GROUP.administrators,
    permissions: group({
      ...POST,
      canUploadAttachments: true,
      isAdministrator: true,
      canAccessAdminCp: true,
      canAccessModCp: true,
    }),
  },
  {
    groupId: SEED_GROUP.superModerators,
    permissions: group({
      ...POST,
      canUploadAttachments: true,
      isSuperModerator: true,
      canAccessModCp: true,
    }),
  },
]

/** Announcements: everyone reads, only staff post (guests/registered read-only). */
const ANNOUNCEMENT_READONLY: Partial<ForumPermissions> = {
  canPostThreads: false,
  canPostReplies: false,
}

export const SEED_BOARD: MemoryBoard = {
  groups: GROUPS,
  chains: {
    [SEED_FORUM.announcements]: [SEED_FORUM.announcements],
    [SEED_FORUM.general]: [SEED_FORUM.general],
    [SEED_FORUM.generalOffTopic]: [
      SEED_FORUM.generalOffTopic,
      SEED_FORUM.general,
    ],
  },
  overrides: [
    {
      forumId: SEED_FORUM.announcements,
      groupId: SEED_GROUP.guest,
      overrides: ANNOUNCEMENT_READONLY,
    },
    {
      forumId: SEED_FORUM.announcements,
      groupId: SEED_GROUP.registered,
      overrides: ANNOUNCEMENT_READONLY,
    },
  ],
}
