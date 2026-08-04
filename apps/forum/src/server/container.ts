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
 * it would have to import `@meith/db`, which the R2 boundary rules forbid for
 * everything except the app tier.
 *
 * `server-only` makes a mis-import from a client component a build error rather
 * than a bundle that leaks the database client to the browser.
 */
import {
  BanService,
  IdentityService,
  SessionService,
  createMemoryStore,
  type AccountStore,
  type MemberProfileRepository,
  type MemberSettingsRepository,
} from '@meith/accounts'
import {
  Authorizer,
  InMemoryAuthorizationSource,
  type ActorSource,
  type AuthorizationSource,
  type BypassEvent,
} from '@meith/authorization'
import type { AttachmentRepository } from '@meith/attachments'
import type { AvatarRepository } from '@meith/avatars'
import { env, logger } from '@meith/core'
import { CachedForumRepository, type ForumRepository } from '@meith/forums'
import type {
  InlineModerationRepository,
  ModerationQueueRepository,
  ReportRepository,
  ThreadToolsRepository,
  ModCpRepository,
  ThreadSurgeryRepository,
  WarningBanPort,
  WarningRepository,
} from '@meith/moderation'
import type { NotificationRepository } from '@meith/notifications'
import type { PostRepository, PostWriteRepository } from '@meith/posts'
import type { MessageRepository } from '@meith/messages'
import type { RelationRepository } from '@meith/relations'
import type { AdminLogRepository, AdminSessionRepository } from '@meith/admin'
import type { ReputationRepository } from '@meith/reputation'
import type { PollRepository, ThreadRatingRepository } from '@meith/polls'
import type { ProfileFieldRepository } from '@meith/profile-fields'
import type { SubscriptionRepository } from '@meith/subscriptions'
import type {
  ReadStateRepository,
  ReplyWriteRepository,
  ThreadRepository,
  ThreadWriteRepository,
} from '@meith/threads'
import type { TaskDefinition, TaskRepository } from '@meith/tasks'
import { imageProcessor } from '@meith/drivers/images'
import { buildSchedulerBundle } from '@meith/runtime'
import {
  getDb,
  PostgresAuthorizationSource,
  ActorBuilder,
  createPostgresAccountStore,
  PostgresBanRepository,
  PostgresForumRepository,
  PostgresThreadRepository,
  PostgresThreadWriteRepository,
  PostgresPostWriteRepository,
  PostgresModerationQueueRepository,
  PostgresReportRepository,
  PostgresThreadToolsRepository,
  PostgresThreadSurgeryRepository,
  PostgresInlineModerationRepository,
  PostgresWarningRepository,
  PostgresNotificationRepository,
  PostgresSubscriptionRepository,
  PostgresMemberSettingsRepository,
  PostgresMessageRepository,
  PostgresRelationRepository,
  PostgresReputationRepository,
  PostgresPollRepository,
  PostgresSignatureRepository,
  PostgresAdminLogRepository,
  PostgresAdminSessionRepository,
  PostgresAttachmentRepository,
  PostgresAvatarRepository,
  PostgresProfileFieldRepository,
  PostgresModCpRepository,
  PostgresPostRepository,
  PostgresReadStateRepository,
  PostgresMemberProfileRepository,
  PostgresThreadViewBuffer,
} from '@meith/db'
import { drivers } from '@meith/drivers'

import forumConfig from '../../forum.config'

