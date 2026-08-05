/**
 * The scheduler bundle: which tasks exist, and what backs each one.
 *
 * Lifted out of `container.ts` when F13's `task:run` and F04's worker turned
 * out to need the identical object. The rule it preserves is D32's: a *partial*
 * worker set goes in, `builtinTasks` registers only what can run, and a task
 * whose worker does not exist yet is absent rather than stubbed — so it never
 * appears as a healthy run of nothing.
 */
import type { FileStore, MailDriver, QueueDriver } from '@meith/core'
import { AttachmentService, type ImageProcessor } from '@meith/attachments'
import { AvatarService } from '@meith/avatars'
import { env, logger } from '@meith/core'
import {
  getDb,
  PostgresBanRepository,
  PostgresNotificationRepository,
  PostgresContentCounterRepository,
  PostgresCounterRecount,
  PostgresUserBulkRepository,
  PostgresMaintenanceRepository,
  PostgresOutboxReader,
  PostgresPromotionRepository,
  PostgresRateLimitBucketStore,
  PostgresRenderBackfill,
  PostgresAttachmentRepository,
  PostgresAvatarRepository,
  PostgresPresenceRepository,
  PostgresStatsRepository,
  PostgresTaskRepository,
  PostgresThreadViewBuffer,
  PostgresWarningRepository,
  PostgresWebhookRepository,
  PostgresSubscriptionRepository,
  PostgresAuthorizationSource,
  ActorBuilder,
  type Database,
} from '@meith/db'
import { Authorizer } from '@meith/authorization'
import { deliverNotificationEmail, NotificationService } from '@meith/notifications'
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
  /**
   * What to pass `tick()` as its `onError` (F55).
   *
   * F06 has always asked that a failing task "notify admins", and until there
   * was a notifications table the only honest implementation was a log line.
   * This is that notification: it raises `system.task_failed` for every
   * administrator, coalesced per task so a task failing every minute is one
   * unread row with a count rather than 1,440 of them.
   *
   * Deliberately fire-and-forget and impossible to reject. `tick()` calls
   * `onError` synchronously in its catch block, and a notifier that threw — or
   * that the tick awaited and that hung — would turn one failing task into a
   * failing tick, which is the outcome the whole feature exists to report.
   */
  readonly onTaskFailure: (taskId: string, error: unknown) => void
}

/**
 * Everything a tick needs, over a real database.
 *
 * `db` is optional so the app can hand in the client it already holds — opening
 * a second pool per request would be a connection leak on a serverless platform
 * — while the CLI and the worker, which have no client of their own, get one.
 */
