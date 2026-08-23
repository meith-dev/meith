import 'server-only'

import forumConfig from '@board/config'

import {
  type AccountStore,
  type BanLookup,
  BanService,
  createMemoryStore,
  enrolmentLookup,
  IdentityService,
  type MemberProfileRepository,
  type MemberSettingsRepository,
  SessionService,
} from '@meith/accounts'
import type { AdminLogRepository, AdminSessionRepository } from '@meith/admin'
import type { AttachmentRepository } from '@meith/attachments'
import {
  type ActorSource,
  type AuthorizationSource,
  Authorizer,
  type BypassEvent,
  InMemoryAuthorizationSource,
} from '@meith/authorization'
import type { AvatarRepository } from '@meith/avatars'
import { env, logger } from '@meith/core'
import {
  ActorBuilder,
  createPostgresAccountStore,
  getDb,
  PostgresAdminLogRepository,
  PostgresAdminSessionRepository,
  PostgresAttachmentRepository,
  PostgresAuthorizationSource,
  PostgresAvatarRepository,
  PostgresBanRepository,
  PostgresDraftRepository,
  PostgresForumRepository,
  PostgresInlineModerationRepository,
  PostgresMemberProfileRepository,
  PostgresMemberSettingsRepository,
  PostgresMessageRepository,
  PostgresModCpRepository,
  PostgresModerationQueueRepository,
  PostgresNotificationRepository,
  PostgresPollRepository,
  PostgresPostRepository,
  PostgresPostWriteRepository,
  PostgresProfileFieldRepository,
  PostgresReadStateRepository,
  PostgresRelationRepository,
  PostgresReportRepository,
  PostgresReputationRepository,
  PostgresSignatureRepository,
  PostgresSubscriptionRepository,
  PostgresThreadRepository,
  PostgresThreadSurgeryRepository,
  PostgresThreadToolsRepository,
  PostgresThreadViewBuffer,
  PostgresThreadWriteRepository,
  PostgresWarningRepository,
} from '@meith/db'
import { demoResetTask } from '@meith/demo'
import type { DraftRepository } from '@meith/drafts'
import { drivers } from '@meith/drivers'
import { imageProcessor } from '@meith/drivers/images'
import { CachedForumRepository, type ForumRepository } from '@meith/forums'
import type { MessageRepository } from '@meith/messages'
import type {
  InlineModerationRepository,
  ModCpRepository,
  ModerationQueueRepository,
  ReportRepository,
  ThreadSurgeryRepository,
  ThreadToolsRepository,
  WarningBanPort,
  WarningRepository,
} from '@meith/moderation'
import type { NotificationRepository } from '@meith/notifications'
import type { PollRepository, ThreadRatingRepository } from '@meith/polls'
import type { PostRepository, PostWriteRepository } from '@meith/posts'
import type { ProfileFieldRepository } from '@meith/profile-fields'
import type { RelationRepository } from '@meith/relations'
import type { ReputationRepository } from '@meith/reputation'
import { buildSchedulerBundle } from '@meith/runtime'
import type { SubscriptionRepository } from '@meith/subscriptions'
import type { TaskDefinition, TaskRepository } from '@meith/tasks'
import type {
  ReadStateRepository,
  ReplyWriteRepository,
  ThreadRepository,
  ThreadWriteRepository,
} from '@meith/threads'

import { ABSENT_SERVICES } from './absent-services'
import {
  AUTH_CONFIG,
  boardAuthConfig,
  boardSessionConfig,
  REMEMBER_DAYS,
  SESSION_LIFETIME_DAYS,
} from './auth-config'
import { clearUploadedFiles } from './demo-uploads'
import { FixtureActorSource } from './fixture-actor-source'
import { FixtureForumRepository } from './fixture-forum-repo'
import { FixtureMemberProfileRepository } from './fixture-member-profile-repo'
import { FixturePostRepository } from './fixture-post-repo'
import { FixtureThreadRepository } from './fixture-thread-repo'
import { translatorForLocale } from './i18n-catalogs'
import { boardRendering } from './markdown-pipeline'
import { activeDefinitions } from './plugin-host'
import { FIXTURE_DATA_VERSION, SEED_BOARD, SEED_GROUP } from './seed-board'

