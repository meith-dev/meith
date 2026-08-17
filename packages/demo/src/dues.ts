import {
  type Database,
  PostgresAdminRepository,
  PostgresGroupAdminRepository,
  pluginData,
  pluginGrants,
  SEED_GROUP_KEY,
} from '@meith/db'
import {
  DUES_DEMO_GROUP,
  type DuesDemoCast,
  type DuesDemoSummary,
  seedDuesDemo,
} from '@meith/plugin-dues'

export const DUES_PLUGIN_KEY = 'dues'

/** The group the Supporters plans grant, and the one the supporters-only forum is opened to. */
export const SUPPORTERS_GROUP_KEY: string = DUES_DEMO_GROUP

const SUPPORTERS = {
  key: DUES_DEMO_GROUP,
  title: 'Supporters',
  description: 'Paid the dues. Sold by the Dues plugin; the grant expires on its own.',
  nameColorLight: '#7c3aed',
  nameColorDark: '#c4b5fd',
} as const

const CAST: Readonly<Record<keyof DuesDemoCast, string>> = {
  comped: 'admin',
  founder: 'siobhan',
  subscriber: 'mira',
  passHolder: 'rosa',
  lapsing: 'dev',
  leaving: 'olu',
  refunded: 'sam',
  gifter: 'tomas',
  gifted: 'ken',
  staff: 'admin',
}

export async function seedDuesDemoBoard(
  db: Database,
  userIds: ReadonlyMap<string, number>,
  now: Date,
): Promise<DuesDemoSummary> {
  await ensureSupportersGroup(db)

  return seedDuesDemo({
    data: pluginData(db, DUES_PLUGIN_KEY, { statementTimeoutMs: 30_000 }),
    grants: (clock) => pluginGrants(db, DUES_PLUGIN_KEY, clock),
    cast: cast(userIds),
    now,
  })
}

function cast(userIds: ReadonlyMap<string, number>): DuesDemoCast {
  const of = (key: string): number => {
    const id = userIds.get(key)
    if (id === undefined) {
      throw new Error(`The dues demo casts "${key}", who is not one of the seeded accounts.`)
    }
    return id
  }

  return {
    comped: of(CAST.comped),
    founder: of(CAST.founder),
    subscriber: of(CAST.subscriber),
    passHolder: of(CAST.passHolder),
    lapsing: of(CAST.lapsing),
    leaving: of(CAST.leaving),
    refunded: of(CAST.refunded),
    gifter: of(CAST.gifter),
    gifted: of(CAST.gifted),
    staff: of(CAST.staff),
  }
}

/**
 * The group the plans grant, made whether or not the plugin is installed.
 *
 * The board seed needs it before the plugin runs, because the supporters-only
 * forum is a permission override *against a group id* — a forum closed to
 * everyone with nobody left able to read it is not the demonstration. The
 * plugin's own seed calls this too and finds it already there.
 */
export async function ensureSupportersGroup(db: Database): Promise<number> {
  const groups = new PostgresGroupAdminRepository(db)
  const registered = await new PostgresAdminRepository(db).findGroup(SEED_GROUP_KEY.registered)
  if (registered === null) {
    throw new Error('No registered usergroup to copy the supporters group from.')
  }

  const existing = (await groups.list()).find((group) => group.key === SUPPORTERS.key)
  const id =
    existing?.id ??
    (await groups.create({
      key: SUPPORTERS.key,
      title: SUPPORTERS.title,
      copyFromGroupId: registered.id,
    }))

  await groups.updateIdentity(id, {
    title: SUPPORTERS.title,
    description: SUPPORTERS.description,
    displayOrder: 15,
    isStaffGroup: false,
    pluginGrantable: true,
    badgeToken: null,
    nameColorLight: SUPPORTERS.nameColorLight,
    nameColorDark: SUPPORTERS.nameColorDark,
  })

  return id
}
