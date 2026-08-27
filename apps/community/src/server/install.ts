import 'server-only'

import {
  type AuthConfig,
  BAN_FILTERS_NOT_CONSULTED,
  DEFAULT_AUTH_POLICY,
  IdentityService,
  rejectedField,
  resolveAuthPolicy,
} from '@meith/accounts'
import { env, GLOBAL_TAGS, logger } from '@meith/core'
import {
  canConnect as canConnectTo,
  countUsers,
  createPostgresAccountStore,
  getDb,
  isInstalled,
  markInstalled,
  migrationUrl,
  missingTables,
  PostgresAdminRepository,
  PostgresForumRepository,
  PostgresSettingsRepository,
  SEED_GROUP_KEY,
  withInstallLock,
} from '@meith/db'
import { currentMailConfig, drivers } from '@meith/drivers'
import {
  type Check,
  defaultForumSlug,
  INSTALL_STEPS,
  type InstallInput,
  type MailProbe,
  mailConfigFromInstallInput,
  preflight,
  type StepOutcome,
} from '@meith/install'
import {
  canSendMail,
  describeMailConfig,
  mailConfigFromEnvironment,
  SettingsSnapshot,
  saveSettings,
} from '@meith/settings'

const INSTALLED_VERSION = '0.1.0'

const INSTALL_IN_FLIGHT = 'install.raced.inFlight'

const INSTALL_RACED = 'install.raced.sealed'
const SCHEMA_INCOMPLETE = 'install.schema.missing'

export async function gatherPreflight(): Promise<readonly Check[]> {
  const dataSource = env.DATA_SOURCE === 'postgres' ? 'postgres' : 'fixture'
  const databaseUrl = env.DATABASE_URL ?? null

  let connected: boolean | null = null
  let users: number | null = null
  let installed = false

  if (dataSource === 'postgres' && databaseUrl !== null && databaseUrl !== '') {
    try {
      const db = getDb()
      connected = await canConnectTo(db)
      if (connected) {
        users = await countUsers(db)
        installed = await isInstalled(db)
      }
    } catch (error) {
      logger().warn({ err: String(error) }, 'install preflight could not reach the database')
      connected = false
    }
  }

  return preflight({
    dataSource,
    databaseUrl,
    hasAuthSecret: (env.AUTH_SECRET ?? '') !== '',
    hasTickSecret: (env.TICK_SECRET ?? '') !== '',
    publicUrl: env.APP_URL ?? null,
    mail: await probeMail(),
    canConnect: connected,
    pendingMigrations: null,
    userCount: users,
    alreadyInstalled: installed,
  })
}

export async function probeMail(): Promise<MailProbe> {
  const fromEnvironment = mailConfigFromEnvironment(env)

  try {
    const config = fromEnvironment ?? (await currentMailConfig())
    return {
      configured: canSendMail(config),
      source: fromEnvironment === null ? 'board' : 'environment',
      summary: describeMailConfig(config),
    }
  } catch (error) {
    logger().warn({ err: String(error) }, 'install preflight could not read mail settings')
    return {
      configured: false,
      source: fromEnvironment === null ? 'board' : 'environment',
      summary: 'Not sending — messages are written to the server log',
    }
  }
}

export async function installerIsSealed(): Promise<boolean> {
  if (env.DATA_SOURCE !== 'postgres') return false
  try {
    return await isInstalled(getDb())
  } catch {
    return false
  }
}

async function forgetCachedBoard(): Promise<void> {
  try {
    await drivers().cache.invalidateTags(GLOBAL_TAGS)
  } catch (error) {
    logger().warn(
      { err: String(error) },
      'install could not clear the cache; restart the server if the board looks empty',
    )
  }
}

export type InstallRun = { readonly sealed: true } | { readonly report: readonly StepOutcome[] }

export async function runInstall(input: InstallInput): Promise<InstallRun> {
  const url = migrationUrl(env)

  try {
    const run = await withInstallLock(url, async (): Promise<InstallRun> => {
      if (await isInstalled(getDb())) return { sealed: true }
      return { report: await performInstall(input) }
    })

    return run ?? { report: [{ id: 'migrate', status: 'failed', error: INSTALL_IN_FLIGHT }] }
  } finally {
    await forgetCachedBoard()
  }
}

