import { AttachmentService, type ImageProcessor } from '@meith/attachments'
import { Authorizer } from '@meith/authorization'
import { AvatarService } from '@meith/avatars'
import type { FileStore, MailDriver, QueueDriver } from '@meith/core'
import { env, logger, metrics, optional, withSpan } from '@meith/core'
import {
  ActorBuilder,
  type Database,
  expireTimedGroupMemberships,
  getDb,
  PostgresAttachmentRepository,
  PostgresAuthEventRepository,
  PostgresAuthorizationSource,
  PostgresAvatarRepository,
  PostgresBanRepository,
  PostgresContentCounterRepository,
  PostgresCounterRecount,
  PostgresMaintenanceRepository,
  PostgresMarketplaceCacheRepository,
  PostgresNotificationRepository,
  PostgresOutboxReader,
  PostgresPresenceRepository,
  PostgresPromotionRepository,
  PostgresRateLimitBucketStore,
  PostgresRenderBackfill,
  PostgresSearchRepository,
  PostgresSettingsRepository,
  PostgresStatsRepository,
  PostgresSubscriptionRepository,
  PostgresTaskRepository,
  PostgresThreadViewBuffer,
  PostgresUserBulkRepository,
  PostgresWarningRepository,
  PostgresWebhookRepository,
  readPluginHealth,
  recordPluginFailure,
  syncRenderSignature,
} from '@meith/db'
import { EN_CATALOG, sourceTranslator, type Translator } from '@meith/i18n'
import { absoluteUrl, type MailFooterLine, renderMail } from '@meith/mail'
import {
  deliverNotificationEmail,
  deliverNotificationPush,
  NotificationService,
  type NotificationTranslatorResolver,
  type VapidDetails,
} from '@meith/notifications'
import { type PluginDefinition, PluginHost, renderingSignature } from '@meith/plugin-kit'
import { resolvePushConfig, SettingsSnapshot } from '@meith/settings'
import { mintUnsubscribeToken } from '@meith/subscriptions'
import { builtinTasks, type TaskDefinition, type TaskRepository } from '@meith/tasks'

import { buildEventRegistry } from './event-handlers'
import { SEED_GROUP } from './groups'
import { resolveMailBrand, type ThemeTokenRegistry } from './mail-brand'
import { pluginMarkdownPipeline, sendAudited } from './plugin-rendering'
import { pluginTasks } from './plugin-tasks'
import { defaultPromotionGuards, type InstalledThemeVersion, taskWorkers } from './task-workers'
import { visibleForumSource } from './visible-forums'

export interface SchedulerBundle {
  readonly repository: TaskRepository
  readonly tasks: readonly TaskDefinition[]
  readonly onTaskFailure: (taskId: string, error: unknown) => void
}

