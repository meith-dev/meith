import 'server-only'

import {
  IdentityService,
  DEFAULT_AUTH_POLICY,
  resolveAuthPolicy,
  type AuthConfig,
} from '@meith/accounts'
import { PostgresAdminRepository } from '@meith/db'
import {
  countUsers,
  canConnect as canConnectTo,
  createPostgresAccountStore,
  getDb,
  isInstalled,
  markInstalled,
  PostgresForumRepository,
  PostgresSettingsRepository,
  runMigrations,
} from '@meith/db'
import { env, logger } from '@meith/core'
import { SettingsSnapshot } from '@meith/settings'
import {
  INSTALL_STEPS,
  defaultForumSlug,
  preflight,
  type Check,
  type InstallInput,
  type StepOutcome,
} from '@meith/install'

const INSTALLED_VERSION = '0.1.0'

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
    canConnect: connected,
    pendingMigrations: null,
    userCount: users,
    alreadyInstalled: installed,
  })
}

export async function installerIsSealed(): Promise<boolean> {
  if (env.DATA_SOURCE !== 'postgres') return false
  try {
    return await isInstalled(getDb())
  } catch {
    return false
  }
}

export async function runInstall(input: InstallInput): Promise<readonly StepOutcome[]> {
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
      report.push({ id, status: 'failed', error: message.slice(0, 300) })
      return false
    }
  }

  if (!(await step('migrate', async () => void (await runMigrations())))) return report

  const settings = new PostgresSettingsRepository(db)
  if (
    !(await step('settings', () =>
      settings.save(new Map([['board.name', input.boardName]])),
    ))
  ) {
    return report
  }

  const admin = new PostgresAdminRepository(db)
  let adminUserId: number | null = null

  if (
    !(await step('admin', async () => {
      const registered = await admin.findGroup('registered')
      const administrator = await admin.findGroup('administrator')
      if (registered === null || administrator === null) {
        throw new Error('The usergroup ladder is missing. Migrations did not seed it.')
      }

      const stored = SettingsSnapshot.fromOverrides(await settings.loadAll())

      const config: AuthConfig = {
        ...DEFAULT_AUTH_POLICY,
        ...resolveAuthPolicy((key) => stored.get(key as never), {
          ...DEFAULT_AUTH_POLICY,
          activationMethod: 'none',
        }),
        activationMethod: 'none',
        defaultMemberGroupId: registered.id,
      }

      const identity = new IdentityService({ store: createPostgresAccountStore(db), config })
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

  await step('seal', () => markInstalled(db, INSTALLED_VERSION))

  logger().info({ adminUserId, steps: report.length }, 'board installed')
  return report
}

export { INSTALL_STEPS }
