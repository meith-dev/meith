import {
  IdentityService,
  SessionService,
  createMemoryStore,
} from '@meith/accounts'
import type { MemoryAppointment, MemoryBoard } from '@meith/authorization'
import { Authorizer, InMemoryAuthorizationSource } from '@meith/authorization'

import { FixtureActorSource } from './fixture-actor-source'

import { FIXTURE_DATA_VERSION, SEED_BOARD } from './seed-board'

export const CONTAINER_KEY = Symbol.for('@meith/forum.container')

export type TestContainerOverrides = Record<string, unknown>

export interface TestContainerOptions {
  readonly moderators?: readonly MemoryAppointment[]
  readonly overrides?: MemoryBoard['overrides']
  readonly board?: MemoryBoard
  readonly container?: TestContainerOverrides
}

export function installTestContainer(
  options: TestContainerOptions = {},
): Record<string, unknown> {
  const store = createMemoryStore()
  const board: MemoryBoard = options.board ?? {
    ...SEED_BOARD,
    moderators: options.moderators ?? [],
    overrides: [...SEED_BOARD.overrides, ...(options.overrides ?? [])],
  }

  const container = {
    authorizer: new Authorizer(new InMemoryAuthorizationSource(board), {}),

    threadWrites: null,
    postWrites: null,
    moderationQueue: null,
    reports: null,
    threadTools: null,
    threadSurgery: null,
    inlineModeration: null,
    warnings: null,
    warningBans: null,
    modcp: null,
    notifications: null,
    subscriptions: null,
    memberSettings: null,
    profileFields: null,
    messages: null,
    relations: null,
    reputation: null,
    polls: null,
    drafts: null,
    signatures: null,
    adminSessions: null,
    adminLog: null,
    attachments: null,
    avatars: null,
    ...identityOver(store),
    readState: null,
    threadViews: null,
    scheduler: null,

    threads: {
      locateForum: async () => null,
      findById: async () => null,
      listForum: async () => ({ rows: [], nextCursor: null }),
    },
    posts: {
      findVisibleById: async () => null,
      listThread: async () => ({ rows: [], nextAfterId: null }),
    },
    memberProfiles: { findPublicById: async () => null },
    forums: {
      listAll: async () => [],
      listListing: async () => [],
      findById: async () => null,
    },

    fixtureDataVersion: FIXTURE_DATA_VERSION,
    dataSource: 'fixture' as const,

    ...options.container,
  }

  ;(globalThis as Record<symbol, unknown>)[CONTAINER_KEY] = container
  return container
}

function identityOver(store: ReturnType<typeof createMemoryStore>) {
  return {
    accountStore: store,
    actorSource: new FixtureActorSource(store),
    identity: new IdentityService({
      store,
      config: {
        minPasswordLength: 8,
        usernameMin: 3,
        usernameMax: 30,
        activationMethod: 'none',
        maxLoginAttempts: 5,
        maxAccountLoginAttempts: 50,
        lockoutMinutes: 15,
        sessionIdleDays: 30,
        resetTokenTtlMinutes: 60,
        reservedUsernames: [],
        defaultMemberGroupId: 2,
      },
    }),
    sessions: new SessionService({
      store,
      rememberDays: 30,
      sessionIdleDays: 30,
    }),
  }
}

export function clearTestContainer(): void {
  delete (globalThis as Record<symbol, unknown>)[CONTAINER_KEY]
}

export function appointment(
  forumId: number,
  rights: Partial<MemoryAppointment> = {},
  userId = 3,
): MemoryAppointment {
  return {
    userId,
    forumId,
    cascadeToSubforums: false,
    canApproveContent: false,
    canEditPosts: false,
    canSoftDeletePosts: false,
    canRestorePosts: false,
    canOpenCloseThreads: false,
    canStickThreads: false,
    canMoveThreads: false,
    canMergeThreads: false,
    canSplitThreads: false,
    ...rights,
  }
}