export function buildSchedulerBundle(deps: {
  readonly queue: QueueDriver
  readonly db?: Database
  /**
   * F55's transport. Optional so a caller with no drivers bundle still builds a
   * scheduler; without it the mail handler is not registered at all, and the
   * relay stops emitting jobs that could only fail.
   */
  readonly mail?: MailDriver
  /** The installed theme's key, for mail branding. See `mail-brand.ts`. */
  readonly themeKey?: string
  /**
   * F42's object store and codecs. Optional as a pair: neither half is any use
   * alone, and a deployment that supplies neither registers no attachment
   * handler and no sweep — which is the same D32 rule `mail` follows, and is
   * why the upload path refuses before it accepts a byte rather than accepting
   * files that would sit `pending` forever.
   */
  readonly files?: FileStore
  readonly images?: ImageProcessor
  /**
   * F69. The board's enabled plugins, so their declared tasks are registered.
   *
   * An argument rather than an import, for the reason `pluginUpgrades` gives:
   * `forum.config.ts` belongs to the *board's* project and this package is
   * installed from npm. The web app passes its own; the CLI and the worker pass
   * what they can see, which is nothing — and a plugin task that is therefore
   * absent from a `forum task:run` is better than one that appears in the
   * registry and cannot be executed.
   */
  readonly plugins?: readonly PluginDefinition[]
}): SchedulerBundle {
  const db = deps.db ?? getDb()
  const threadViews = new PostgresThreadViewBuffer(db)
  const notifications = new PostgresNotificationRepository(db)
  const mail = deps.mail

  /*
   * One service, shared by the queued job and the hourly sweep. They are two
   * halves of the same lifecycle — the job publishes what it can and the sweep
   * collects what it could not — and giving them separate instances would be
   * two places to configure the same grace periods.
   */
  const attachmentService =
    deps.files === undefined || deps.images === undefined
      ? undefined
      : new AttachmentService({
          attachments: new PostgresAttachmentRepository(db),
          files: deps.files,
          images: deps.images,
        })

  /* F58, on the same condition and for the same reason. */
  const avatarService =
    deps.files === undefined || deps.images === undefined
      ? undefined
      : new AvatarService({
          avatars: new PostgresAvatarRepository(db),
          files: deps.files,
          images: deps.images,
        })

  /*
   * Appended rather than merged. `builtinTasks` owns the core set and a plugin
   * cannot reach it: task ids are namespaced `plugin.<key>.<id>`, and no core
   * task id begins with `plugin.`, so a plugin cannot displace `relay-outbox`
   * by naming itself after it.
   */
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
        /* F46's counter table; the prune keeps it from growing with traffic. */
        rateLimits: new PostgresRateLimitBucketStore(db),
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
                /*
                 * F67. Reads the campaign by id and sends one message; the job
                 * payload carries the address so a member deleted between the
                 * enqueue and the send is still reached at the address the
                 * campaign was aimed at, rather than silently skipped.
                 */
                massMail: {
                  async send({ massMailId, email }) {
                    const campaign = await new PostgresUserBulkRepository(db).readMassMail(
                      massMailId,
                    )
                    if (campaign === null) return
                    /*
                     * The sender's display name, read per message like the
                     * campaign itself. A mass mail is one job per recipient, so
                     * this is a second small read alongside one that already
                     * happens — and it is the only way a name changed mid-send
                     * reaches the rest of the run.
                     */
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
                    })
                  },
                },
              }),
        }),
        recount: new PostgresCounterRecount(db),
        renderBackfill: new PostgresRenderBackfill(db),
        /* F81. The delivery loop lives in `webhook-delivery.ts`; this is only
           the store it claims from. */
        webhooks: new PostgresWebhookRepository(db),
        /*
         * F75. Not optional the way the file store and the mailer are: both
         * tables are in the schema every deployment migrates, so there is no
         * build where this task would be a healthy run of nothing.
         */
        statistics: {
          stats: new PostgresStatsRepository(db),
          presence: new PostgresPresenceRepository(db),
        },
        threadViews,
        warnings: new PostgresWarningRepository(db),
        /*
         * F56. The notifier needs the Authorizer, because "which forums may
         * this member still see" is a permission question and a task is not
         * allowed a second answer to it (F47). Built here rather than shared
         * with the request path's container: the tick can run in a process that
         * has no container at all — the worker and the CLI both do.
         */
        subscriptions: {
          repository: new PostgresSubscriptionRepository(db),
          notifications: new NotificationService({ notifications }),
          forums: visibleForumSource({
            authorizer: new Authorizer(new PostgresAuthorizationSource(db), {}),
            actors: new ActorBuilder(db, { guestGroupId: SEED_GROUP.guest }),
          }),
          /*
           * The board's own secret signs the unsubscribe links. Absent on a
           * board that has not configured one, in which case the messages carry
           * no one-click link rather than an unsigned endpoint that would take
           * a user id from a query string.
           */
          unsubscribeSecret: env.AUTH_SECRET ?? null,
        },
      }),
      ),
      ...contributed,
    ],
  }
}

/** The longest error text a notification carries. Enough to recognise; not a log. */
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
        /*
         * One outstanding notification per task, per administrator. The count
         * on it is the useful number — "this has failed 40 times" is the
         * difference between a blip and an outage — and it costs one row
         * instead of one per tick.
         */
        dedupeKey: `system.task_failed:${taskId}`,
      })
      .catch((err: unknown) => {
        /*
         * The notification is the thing that reports failures, so its own
         * failure has nowhere better to go than the log — and must not become a
         * second, louder failure on top of the first.
         */
        log.error({ taskId, err }, 'could not raise the task-failure notification')
      })
  }
}