export function buildSchedulerBundle(deps: {
  readonly queue: QueueDriver
  readonly db?: Database
  readonly mail?: MailDriver
  readonly themeKey?: string
  readonly themeTokens?: ThemeTokenRegistry
  readonly files?: FileStore
  readonly images?: ImageProcessor
  readonly plugins?: readonly PluginDefinition[]
  readonly themeVersions?: readonly InstalledThemeVersion[]
  readonly translatorForLocale?: NotificationTranslatorResolver
}): SchedulerBundle {
  const db = deps.db ?? getDb()
  const themeDeps = {
    ...optional(deps.themeKey, (themeKey) => ({ themeKey })),
    ...optional(deps.themeTokens, (themeTokens) => ({ themeTokens })),
  }
  const threadViews = new PostgresThreadViewBuffer(db)
  const notifications = new PostgresNotificationRepository(db)
  const mail = deps.mail

  const attachmentService =
    deps.files === undefined || deps.images === undefined
      ? undefined
      : new AttachmentService({
          attachments: new PostgresAttachmentRepository(db),
          files: deps.files,
          images: deps.images,
        })

  const avatarService =
    deps.files === undefined || deps.images === undefined
      ? undefined
      : new AvatarService({
          avatars: new PostgresAvatarRepository(db),
          files: deps.files,
          images: deps.images,
        })

  const contributed = pluginTasks({ db, plugins: deps.plugins ?? [] })
  const plugins = deps.plugins ?? []
  const renderHost = new PluginHost({
    plugins,
    health: {
      failed: (failure) => {
        void recordPluginFailure(db, {
          pluginKey: failure.pluginKey,
          threshold: failure.threshold,
          reason: `${failure.threshold} failures, most recently in "${failure.hook}": ${failure.message}`,
        }).catch((error: unknown) => {
          logger({ module: 'scheduler' }).warn(
            { err: String(error), plugin: failure.pluginKey },
            'could not record plugin failure',
          )
        })
      },
    },
  })
  const backfill = new PostgresRenderBackfill(db, pluginMarkdownPipeline(renderHost))

  const taskRuns = metrics.counter(
    'meith_task_runs_total',
    'Scheduled task runs, labelled by task and outcome.',
  )
  const taskRunSeconds = metrics.histogram(
    'meith_task_run_duration_seconds',
    'Scheduled task run duration in seconds, labelled by task and outcome.',
  )

  const announced = (tasks: readonly TaskDefinition[]): TaskDefinition[] =>
    tasks.map((task) => ({
      ...task,
      async run(context) {
        await renderHost.emit('task.run.before', { taskId: task.id }, {})

        const startedAt = Date.now()
        try {
          const result = await withSpan('task.run', { 'task.id': task.id }, () => task.run(context))
          const durationMs = Date.now() - startedAt
          taskRuns.inc(1, { task: task.id, status: 'ok' })
          taskRunSeconds.observe(durationMs / 1000, { task: task.id })
          await renderHost.emit('task.run.after', { taskId: task.id, ok: true, durationMs }, {})
          return result
        } catch (error) {
          const durationMs = Date.now() - startedAt
          taskRuns.inc(1, { task: task.id, status: 'error' })
          taskRunSeconds.observe(durationMs / 1000, { task: task.id })
          await renderHost.emit('task.run.after', { taskId: task.id, ok: false, durationMs }, {})
          throw error
        }
      },
    }))

  return {
    repository: new PostgresTaskRepository(db),
    onTaskFailure: taskFailureNotifier(notifications),
    tasks: announced([
      ...builtinTasks(
        taskWorkers({
          queue: deps.queue,
          bans: new PostgresBanRepository(db),
          promotions: new PostgresPromotionRepository(db),
          guards: defaultPromotionGuards(),
          maintenance: new PostgresMaintenanceRepository(db),
          rateLimits: new PostgresRateLimitBucketStore(db),
          authEvents: {
            retentionDays: () => authEventRetentionDays(db),
            pruneBefore: (cutoff, limit) =>
              new PostgresAuthEventRepository(db).pruneBefore(cutoff, limit),
          },
          timedGroups: { expire: (limit) => expireTimedGroupMemberships(db, limit) },
          outbox: new PostgresOutboxReader(db),
          ...optional(attachmentService, (attachments) => ({ attachments })),
          ...optional(avatarService, (avatars) => ({ avatars })),
          events: buildEventRegistry({
            counters: new PostgresContentCounterRepository(db),
            ...optional(attachmentService, (attachments) => ({
              attachments: { process: (id: number) => attachments.process(id) },
            })),
            ...optional(avatarService, (avatars) => ({
              avatars: { process: (id: number) => avatars.process(id) },
            })),
            notifications: {
              ...optional(mail, (mail) => ({
                async deliverEmail(notificationId: number) {
                  await deliverNotificationEmail({
                    notifications,
                    mail,
                    brand: await resolveMailBrand({ db, ...themeDeps }),
                    notificationId,
                    ...optional(deps.translatorForLocale, (translatorForLocale) => ({
                      translatorForLocale,
                    })),
                  })
                },
              })),
              async deliverPush(notificationId: number) {
                const vapid = await vapidDetails(db)
                if (vapid === null) return
                await deliverNotificationPush({
                  notifications,
                  vapid,
                  notificationId,
                  ...optional(deps.translatorForLocale, (translatorForLocale) => ({
                    translatorForLocale,
                  })),
                })
              },
            },
            ...optional(mail, (mail) => ({
              massMail: {
                async send({ massMailId, userId, email }) {
                  const bulk = new PostgresUserBulkRepository(db)
                  const campaign = await bulk.readMassMail(massMailId)
                  if (campaign === null) return
                  if (!(await bulk.mayReceiveMassMail(userId))) return

                  const brand = await resolveMailBrand({ db, ...themeDeps })
                  const t = await (
                    deps.translatorForLocale ?? (() => sourceTranslator(EN_CATALOG))
                  )('')

                  const rendered = renderMail({
                    brand,
                    t,
                    body: {
                      title: campaign.subject,
                      paragraphs: campaign.body.split(/\n{2,}/),
                      footer: [
                        {
                          text: t.t('mail.footer.sentBy', {
                            board:
                              brand.boardName === '' ? t.t('mail.boardFallback') : brand.boardName,
                          }),
                        },
                        { text: t.t('mail.footer.announcementsConsent') },
                        massMailUnsubscribeLine({ boardUrl: brand.boardUrl, userId, t }),
                      ],
                    },
                  })

                  const fromName = brand.fromName ?? ''
                  await sendAudited(renderHost, mail, 'mass-mail', {
                    to: email,
                    subject: campaign.subject,
                    text: rendered.text,
                    html: rendered.html,
                    ...(fromName === '' ? {} : { fromName }),
                  })
                },
              },
            })),
          }),
          recount: new PostgresCounterRecount(db),
          renderBackfill: {
            run: async (batchSize) => {
              renderHost.setDurablyDisabled(
                (await readPluginHealth(db))
                  .filter((row) => row.disabledAt !== null)
                  .map((row) => ({
                    key: row.pluginKey,
                    reason: row.reason ?? 'repeated failures',
                  })),
              )
              await syncRenderSignature(db, renderingSignature(plugins))
              return backfill.run(batchSize)
            },
          },
          searchIndex: new PostgresSearchRepository(db),
          ...(env.DEMO_MODE ? {} : { webhooks: new PostgresWebhookRepository(db) }),
          statistics: {
            stats: new PostgresStatsRepository(db),
            presence: new PostgresPresenceRepository(db),
          },
          threadViews,
          warnings: new PostgresWarningRepository(db),
          subscriptions: {
            repository: new PostgresSubscriptionRepository(db),
            notifications: new NotificationService({ notifications }),
            forums: visibleForumSource({
              authorizer: new Authorizer(new PostgresAuthorizationSource(db), {}),
              actors: new ActorBuilder(db, { guestGroupId: SEED_GROUP.guest }),
            }),
            unsubscribeSecret: env.AUTH_SECRET ?? null,
          },
          marketplace: {
            repository: new PostgresMarketplaceCacheRepository(db),
            plugins,
            themes: deps.themeVersions ?? [],
            feedUrl: () => marketplaceFeedUrl(db),
            async notifyUpdate(listing) {
              await new NotificationService({ notifications }).raiseForAdministrators({
                kind: 'marketplace.update_available',
                data: {
                  key: listing.key,
                  name: listing.name,
                  package: listing.package,
                  version: listing.version,
                },
                href: listing.kind === 'plugin' ? '/admin/plugins' : '/admin/themes',
                dedupeKey: `marketplace.update_available:${listing.key}:${listing.version}`,
              })
            },
          },
        }),
      ),
      ...contributed,
    ]),
  }
}

