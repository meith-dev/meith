import 'server-only'

/**
 * The composition root (D11).
 *
 * This is the one module allowed to know *which* implementations back the
 * domain's ports. It reads `env.DATA_SOURCE` and constructs either the Postgres
 * adapters or their in-memory equivalents, wires cross-cutting concerns (the
 * authorization bypass logger), and hands back ready-to-use services. Domain
 * packages never see this file; they receive already-constructed objects.
 *
 * It lives in `apps/forum/src/server` rather than a package because assembling
 * concrete infrastructure is precisely an application concern — a package doing
 * it would have to import `@forum/db`, which the R2 boundary rules forbid for
 * everything except the app tier.
 *
 * `server-only` makes a mis-import from a client component a build error rather
 * than a bundle that leaks the database client to the browser.
 */
import {
  IdentityService,
  SessionService,
  createMemoryStore,
  type AccountStore,
  type MemberProfileRepository,
} from '@forum/accounts'
import {
  Authorizer,
  InMemoryAuthorizationSource,
  type ActorSource,
  type AuthorizationSource,
  type BypassEvent,
} from '@forum/authorization'
import { env, logger } from '@forum/core'
import { CachedForumRepository, type ForumRepository } from '@forum/forums'
import type {
  InlineModerationRepository,
  ModerationQueueRepository,
  ReportRepository,
  ThreadToolsRepository,
  ThreadSurgeryRepository,
} from '@forum/moderation'
import type { PostRepository, PostWriteRepository } from '@forum/posts'
import type {
  ReadStateRepository,
  ReplyWriteRepository,
  ThreadRepository,
  ThreadWriteRepository,
} from '@forum/threads'
import { builtinTasks, type TaskDefinition, type TaskRepository } from '@forum/tasks'
import { drivers } from '@forum/drivers'

import { AUTH_CONFIG, REMEMBER_DAYS, SESSION_IDLE_DAYS } from './auth-config'
import { buildEventRegistry } from './event-handlers'
import { FixtureActorSource } from './fixture-actor-source'
import { FixtureForumRepository } from './fixture-forum-repo'
import { FixtureMemberProfileRepository } from './fixture-member-profile-repo'
import { FixturePostRepository } from './fixture-post-repo'
import { FixtureThreadRepository } from './fixture-thread-repo'
import { FIXTURE_DATA_VERSION, SEED_BOARD } from './seed-board'
import { defaultPromotionGuards, taskWorkers } from './task-workers'

/** The services the app resolves from the container. */
export interface Container {
  readonly authorizer: Authorizer
  readonly authorizationSource: AuthorizationSource
  /** Turns a session's user id into the resolved Actor (F20). */
  readonly actorSource: ActorSource
  /** Register / login / logout / reset (F18, F19). */
  readonly identity: IdentityService
  /** Remember-me families + session rotation (F17). */
  readonly sessions: SessionService
  /**
   * The forum tree (F16), cached for the structural read and uncached for the
   * listing read — see `ForumRepository.listListing`.
   */
  readonly forums: ForumRepository
  /** Keyset-paged thread listing (F30). */
  readonly threads: ThreadRepository
  /**
   * The posting write path — new threads (F39) and replies (F40). One object
   * because both write a post and both read the same forum flags; splitting
   * them would mean two adapters over the same three tables.
   *
   * `null` in fixture mode, which serves sample data from memory and would lose
   * a thread on restart — the same refusal `FixtureForumRepository` makes for
   * structure (D38). The composer and reply routes, and the links to them, are
   * absent rather than broken when this is null.
   */
  readonly threadWrites: (ThreadWriteRepository & ReplyWriteRepository) | null
  /**
   * Editing, soft-deleting and restoring a post (F41).
   *
   * Separate from `threadWrites` because it is a different act on a different
   * table: that one creates content and moves counters up, this one mutates
   * content in place and moves them back. `null` in fixture mode for the same
   * reason (D38) — sample data has nothing durable to edit.
   */
  readonly postWrites: PostWriteRepository | null
  /**
   * The approval queue (F48). `null` in fixture mode for the same reason as
   * every other writer (D38) — and because a queue over sample data would show
   * a moderator work that cannot be done.
   */
  readonly moderationQueue: ModerationQueueRepository | null
  /** Reports (F49). `null` in fixture mode, like every other writer (D38). */
  readonly reports: ReportRepository | null
  /** Thread-level moderator tools (F50). `null` in fixture mode (D38). */
  readonly threadTools: ThreadToolsRepository | null
  /**
   * Merge and split (F51). Separate from `threadTools` because it moves posts
   * *between* threads rather than moving a thread — a different table and a
   * different arithmetic. `null` in fixture mode (D38).
   */
  readonly threadSurgery: ThreadSurgeryRepository | null
  /**
   * Inline bulk moderation (F52). Separate from `threadTools` because it acts
   * on a *selection* rather than on the thread a page is showing, and because
   * it has to re-read every id inside a permission scope before it touches one.
   * `null` in fixture mode (D38).
   */
  readonly inlineModeration: InlineModerationRepository | null
  /** Keyset-paged visible posts (F31). */
  readonly posts: PostRepository
  /** Durable member read state. Fixture mode deliberately has none. */
  readonly readState: ReadStateRepository | null
  /** Public profile lookup; deleted accounts deliberately do not resolve. */
  readonly memberProfiles: MemberProfileRepository
  /**
   * Buffered thread views (F38). `null` in fixture mode, which has no durable
   * store to buffer into — and a view count that resets on restart is worse
   * than an absent one, because it looks maintained.
   */
  readonly threadViews: ThreadViewRecorder | null
  /** Fixture data revision; makes HMR replace repositories holding old seed rows. */
  readonly fixtureDataVersion: number | null
  /**
   * The scheduler's storage and the tasks that can actually run (F06).
   *
   * `null` in fixture mode: the tick's whole job is durable, cross-instance
   * work, and an in-memory task table would let two instances run the same
   * task while each believed it held the claim. A tick with no database is
   * better refused than faked.
   */
  readonly scheduler: SchedulerBundle | null
  readonly dataSource: 'fixture' | 'postgres'
}