import { AUTH_CONFIG, REMEMBER_DAYS, SESSION_IDLE_DAYS } from './auth-config'
import { FixtureActorSource } from './fixture-actor-source'
import { FixtureForumRepository } from './fixture-forum-repo'
import { FixtureMemberProfileRepository } from './fixture-member-profile-repo'
import { FixturePostRepository } from './fixture-post-repo'
import { FixtureThreadRepository } from './fixture-thread-repo'
import { FIXTURE_DATA_VERSION, SEED_BOARD, SEED_GROUP } from './seed-board'

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
  /**
   * Warnings (F53). `null` in fixture mode (D38) — a warning that vanishes on
   * restart is worse than none, because a member's history is the whole record
   * and a lost one is a punishment nobody can account for.
   */
  readonly warnings: WarningRepository | null
  /**
   * How a warning level bans somebody (F53). F23 owns the mechanism; this is
   * the one verb the warning service is allowed to reach, so a future change
   * cannot make it *lift* a ban — that stays a human decision (D52).
   */
  readonly warningBans: WarningBanPort | null
  /** The ModCP's reads (F54). `null` in fixture mode (D38). */
  readonly modcp: ModCpRepository | null
  /**
   * Notifications and their e-mail preferences (F55). `null` in fixture mode
   * (D38): a notification that vanishes on restart is worse than none, because
   * the centre is the board's record of what a member was told — and the mail
   * half needs an outbox row, which sample data has nowhere to put.
   */
  readonly notifications: NotificationRepository | null
  /**
   * Thread and forum subscriptions (F56). `null` in fixture mode (D38): both
   * tables are durable by nature — a follow list that resets on restart is a
   * member being silently unsubscribed — and the notifier behind them needs a
   * scheduler, which fixture mode also refuses.
   */
  readonly subscriptions: SubscriptionRepository | null
  /**
   * The member's own settings (F57): timezone, page sizes, profile fields.
   * `null` in fixture mode (D38), where the UserCP is absent rather than a
   * screen whose Save button loses everything on restart.
   */
  readonly memberSettings: MemberSettingsRepository | null
  /**
   * Custom profile fields (F59). `null` in fixture mode (D38): the fields are
   * operator configuration and the answers are member data, and both would
   * vanish on restart — so the board offers neither rather than a form whose
   * Save button forgets.
   */
  readonly profileFields: ProfileFieldRepository | null
  /**
   * Private messages (F60). `null` in fixture mode (D38): a message is
   * addressed to one person and is the one thing on this board nobody else
   * will mention to them, so a mailbox that empties on restart is worse than a
   * board that plainly has no messaging.
   */
  readonly messages: MessageRepository | null
  /**
   * Buddy and ignore lists (F61). `null` in fixture mode (D38): an ignore list
   * that resets on restart is a member discovering they can read somebody they
   * decided not to, which is the one failure this feature exists to prevent.
   */
  readonly relations: RelationRepository | null
  /**
   * Reputation (F62). `null` in fixture mode (D38): the total on `users` is
   * derived from these rows, so a store that empties on restart would leave
   * every member's number at whatever the sample data says.
   */
  readonly reputation: ReputationRepository | null
  /** Polls and per-thread ratings (F43). Durable only, so absent in fixture mode. */
  readonly polls: (PollRepository & ThreadRatingRepository) | null
  /**
   * Signatures (F58). `null` in fixture mode (D38), where the UserCP is absent
   * anyway — and a signature that resets on restart is a moderator's lock
   * quietly lifting itself.
   */
  readonly signatures: PostgresSignatureRepository | null
  /**
   * The ACP's own session store and audit log (F63). Both `null` in fixture
   * mode (D38) — a control panel whose session dies with the process is one
   * that cannot be signed into twice, and an audit log that resets on restart
   * is the opposite of an audit log.
   */
  readonly adminSessions: AdminSessionRepository | null
  readonly adminLog: AdminLogRepository | null
  /**
   * Attachments (F42). `null` in fixture mode (D38) — an upload that survives
   * validation, re-encoding and a queued job and *then* disappears on restart
   * is worse than a board that says it cannot accept files.
   */
  readonly attachments: AttachmentRepository | null
  /**
   * Avatars (F58's other half). `null` in fixture mode (D38) — the same reason
   * attachments are: an upload that survives validation and a queued re-encode
   * and then vanishes on restart is worse than a board that says it cannot take
   * one.
   */
  readonly avatars: AvatarRepository | null
  /**
   * The credential store behind identity (F17–F19).
   *
   * Exposed for F57's UserCP, which re-authenticates with the current password
   * and issues an `email_change` token — both of which are `AccountStore`
   * operations that `IdentityService` deliberately does not wrap, because they
   * are not part of registering or logging in.
   */
  readonly accountStore: AccountStore
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
  /** F55's failure notifier, passed to `tick()` as `onError`. */
  readonly onTaskFailure: (taskId: string, error: unknown) => void
}

/*
 * Built once per process and memoised. Next.js may evaluate a module more than
 * once across bundles, so the instance is parked on a well-known globalThis key
 * — the same trick the pg client uses — to guarantee a single Authorizer (and
 * therefore a single audit-log sink) per runtime.
 */
const GLOBAL_KEY = Symbol.for('@meith/forum.container')

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
    signatures: null,
    adminSessions: null,
    adminLog: null,
    attachments: null,
    avatars: null,
    posts: new FixturePostRepository(),
    readState: null,
    memberProfiles: new FixtureMemberProfileRepository(),
    threadViews: null,
    fixtureDataVersion: FIXTURE_DATA_VERSION,
    ...identityServices(store),
    accountStore: store,
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

