import 'server-only'

/**
 * F83 — the app's half of the installer: gather the facts, then perform the
 * writes.
 *
 * Every *decision* lives in `@meith/install` and is unit-tested there. This file
 * is the part that cannot be: it opens a connection, runs migrations, and calls
 * the same registration command a member uses.
 *
 * ## It builds its own services rather than using the container
 *
 * `getContainer()` resolves the board's repositories against a schema that, at
 * the moment the installer runs, **does not exist**. Several of them read
 * settings or the group ladder at construction. So the installer wires the three
 * services it needs directly, after its own migrations have run — which is also
 * why the step order in `INSTALL_STEPS` is not a suggestion.
 */

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
import { currentMailConfig } from '@meith/drivers'
import {
  SettingsSnapshot,
  canSendMail,
  describeMailConfig,
  mailConfigFromEnvironment,
  saveSettings,
} from '@meith/settings'
import {
  INSTALL_STEPS,
  defaultForumSlug,
  mailConfigFromInstallInput,
  preflight,
  type Check,
  type InstallInput,
  type MailProbe,
  type StepOutcome,
} from '@meith/install'

/** The version recorded in `install_state`. F84 reads it. */
const INSTALLED_VERSION = '0.1.0'

/**
 * Measure the environment.
 *
 * Every probe is failure-tolerant, because the whole point of a preflight is to
 * run on a board that is misconfigured. A probe that threw would turn "your
 * DATABASE_URL is wrong" into a 500 — the one page where an unhandled error is
 * least excusable, since it is the page that exists to explain errors.
 */
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
      /*
       * `getDb()` itself can throw on a malformed URL. Reported as "cannot
       * connect", which is what it means to the person reading the screen.
       */
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
    /*
     * Deliberately not measured. Counting pending migrations means reading the
     * journal *and* the applied list, and the second query fails on a database
     * with no schema — which is the common case here. The count is a nicety and
     * the installer says nothing rather than guessing.
     */
    pendingMigrations: null,
    userCount: users,
    alreadyInstalled: installed,
  })
}

/**
 * What mail looks like before the form is filled in.
 *
 * Failure-tolerant like every other probe, and for a sharper reason than most:
 * reading the board's stored mail settings means reading the `settings` table,
 * which on a board that has never been installed does not exist. That is the
 * *expected* case here, not an error, and it must produce "nothing is
 * configured" rather than a stack trace on the page whose job is to explain
 * problems.
 */
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

/** Whether `/install` should exist at all. Read by the page and the action. */
export async function installerIsSealed(): Promise<boolean> {
  if (env.DATA_SOURCE !== 'postgres') return false
  try {
    return await isInstalled(getDb())
  } catch {
    return false
  }
}

/**
 * Run the install.
 *
 * Sequential, and it stops at the first failure: a step whose predecessor did
 * not happen cannot succeed, and attempting it produces a second error that
 * explains nothing. The report is returned rather than thrown, because the
 * screen has to show *which* step failed — an exception carrying a message would
 * lose the fact that migrations succeeded and the administrator did not.
 */
export async function runInstall(input: InstallInput): Promise<readonly StepOutcome[]> {
  const report: StepOutcome[] = []
  const db = getDb()

  const step = async (id: string, body: () => Promise<void>): Promise<boolean> => {
    try {
      await body()
      report.push({ id, status: 'done' })
      return true
    } catch (error) {
      /*
       * The message reaches the screen, so it must not carry a connection
       * string. Postgres errors do not include the URL, and the messages this
       * code raises are its own — but it is logged in full and shown trimmed.
       */
      const message = error instanceof Error ? error.message : String(error)
      logger().error({ step: id, err: message }, 'install step failed')
      report.push({ id, status: 'failed', error: message.slice(0, 300) })
      return false
    }
  }

  /* 1. Migrations. Nothing below has a table to write to until this succeeds. */
  if (!(await step('migrate', async () => void (await runMigrations())))) return report

  /*
   * 2. The board's name, and how it sends mail.
   *
   * The mail half goes through `saveSettings` rather than a direct `save`, so
   * the values land under the same validation the settings screen applies —
   * including the rule that a value equal to its default is *deleted* rather
   * than stored, which keeps a later change of default reaching this board.
   * Writing the rows by hand here would be a second, laxer writer for the one
   * set of keys where a bad value means "no mail" rather than "wrong colour".
   *
   * The credentials have already been proved by this point: the action sent a
   * real message through this exact config before calling `runInstall`. What is
   * stored is therefore known to work, which is the difference between an
   * installer that configures mail and one that merely records an intention.
   */
  const settings = new PostgresSettingsRepository(db)
  if (
    !(await step('settings', async () => {
      /*
       * The name and the address together, because they are the two facts the
       * board cannot derive and both were typed on the same form. The address
       * matters more than it looks: every link the board ever sends is built
       * from it, and it is the value that used to be an environment variable
       * somebody set after going live, if at all.
       */
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

  /*
   * 3. The administrator, through the same registration command a member uses
   * (F18) and then promoted. A second account-creation path would be a second
   * place for the password policy and the uniqueness rules to live, and the copy
   * that drifts is always the one used once.
   */
  const admin = new PostgresAdminRepository(db)
  let adminUserId: number | null = null

  if (
    !(await step('admin', async () => {
      /*
       * By key, not by id. The seeded ladder's ids are stable today and the keys
       * are what the migration actually promises — a board whose ids shifted for
       * any reason would otherwise get an administrator in the wrong group, which
       * is the least recoverable mistake this function could make.
       */
      const registered = await admin.findGroup('registered')
      const administrator = await admin.findGroup('administrator')
      if (registered === null || administrator === null) {
        throw new Error('The usergroup ladder is missing. Migrations did not seed it.')
      }

      /*
       * The board's own rules, such as they are on a board being installed.
       *
       * Nothing has overridden anything yet, so in practice this resolves to
       * the registry's defaults — and that is the point: the registry asks for
       * a minimum password length of 10 where `DEFAULT_AUTH_POLICY` carries 8,
       * so an installer built on the const alone would accept a founding
       * administrator whose password the board it is installing would refuse.
       */
      const stored = SettingsSnapshot.fromOverrides(await settings.loadAll())

      const config: AuthConfig = {
        ...DEFAULT_AUTH_POLICY,
        ...resolveAuthPolicy((key) => stored.get(key as never), {
          ...DEFAULT_AUTH_POLICY,
          activationMethod: 'none',
        }),
        /*
         * 'none', for the same reason the CLI uses it: an e-mail round trip
         * cannot be a prerequisite for the account that would have to activate
         * it. The first administrator would otherwise be unable to log in to
         * activate themselves — and at this point in the install there is no
         * mail driver configured to send them anything. Applied after the
         * spread, so it overrules the resolved value rather than racing it.
         */
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

  /*
   * 4. A category and a forum inside it. A board whose index is empty looks
   * broken rather than new, and the first thing an operator does otherwise is
   * hunt for how to add one.
   */
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

  /*
   * 5. Seal it. Last, and irreversible.
   *
   * Written here rather than first so a failure above leaves a board that can be
   * fixed by trying again. The case that must *not* be repeatable — an
   * administrator created, then a later failure — is covered independently by the
   * account-count gate in the preflight, which needs no marker at all.
   */
  await step('seal', () => markInstalled(db, INSTALLED_VERSION))

  logger().info({ adminUserId, steps: report.length }, 'board installed')
  return report
}

/** The step list, for the screen. Re-exported so the page imports one module. */
export { INSTALL_STEPS }