/** The half of F38's view buffer a request path is allowed to touch. */
export interface ThreadViewRecorder {
  record(threadId: number): Promise<void>
}

/** Everything `/api/system/tick` needs to do a real run. */
export interface SchedulerBundle {
  readonly repository: TaskRepository
  readonly tasks: readonly TaskDefinition[]
}

/*
 * Built once per process and memoised. Next.js may evaluate a module more than
 * once across bundles, so the instance is parked on a well-known globalThis key
 * — the same trick the pg client uses — to guarantee a single Authorizer (and
 * therefore a single audit-log sink) per runtime.
 */
const GLOBAL_KEY = Symbol.for('@forum/forum.container')

type GlobalWithContainer = typeof globalThis & {
  [GLOBAL_KEY]?: Container
}

function build(): Container {
  const log = logger({ module: 'authorization' })

  /*
   * Bypasses are security-relevant by definition: an administrator or
   * super-moderator overriding the permission matrix. Logging every one at info
   * level gives an audit trail without the domain layer knowing what a logger
   * is — the Authorizer just calls the callback the composition root supplied.
   */
  const onBypass = (event: BypassEvent): void => {
    log.info(
      {
        kind: event.kind,
        userId: event.userId,
        action: event.action,
        forumId: event.forumId ?? null,
      },
      'authorization bypass',
    )
  }

  if (env.DATA_SOURCE === 'postgres') {
    return buildPostgres(onBypass)
  }
  return buildFixture(onBypass)
}

function buildFixture(onBypass: (e: BypassEvent) => void): Container {
  const authorizationSource = new InMemoryAuthorizationSource(SEED_BOARD)
  const store: AccountStore = createMemoryStore()
  return {
    authorizationSource,
    authorizer: new Authorizer(authorizationSource, { onBypass }),
    actorSource: new FixtureActorSource(store),
    forums: cached(new FixtureForumRepository()),
    threads: new FixtureThreadRepository(),
    threadWrites: null,
    postWrites: null,
    moderationQueue: null,
    reports: null,
    threadTools: null,
    threadSurgery: null,
    inlineModeration: null,
    posts: new FixturePostRepository(),
    readState: null,
    memberProfiles: new FixtureMemberProfileRepository(),
    threadViews: null,
    fixtureDataVersion: FIXTURE_DATA_VERSION,
    ...identityServices(store),
    // See SchedulerBundle: a tick without durable, cross-instance state cannot
    // honour its concurrency guarantee, so fixture mode has no scheduler.
    scheduler: null,
    dataSource: 'fixture',
  }
}

/**
 * Both branches wrap their repository in the same cache decorator.
 *
 * Caching is a *policy*, which is why it is applied here rather than inside
 * either repository: the fixture path gets identical behaviour, so a caching bug
 * shows up in the app-tier tests instead of only against Postgres. The decorator
 * caches the structural tree read and deliberately passes the listing read
 * straight through — see `CachedForumRepository.listListing`.
 */
function cached(inner: ForumRepository): ForumRepository {
  return new CachedForumRepository(inner, drivers().cache)
}

/**
 * Both branches build the identity/session services identically over whatever
 * store they were handed — the only per-mode difference is the store and the
 * ActorSource, so this keeps the policy wiring in exactly one place.
 */
function identityServices(store: AccountStore): {
  identity: IdentityService
  sessions: SessionService
} {
  return {
    identity: new IdentityService({ store, config: AUTH_CONFIG }),
    sessions: new SessionService({
      store,
      rememberDays: REMEMBER_DAYS,
      sessionIdleDays: SESSION_IDLE_DAYS,
    }),
  }
}

/*
 * The Postgres branch is deliberately isolated behind a dynamic import so the
 * fixture path (dev, tests, the preview with no database) never pulls in the
 * postgres.js client or its connection-time env requirements. Building the
 * container in fixture mode must not open a socket.
 */
