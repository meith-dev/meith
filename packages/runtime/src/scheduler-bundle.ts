import { AttachmentService, type ImageProcessor } from '@meith/attachments'
import { Authorizer } from '@meith/authorization'
import { AvatarService } from '@meith/avatars'
import type { FileStore, MailDriver, QueueDriver } from '@meith/core'
import { env, logger } from '@meith/core'
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
} from '@meith/db'
import { EN_CATALOG, sourceTranslator } from '@meith/i18n'
import { renderMail } from '@meith/mail'
import {
  deliverNotificationEmail,
  deliverNotificationPush,
  NotificationService,
  type NotificationTranslatorResolver,
  type VapidDetails,
} from '@meith/notifications'
import type { PluginDefinition } from '@meith/plugin-kit'
import { resolvePushConfig, SettingsSnapshot } from '@meith/settings'
import { builtinTasks, type TaskDefinition, type TaskRepository } from '@meith/tasks'

import { buildEventRegistry } from './event-handlers'
import { SEED_GROUP } from './groups'
import { resolveMailBrand, type ThemeTokenRegistry } from './mail-brand'
import { pluginTasks } from './plugin-tasks'
import { defaultPromotionGuards, taskWorkers } from './task-workers'
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
  readonly translatorForLocale?: NotificationTranslatorResolver
}): SchedulerBundle {
  const db = deps.db ?? getDb()
  const themeDeps = {
    ...(deps.themeKey === undefined ? {} : { themeKey: deps.themeKey }),
    ...(deps.themeTokens === undefined ? {} : { themeTokens: deps.themeTokens }),
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

  return {
    repository: new PostgresTaskRepository(db),
    onTaskFailure: taskFailureNotifier(notifications),
    tasks: [
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
          ...(attachmentService === undefined ? {} : { attachments: attachmentService }),
          ...(avatarService === undefined ? {} : { avatars: avatarService }),
          events: buildEventRegistry({
            counters: new PostgresContentCounterRepository(db),
            ...(attachmentService === undefined
              ? {}
              : { attachments: { process: (id) => attachmentService.process(id) } }),
            ...(avatarService === undefined
              ? {}
              : { avatars: { process: (id) => avatarService.process(id) } }),
            notifications: {
              ...(mail === undefined
                ? {}
                : {
                    async deliverEmail(notificationId: number) {
                      await deliverNotificationEmail({
                        notifications,
                        mail,
                        brand: await resolveMailBrand({ db, ...themeDeps }),
                        notificationId,
                        ...(deps.translatorForLocale === undefined
                          ? {}
                          : { translatorForLocale: deps.translatorForLocale }),
                      })
                    },
                  }),
              async deliverPush(notificationId: number) {
                const vapid = await vapidDetails(db)
                if (vapid === null) return
                await deliverNotificationPush({
                  notifications,
                  vapid,
                  notificationId,
                  ...(deps.translatorForLocale === undefined
                    ? {}
                    : { translatorForLocale: deps.translatorForLocale }),
                })
              },
            },
            ...(mail === undefined
              ? {}
              : {
                  massMail: {
                    async send({ massMailId, email }) {
                      const campaign = await new PostgresUserBulkRepository(db).readMassMail(
                        massMailId,
                      )
                      if (campaign === null) return

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
                                  brand.boardName === ''
                                    ? t.t('mail.boardFallback')
                                    : brand.boardName,
                              }),
                            },
                          ],
                        },
                      })

                      const fromName = brand.fromName ?? ''
                      await mail.send({
                        to: email,
                        subject: campaign.subject,
                        text: rendered.text,
                        html: rendered.html,
                        ...(fromName === '' ? {} : { fromName }),
                      })
                    },
                  },
                }),
          }),
          recount: new PostgresCounterRecount(db),
          renderBackfill: new PostgresRenderBackfill(db),
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
        }),
      ),
      ...contributed,
    ],
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
