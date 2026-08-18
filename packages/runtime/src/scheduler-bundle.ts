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
  PostgresStatsRepository,
  PostgresSubscriptionRepository,
  PostgresTaskRepository,
  PostgresThreadViewBuffer,
  PostgresUserBulkRepository,
  PostgresWarningRepository,
  PostgresWebhookRepository,
} from '@meith/db'
import {
  deliverNotificationEmail,
  NotificationService,
  type NotificationTranslatorResolver,
} from '@meith/notifications'
import type { PluginDefinition } from '@meith/plugin-kit'
import { builtinTasks, type TaskDefinition, type TaskRepository } from '@meith/tasks'

import { buildEventRegistry } from './event-handlers'
import { SEED_GROUP } from './groups'
import { resolveMailBrand, resolveSenderName } from './mail-brand'
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
  readonly files?: FileStore
  readonly images?: ImageProcessor
  readonly plugins?: readonly PluginDefinition[]
  readonly translatorForLocale?: NotificationTranslatorResolver
}): SchedulerBundle {
  const db = deps.db ?? getDb()
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
            ...(mail === undefined
              ? {}
              : {
                  massMail: {
                    async send({ massMailId, email }) {
                      const campaign = await new PostgresUserBulkRepository(db).readMassMail(
                        massMailId,
                      )
                      if (campaign === null) return
                      const fromName = await resolveSenderName(db)
                      await mail.send({
                        to: email,
                        subject: campaign.subject,
                        text: campaign.body,
                        ...(fromName === '' ? {} : { fromName }),
                      })
                    },
                  },
                  notifications: {
                    async deliverEmail(notificationId) {
                      await deliverNotificationEmail({
                        notifications,
                        mail,
                        brand: await resolveMailBrand({
                          db,
                          ...(deps.themeKey === undefined ? {} : { themeKey: deps.themeKey }),
                        }),
                        notificationId,
                        ...(deps.translatorForLocale === undefined
                          ? {}
                          : { translatorForLocale: deps.translatorForLocale }),
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