async function marketplaceFeedUrl(db: Database): Promise<string> {
  try {
    const overrides = await new PostgresSettingsRepository(db).loadAll()
    return SettingsSnapshot.fromOverrides(new Map(overrides)).get('marketplace.feed_url')
  } catch (err) {
    logger({ module: 'tick' }).warn({ err }, 'could not read the marketplace feed URL setting')
    return SettingsSnapshot.fromOverrides(new Map()).get('marketplace.feed_url')
  }
}

async function vapidDetails(db: Database): Promise<VapidDetails | null> {
  try {
    const overrides = await new PostgresSettingsRepository(db).loadAll()
    const { config } = resolvePushConfig({
      environment: env,
      settings: SettingsSnapshot.fromOverrides(new Map(overrides)),
    })
    return config
  } catch (err) {
    logger({ module: 'tick' }).warn({ err }, 'could not read the web push configuration')
    return null
  }
}

async function authEventRetentionDays(db: Database): Promise<number> {
  try {
    const overrides = await new PostgresSettingsRepository(db).loadAll()
    return SettingsSnapshot.fromOverrides(new Map(overrides)).get(
      'security.auth_event_retention_days',
    )
  } catch (err) {
    logger({ module: 'tick' }).warn({ err }, 'could not read the sign-in activity retention')
    return 0
  }
}

const ERROR_DETAIL_MAX = 500

function taskFailureNotifier(
  notifications: PostgresNotificationRepository,
): (taskId: string, error: unknown) => void {
  const log = logger({ module: 'tick' })

  return (taskId, error) => {
    const message = error instanceof Error ? error.message : String(error)
    log.error({ taskId, err: error }, 'scheduled task failed')

    void new NotificationService({ notifications })
      .raiseForAdministrators({
        kind: 'system.task_failed',
        data: { taskId, error: message.slice(0, ERROR_DETAIL_MAX) },
        dedupeKey: `system.task_failed:${taskId}`,
      })
      .catch((err: unknown) => {
        log.error({ taskId, err }, 'could not raise the task-failure notification')
      })
  }
}

const UNSUBSCRIBE_PATH = '/unsubscribe'

const MAIL_PREFERENCES_PATH = '/notifications/preferences'

function massMailUnsubscribeLine(input: {
  readonly boardUrl: string
  readonly userId: number
  readonly t: Translator
}): MailFooterLine {
  const secret = env.AUTH_SECRET
  const token =
    secret === undefined
      ? null
      : mintUnsubscribeToken({ userId: input.userId, scope: 'mass-mail', targetId: 0 }, secret)

  const href = absoluteUrl(
    input.boardUrl,
    token === null
      ? MAIL_PREFERENCES_PATH
      : `${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`,
  )

  return href === null
    ? { text: input.t.t('mail.footer.announcementsNoLink') }
    : { text: input.t.t('mail.footer.announcementsStop'), href }
}