export interface Container {
  readonly authorizer: Authorizer
  readonly authorizationSource: AuthorizationSource
  readonly actorSource: ActorSource
  readonly identity: IdentityService
  readonly sessions: SessionService
  readonly banLookup: BanLookup | null
  readonly forums: ForumRepository
  readonly threads: ThreadRepository
  readonly threadWrites: (ThreadWriteRepository & ReplyWriteRepository) | null
  readonly postWrites: PostWriteRepository | null
  readonly moderationQueue: ModerationQueueRepository | null
  readonly reports: ReportRepository | null
  readonly threadTools: ThreadToolsRepository | null
  readonly threadSurgery: ThreadSurgeryRepository | null
  readonly inlineModeration: InlineModerationRepository | null
  readonly warnings: WarningRepository | null
  readonly warningBans: WarningBanPort | null
  readonly modcp: ModCpRepository | null
  readonly notifications: NotificationRepository | null
  readonly subscriptions: SubscriptionRepository | null
  readonly memberSettings: MemberSettingsRepository | null
  readonly profileFields: ProfileFieldRepository | null
  readonly messages: MessageRepository | null
  readonly relations: RelationRepository | null
  readonly reputation: ReputationRepository | null
  readonly polls: (PollRepository & ThreadRatingRepository) | null
  readonly drafts: DraftRepository | null
  readonly signatures: PostgresSignatureRepository | null
  readonly adminSessions: AdminSessionRepository | null
  readonly adminLog: AdminLogRepository | null
  readonly attachments: AttachmentRepository | null
  readonly avatars: AvatarRepository | null
  readonly accountStore: AccountStore
  readonly posts: PostRepository
  readonly readState: ReadStateRepository | null
  readonly memberProfiles: MemberProfileRepository
  readonly threadViews: ThreadViewRecorder | null
  readonly fixtureDataVersion: number | null
  readonly scheduler: SchedulerBundle | null
  readonly dataSource: 'fixture' | 'postgres'
}

export interface ThreadViewRecorder {
  record(threadId: number): Promise<void>
}

export interface SchedulerBundle {
  readonly repository: TaskRepository
  readonly tasks: readonly TaskDefinition[]
  readonly onTaskFailure: (taskId: string, error: unknown) => void
}

const GLOBAL_KEY = Symbol.for('@meith/forum.container')

type GlobalWithContainer = typeof globalThis & {
  [GLOBAL_KEY]?: Container
}

function build(): Container {
  const log = logger({ module: 'authorization' })

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
    ...ABSENT_SERVICES,
    posts: new FixturePostRepository(),
    memberProfiles: new FixtureMemberProfileRepository(),
    fixtureDataVersion: FIXTURE_DATA_VERSION,
    ...identityServices(store),
    accountStore: store,
    dataSource: 'fixture',
  }
}

function cached(inner: ForumRepository): ForumRepository {
  return new CachedForumRepository(inner, drivers().cache)
}

function identityServices(
  store: AccountStore,
  bans?: BanLookup,
): {
  identity: IdentityService
  sessions: SessionService
  banLookup: BanLookup | null
} {
  return {
    identity: new IdentityService({
      store,
      config: AUTH_CONFIG,
      secondFactor: enrolmentLookup(store.twoFactor),
      ...(bans === undefined ? {} : { bans }),
    }),
    sessions: new SessionService({
      store,
      rememberDays: REMEMBER_DAYS,
      sessionLifetimeDays: SESSION_LIFETIME_DAYS,
    }),
    banLookup: bans ?? null,
  }
}

