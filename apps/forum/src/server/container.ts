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
import { builtinTasks, type TaskDefinition, type TaskRepository } from '@forum/tasks'
import { drivers } from '@forum/drivers'

import { AUTH_CONFIG, REMEMBER_DAYS, SESSION_IDLE_DAYS } from './auth-config'
import { FixtureActorSource } from './fixture-actor-source'
import { FixtureForumRepository } from './fixture-forum-repo'
import { SEED_BOARD } from './seed-board'
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
  const { getDb, PostgresAuthorizationSource, ActorBuilder, createPostgresAccountStore, PostgresBanRepository, PostgresPromotionRepository, PostgresTaskRepository, PostgresMaintenanceRepository, PostgresForumRepository } = require('@forum/db') as typeof import('@forum/db')

  const db = getDb()
  const authorizationSource = new PostgresAuthorizationSource(db)
  const store: AccountStore = createPostgresAccountStore(db)
  return {
    authorizationSource,
    authorizer: new Authorizer(authorizationSource, { onBypass }),
    // The guest group id is the seed board's canonical guest group (SEED_GROUP.guest
    // == 1), which the seed migration also uses — so fixture and Postgres guests
    // resolve the same group.
    actorSource: new ActorBuilder(db, { guestGroupId: 1 }),
    forums: cached(new PostgresForumRepository(db)),
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
        }),
      ),
    },
    dataSource: 'postgres',
  }
}

/** Resolve the process-wide container, building it on first use. */
export function getContainer(): Container {
  const g = globalThis as GlobalWithContainer
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = build()
  }
  return g[GLOBAL_KEY]
}

/** Convenience: the shared Authorizer. */
export function getAuthorizer(): Authorizer {
  return getContainer().authorizer
}
