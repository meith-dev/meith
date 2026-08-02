/**
 * One place that knows the shape of a test container.
 *
 * `getContainer()` keeps a compatibility guard: if the memoised object is
 * missing a field the current routes need, it throws the object away and builds
 * a real one. That is right for a live dev server (D14) and brutal for tests —
 * an app-tier test installs a hand-written container, and the day a feature adds
 * a field *every one of them* silently falls back to the fixture container and
 * fails somewhere unrelated to what it was testing.
 *
 * Phase 4 hit that three times in one pass: F52 added `inlineModeration`, F53
 * added `warnings` and `warningBans`, F54 added `modcp`, and each one meant
 * editing the same six test files to add a `null`. This helper makes the next
 * field one edit here.
 *
 * **Everything defaults to absent**, and that is deliberate rather than lazy: a
 * test that forgets to supply the repository it exercises gets the "this board
 * is running on in-memory sample data" refusal, which is a legible failure,
 * rather than a `null` dereference twelve frames deep.
 */
import { IdentityService, SessionService, createMemoryStore } from '@forum/accounts'
import type { MemoryAppointment, MemoryBoard } from '@forum/authorization'
import { Authorizer, InMemoryAuthorizationSource } from '@forum/authorization'

import { FixtureActorSource } from './fixture-actor-source'

import { FIXTURE_DATA_VERSION, SEED_BOARD } from './seed-board'

/**
 * The key `getContainer()` memoises under.
 *
 * Exported because a few tests reach past `installTestContainer` to mutate one
 * field mid-test (dropping a repository to prove a route refuses without it, or
 * swapping the Authorizer for a board with a hidden forum). Those are legitimate
 * and re-declaring the symbol in each file is how one of them ends up keyed on a
 * different string and silently tests nothing.
 */
export const CONTAINER_KEY = Symbol.for('@forum/forum.container')

/**
 * The fields a test may override.
 *
 * Deliberately `unknown`-valued rather than typed against `Container`: a test
 * supplies a fake with the three methods it needs, and requiring the full
 * interface would mean every test file carrying a stub for eleven methods it
 * never calls. The compile-time guarantee lives in `container.ts`; this is a
 * test double, and its job is to be cheap to write.
 */
export type TestContainerOverrides = Record<string, unknown>

export interface TestContainerOptions {
  /** Appointments for `forum_moderators` (F48). */
  readonly moderators?: readonly MemoryAppointment[]
  /** Extra per-forum permission overrides, appended to the seed board's. */
  readonly overrides?: MemoryBoard['overrides']
  /**
   * A whole replacement board, for the tests that build one (a hidden forum
   * with its own chain, say). Wins over `moderators`/`overrides`, which are the
   * convenience path for the common case of tweaking the seed board.
   */
  readonly board?: MemoryBoard
  /** Repositories and services this test actually exercises. */
  readonly container?: TestContainerOverrides
}

/**
 * Install a container for the current test.
 *
 * Returns the object it installed so a test can reach in and assert against a
 * fake it supplied, without keeping its own reference.
 */
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

    /*
     * Every writer absent by default — the same shape fixture mode has, and for
     * the same reason (D38). A test that needs one passes it in.
     */
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
    signatures: null,
    adminSessions: null,
    adminLog: null,
    attachments: null,
    avatars: null,
    /*
     * F57's credential store, plus the two services built over it.
     *
     * A real memory store rather than `null`, because unlike every repository
     * above these are not optional in the Container's type: identity works in
     * fixture mode and so does the UserCP's re-authentication. Building them
     * from the *same* store is what makes a test that changes a password and
     * then starts a session behave like the real thing.
     */
    ...identityOver(store),
    readState: null,
    threadViews: null,
    scheduler: null,

    /* The read ports, stubbed to "nothing here" rather than to null. */
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

/**
 * The identity trio, over one store.
 *
 * The config mirrors `auth-config.ts` closely enough for the paths a test
 * exercises; it is deliberately not imported, because that module reads `env`
 * and a test container should not need a configured environment to exist.
 */
function identityOver(store: ReturnType<typeof createMemoryStore>) {
  return {
    accountStore: store,
    /*
     * The same `ActorSource` fixture mode wires, over the same store. It was
     * missing until F60 needed it: nothing in the app tier had built an actor
     * for *somebody else* before — every screen resolves the viewer's actor
     * through `getActor`, which tests mock. F60's message policy asks about the
     * recipient, and an absent source threw rather than answering.
     */
    actorSource: new FixtureActorSource(store),
    identity: new IdentityService({
      store,
      config: {
        minPasswordLength: 8,
        usernameMin: 3,
        usernameMax: 30,
        activationMethod: 'none',
        maxLoginAttempts: 5,
        lockoutMinutes: 15,
        sessionIdleDays: 30,
        resetTokenTtlMinutes: 60,
        reservedUsernames: [],
        defaultMemberGroupId: 2,
      },
    }),
    sessions: new SessionService({ store, rememberDays: 30, sessionIdleDays: 30 }),
  }
}

/** Drop the installed container so the next `getContainer()` builds a real one. */
export function clearTestContainer(): void {
  delete (globalThis as Record<symbol, unknown>)[CONTAINER_KEY]
}

/**
 * An appointment carrying exactly the named rights, over one forum.
 *
 * Four of the six app-tier test files declared this identically. The default is
 * *no* rights, so a test naming `canOpenCloseThreads: true` is stating the whole
 * of what that moderator can do — which is what makes the granular-rights tests
 * readable.
 */
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
