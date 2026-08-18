import {
  type AccountStore,
  type AuthConfig,
  DEFAULT_AUTH_POLICY,
  IdentityService,
  resolveAuthPolicy,
} from '@meith/accounts'
import { ConfigurationError, env } from '@meith/core'
import {
  createPostgresAccountStore,
  type Database,
  getDb,
  PostgresAdminRepository,
  PostgresForumRepository,
  PostgresSettingsRepository,
} from '@meith/db'
import { SettingsSnapshot } from '@meith/settings'

export interface CliContext {
  readonly db: Database
  readonly accounts: AccountStore
  readonly identity: IdentityService
  readonly forums: PostgresForumRepository
  readonly settings: PostgresSettingsRepository
  readonly admin: PostgresAdminRepository
}

export function requirePostgres(): void {
  if (env.DATA_SOURCE !== 'postgres') {
    throw new ConfigurationError(
      'This command needs a database: DATA_SOURCE is "fixture".\n' +
        'Set DATABASE_URL (see .env.example) and run `community migrate` first.',
    )
  }
}

export async function defaultMemberGroupId(admin: PostgresAdminRepository): Promise<number> {
  const id = await admin.registeredGroupId()
  if (id === null) {
    throw new ConfigurationError(
      'No "registered" usergroup found. Run `community migrate` to seed the group ladder.',
    )
  }
  return id
}

export async function createContext(): Promise<CliContext> {
  requirePostgres()
  const db = getDb()
  const admin = new PostgresAdminRepository(db)

  const settings = new PostgresSettingsRepository(db)

  const stored = SettingsSnapshot.fromOverrides(await settings.loadAll())

  const config: AuthConfig = {
    ...DEFAULT_AUTH_POLICY,
    ...resolveAuthPolicy((key) => stored.get(key as never), {
      ...DEFAULT_AUTH_POLICY,
      activationMethod: 'none',
    }),
    registrationEnabled: true,
    activationMethod: 'none',
    defaultMemberGroupId: await defaultMemberGroupId(admin),
  }

  const store = createPostgresAccountStore(db)

  return {
    db,
    accounts: store,
    identity: new IdentityService({ store, config }),
    forums: new PostgresForumRepository(db),
    settings,
    admin,
  }
}