function buildPostgres(onBypass: (e: BypassEvent) => void): Container {
  const db = getDb()
  const authorizationSource = new PostgresAuthorizationSource(db)
  const store: AccountStore = createPostgresAccountStore(db)
  const threadViews = new PostgresThreadViewBuffer(db)
  const warningRepo = new PostgresWarningRepository(db)
  return {
    authorizationSource,
    authorizer: new Authorizer(authorizationSource, { onBypass }),
    actorSource: new ActorBuilder(db, { guestGroupId: 1 }),
    forums: cached(new PostgresForumRepository(db)),
    threads: new PostgresThreadRepository(db),
    threadWrites: new PostgresThreadWriteRepository(db, boardRendering),
    postWrites: new PostgresPostWriteRepository(db, boardRendering),
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
    drafts: new PostgresDraftRepository(db),
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
    ...identityServices(store, new PostgresBanRepository(db)),
    scheduler: withDemoReset(
      buildSchedulerBundle({
        queue: drivers().queue,
        db,
        mail: drivers().mail,
        themeKey: forumConfig.defaultTheme,
        themeTokens: Object.fromEntries(
          Object.values(forumConfig.themes).map((theme) => [theme.key, theme.tokens]),
        ),
        files: drivers().files,
        images: imageProcessor,
        plugins: activeDefinitions(),
        translatorForLocale,
      }),
      db,
    ),
    dataSource: 'postgres',
  }
}

/**
 * The reset is registered here rather than in `buildSchedulerBundle` because
 * this is the only composition root with a cache to clear afterwards. The
 * worker's `NextCacheDriver` is a different process holding a different map, so
 * a reset it ran would leave this process serving the forum tree of a board
 * that no longer exists — for up to the tree's 60-second TTL, on the one page
 * every visitor lands on.
 */
function withDemoReset(bundle: SchedulerBundle, db: ReturnType<typeof getDb>): SchedulerBundle {
  if (!env.DEMO_MODE) return bundle

  return {
    ...bundle,
    tasks: [
      ...bundle.tasks,
      demoResetTask({
        db,
        cache: drivers().cache,
        clearUploads: () => clearUploadedFiles(),
        plugins: activeDefinitions(),
      }),
    ],
  }
}

export function getContainer(): Container {
  const g = globalThis as GlobalWithContainer
  const cached = g[GLOBAL_KEY] as Partial<Container> | undefined
  if (
    !cached ||
    typeof cached.threads?.locate !== 'function' ||
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
    cached.drafts === undefined ||
    cached.signatures === undefined ||
    cached.adminSessions === undefined ||
    cached.adminLog === undefined ||
    cached.attachments === undefined ||
    cached.avatars === undefined ||
    typeof cached.memberProfiles?.findPublicById !== 'function' ||
    typeof cached.accountStore?.identities?.listForUser !== 'function' ||
    typeof cached.accountStore?.passkeys?.listForUser !== 'function' ||
    (cached.dataSource === 'fixture' && cached.fixtureDataVersion !== FIXTURE_DATA_VERSION) ||
    (cached.dataSource === 'postgres' && typeof cached.readState?.forUser !== 'function')
  ) {
    g[GLOBAL_KEY] = build()
  }
  return g[GLOBAL_KEY] as Container
}

export function getAuthorizer(): Authorizer {
  return getContainer().authorizer
}

export async function configuredIdentity(): Promise<IdentityService> {
  const { accountStore, banLookup } = getContainer()
  return new IdentityService({
    store: accountStore,
    config: await boardAuthConfig(),
    secondFactor: enrolmentLookup(accountStore.twoFactor),
    ...(banLookup === null ? {} : { bans: banLookup }),
  })
}

export async function configuredSessions(): Promise<SessionService> {
  const identity = await configuredIdentity()
  return new SessionService({
    store: getContainer().accountStore,
    ...(await boardSessionConfig()),
    assertSignInAllowed: (account) => identity.assertSignInAllowed(account),
  })
}