function buildPostgres(onBypass: (e: BypassEvent) => void): Container {
  /*
   * Synchronous require, one justified disable: getContainer() is synchronous
   * (Server Components call it without awaiting), and a static top-level import
   * of @forum/db would pull postgres.js into the fixture path too — defeating
   * the whole reason the branch exists. This line only runs when DATA_SOURCE is
   * already 'postgres', i.e. when DATABASE_URL has been validated at boot.
   */
  // Both disables apply to this one line and are both genuinely needed: the
  // sync require (see above) and the inline module-type annotation it requires.
  // prettier-ignore
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- justified lazy infra load
  const { getDb, PostgresAuthorizationSource, ActorBuilder, createPostgresAccountStore, PostgresBanRepository, PostgresPromotionRepository, PostgresTaskRepository, PostgresMaintenanceRepository, PostgresForumRepository, PostgresThreadRepository, PostgresThreadWriteRepository, PostgresPostWriteRepository, PostgresModerationQueueRepository, PostgresReportRepository, PostgresThreadToolsRepository, PostgresThreadSurgeryRepository, PostgresInlineModerationRepository, PostgresPostRepository, PostgresReadStateRepository, PostgresMemberProfileRepository, PostgresContentCounterRepository, PostgresCounterRecount, PostgresRenderBackfill, PostgresOutboxReader, PostgresThreadViewBuffer } = require('@forum/db') as typeof import('@forum/db')

  const db = getDb()
  const authorizationSource = new PostgresAuthorizationSource(db)
  const store: AccountStore = createPostgresAccountStore(db)
  const threadViews = new PostgresThreadViewBuffer(db)
  return {
    authorizationSource,
    authorizer: new Authorizer(authorizationSource, { onBypass }),
    // The guest group id is the seed board's canonical guest group (SEED_GROUP.guest
    // == 1), which the seed migration also uses — so fixture and Postgres guests
    // resolve the same group.
    actorSource: new ActorBuilder(db, { guestGroupId: 1 }),
    forums: cached(new PostgresForumRepository(db)),
    threads: new PostgresThreadRepository(db),
    threadWrites: new PostgresThreadWriteRepository(db),
    postWrites: new PostgresPostWriteRepository(db),
    moderationQueue: new PostgresModerationQueueRepository(db),
    reports: new PostgresReportRepository(db),
    threadTools: new PostgresThreadToolsRepository(db),
    threadSurgery: new PostgresThreadSurgeryRepository(db),
    inlineModeration: new PostgresInlineModerationRepository(db),
    posts: new PostgresPostRepository(db),
    readState: new PostgresReadStateRepository(db),
    memberProfiles: new PostgresMemberProfileRepository(db),
    threadViews,
    fixtureDataVersion: null,
    ...identityServices(store),
    scheduler: {
      repository: new PostgresTaskRepository(db),
      /*
       * A *partial* worker set: `builtinTasks` registers only what can run, so
       * a task whose worker does not exist yet is absent rather than stubbed.
       * See task-workers.ts and D32.
       */
      tasks: builtinTasks(
        taskWorkers({
          queue: drivers().queue,
          bans: new PostgresBanRepository(db),
          promotions: new PostgresPromotionRepository(db),
          guards: defaultPromotionGuards(),
          maintenance: new PostgresMaintenanceRepository(db),
          outbox: new PostgresOutboxReader(db),
          events: buildEventRegistry({
            counters: new PostgresContentCounterRepository(db),
          }),
          recount: new PostgresCounterRecount(db),
          renderBackfill: new PostgresRenderBackfill(db),
          threadViews,
        }),
      ),
    },
    dataSource: 'postgres',
  }
}

/** Resolve the process-wide container, building it on first use. */
export function getContainer(): Container {
  const g = globalThis as GlobalWithContainer
  const cached = g[GLOBAL_KEY] as Partial<Container> | undefined
  /*
   * Dev HMR retains globalThis. A newly-added repository method therefore
   * leaves the old implementation behind unless this checks the shape the
   * current routes actually need. Production creates a fresh process, so this
   * is only a cheap compatibility guard for a live dev server.
   */
  if (
    !cached ||
    typeof cached.threads?.locateForum !== 'function' ||
    typeof cached.posts?.listThread !== 'function' ||
    typeof cached.posts?.findVisibleById !== 'function' ||
    cached.readState === undefined ||
    cached.threadViews === undefined ||
    cached.threadWrites === undefined ||
    cached.postWrites === undefined ||
    cached.moderationQueue === undefined ||
    cached.reports === undefined ||
    cached.threadTools === undefined ||
    cached.threadSurgery === undefined ||
    cached.inlineModeration === undefined ||
    typeof cached.memberProfiles?.findPublicById !== 'function' ||
    (cached.dataSource === 'fixture' && cached.fixtureDataVersion !== FIXTURE_DATA_VERSION) ||
    (cached.dataSource === 'postgres' && typeof cached.readState?.forUser !== 'function')
  ) {
    g[GLOBAL_KEY] = build()
  }
  return g[GLOBAL_KEY] as Container
}

/** Convenience: the shared Authorizer. */
export function getAuthorizer(): Authorizer {
  return getContainer().authorizer
}