/**
 * The Postgres branch.
 *
 * `@meith/db` is imported **statically**, at the top of this file. It used to
 * be a synchronous `require()` inside this function, on the reasoning that the
 * fixture path should never pull in postgres.js — and that turned out to be
 * both unnecessary and actively broken.
 *
 * *Unnecessary*, because importing the module opens nothing: `getDb()` creates
 * the client lazily and throws in fixture mode, so the property the require was
 * protecting ("building the container in fixture mode must not open a socket")
 * is a property of `getDb`, not of the import. The cost of the static import is
 * bundle size in a *server* bundle nobody downloads.
 *
 * *Broken*, because Turbopack resolves `@meith/db` as an **async module** — its
 * graph reaches postgres.js — and a synchronous `require()` of an async module
 * yields the pending namespace rather than the exports. Every destructured
 * binding came back `undefined`, so the first call, `getDb()`, failed with
 * `TypeError: c is not a function`. Intermittently: it depended on whether the
 * chunk had been awaited elsewhere first, which is why it read as flaky and why
 * it survived so long.
 *
 * Nothing caught it because CI only ever built `DATA_SOURCE=fixture`, which
 * takes the branch above and never runs this function. The Postgres build path
 * had never been built or booted anywhere — see the `image` job in ci.yml,
 * which now boots it.
 */
function buildPostgres(onBypass: (e: BypassEvent) => void): Container {
  const db = getDb()
  const authorizationSource = new PostgresAuthorizationSource(db)
  const store: AccountStore = createPostgresAccountStore(db)
  const threadViews = new PostgresThreadViewBuffer(db)
  const warningRepo = new PostgresWarningRepository(db)
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
    warnings: warningRepo,
    modcp: new PostgresModCpRepository(db),
    notifications: new PostgresNotificationRepository(db),
    subscriptions: new PostgresSubscriptionRepository(db),
    memberSettings: new PostgresMemberSettingsRepository(db),
    profileFields: new PostgresProfileFieldRepository(db),
    messages: new PostgresMessageRepository(db),
    relations: new PostgresRelationRepository(db),
    reputation: new PostgresReputationRepository(db),
    polls: new PostgresPollRepository(db),
    signatures: new PostgresSignatureRepository(db),
    adminSessions: new PostgresAdminSessionRepository(db),
    adminLog: new PostgresAdminLogRepository(db),
    attachments: new PostgresAttachmentRepository(db),
    avatars: new PostgresAvatarRepository(db),
    warningBans: {
      async ban(input) {
        await new BanService({
          bans: new PostgresBanRepository(db),
          bannedGroupId: SEED_GROUP.banned,
        }).ban(input)
      },
    },
    posts: new PostgresPostRepository(db),
    readState: new PostgresReadStateRepository(db),
    memberProfiles: new PostgresMemberProfileRepository(db),
    threadViews,
    fixtureDataVersion: null,
    accountStore: store,
    ...identityServices(store),
    /*
     * F13's `task:run` and F04's worker build the identical object, so the
     * wiring lives in `@meith/runtime` rather than here — see that package's
     * header for why it is allowed to import `@meith/db` when domain packages
     * are not. The client is handed in so a request does not open a second pool.
     */
    scheduler: buildSchedulerBundle({
      queue: drivers().queue,
      db,
      /*
       * F55. The mail driver and the installed theme's key are app knowledge —
       * `forum.config.ts` is read by the app tier and neither the worker nor
       * the CLI can see it — so the app hands both to the bundle rather than
       * letting it guess. Without the driver the mail handler is not registered
       * at all, which is the D32 shape: absent rather than failing.
       */
      mail: drivers().mail,
      themeKey: forumConfig.defaultTheme,
      /*
       * F42. The serverless profile drains the queue through
       * `/api/system/tick`, so the re-encode handler has to be registered here
       * too — a board on Vercel has no worker process, and an attachment that
       * only processes on a self-hosted deployment would be a feature that
       * exists on one target and not the other.
       */
      files: drivers().files,
      images: imageProcessor,
    }),
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
    cached.warnings === undefined ||
    cached.warningBans === undefined ||
    cached.modcp === undefined ||
    cached.notifications === undefined ||
    cached.subscriptions === undefined ||
    cached.memberSettings === undefined ||
    cached.profileFields === undefined ||
    cached.messages === undefined ||
    cached.relations === undefined ||
    cached.reputation === undefined ||
    cached.polls === undefined ||
    cached.signatures === undefined ||
    cached.adminSessions === undefined ||
    cached.adminLog === undefined ||
    cached.attachments === undefined ||
    cached.avatars === undefined ||
    typeof cached.memberProfiles?.findPublicById !== 'function' ||
    (cached.dataSource === 'fixture' &&
      cached.fixtureDataVersion !== FIXTURE_DATA_VERSION) ||
    (cached.dataSource === 'postgres' &&
      typeof cached.readState?.forUser !== 'function')
  ) {
    g[GLOBAL_KEY] = build()
  }
  return g[GLOBAL_KEY] as Container
}

/** Convenience: the shared Authorizer. */
export function getAuthorizer(): Authorizer {
  return getContainer().authorizer
}