async function performInstall(input: InstallInput): Promise<readonly StepOutcome[]> {
  const report: StepOutcome[] = []
  const db = getDb()

  const step = async (id: string, body: () => Promise<void>): Promise<boolean> => {
    try {
      await body()
      report.push({ id, status: 'done' })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger().error({ step: id, err: message }, 'install step failed')
      const field = rejectedField(error)
      report.push({
        id,
        status: 'failed',
        error: message.slice(0, 300),
        ...(field === null ? {} : { field }),
      })
      return false
    }
  }

  if (
    !(await step('migrate', async () => {
      const missing = await missingTables(db)
      if (missing.length === 0) return

      logger().error({ step: 'migrate', missing: missing.slice(0, 20) }, 'schema incomplete')
      throw new Error(SCHEMA_INCOMPLETE)
    }))
  ) {
    return report
  }

  const settings = new PostgresSettingsRepository(db)
  if (
    !(await step('settings', async () => {
      await settings.save(
        new Map([
          ['board.name', input.boardName],
          ['board.url', input.boardUrl],
        ]),
      )

      const mail = mailConfigFromInstallInput(input)
      if (mail.transport === 'log') return

      await saveSettings(
        settings,
        mail.transport === 'http'
          ? {
              'mail.transport': 'http',
              'mail.from': mail.from,
              'mail.http_endpoint': mail.endpoint,
              'mail.http_token': mail.token,
            }
          : {
              'mail.transport': 'smtp',
              'mail.from': mail.from,
              'mail.smtp_host': mail.host,
              'mail.smtp_port': mail.port,
              'mail.smtp_security': mail.security,
              'mail.smtp_username': mail.username,
              'mail.smtp_password': mail.password,
            },
        SettingsSnapshot.fromOverrides(await settings.loadAll()),
      )
    }))
  ) {
    return report
  }

  const admin = new PostgresAdminRepository(db)
  let adminUserId: number | null = null

  if (
    !(await step('admin', async () => {
      const registered = await admin.findGroup(SEED_GROUP_KEY.registered)
      const administrator = await admin.findGroup(SEED_GROUP_KEY.administrators)
      if (registered === null || administrator === null) {
        const missing =
          registered === null ? SEED_GROUP_KEY.registered : SEED_GROUP_KEY.administrators
        const present = await admin.listGroupKeys()
        throw new Error(
          `No usergroup has the key "${missing}". ` +
            (present.length === 0
              ? 'The usergroups table is empty, so the seed migration did not run.'
              : `The board has: ${present.join(', ')}.`),
        )
      }

      const stored = SettingsSnapshot.fromOverrides(await settings.loadAll())

      const config: AuthConfig = {
        ...DEFAULT_AUTH_POLICY,
        ...resolveAuthPolicy((key) => stored.get(key as never), {
          ...DEFAULT_AUTH_POLICY,
          activationMethod: 'none',
        }),
        registrationEnabled: true,
        activationMethod: 'none',
        defaultMemberGroupId: registered.id,
      }

      const identity = new IdentityService({
        store: createPostgresAccountStore(db),
        config,
        banFilters: BAN_FILTERS_NOT_CONSULTED,
      })
      const result = await identity.register({
        username: input.username,
        email: input.email,
        password: input.password,
      })

      await admin.setPrimaryGroup(result.account.id, administrator.id)
      adminUserId = result.account.id
    }))
  ) {
    return report
  }

  const forums = new PostgresForumRepository(db)
  if (
    !(await step('forum', async () => {
      const category = await forums.create({
        type: 'category',
        title: input.boardName,
        slug: defaultForumSlug(input.boardName),
        parentId: null,
      })
      await forums.create({
        type: 'forum',
        title: 'General discussion',
        slug: 'general-discussion',
        description: 'Anything that does not fit elsewhere.',
        parentId: category.id,
      })
    }))
  ) {
    return report
  }

  await step('seal', async () => {
    if (!(await markInstalled(db, INSTALLED_VERSION))) throw new Error(INSTALL_RACED)
  })

  logger().info({ adminUserId, steps: report.length }, 'board installed')
  return report
}

export { INSTALL_STEPS }
