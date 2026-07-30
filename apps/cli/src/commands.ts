/**
 * F13 — the board-management subcommands.
 *
 * Each one drives the same services the app does (`IdentityService`,
 * `PostgresForumRepository`, `PostgresSettingsRepository`), so a value the CLI
 * writes is one the app would have accepted. That is the whole point of the
 * layer being thin.
 */
import {
  SETTING_DEFINITION_BY_KEY,
  SettingsSnapshot,
  saveSettings,
  type SettingDefinition,
  type SettingKey,
} from '@forum/settings'
import { ValidationError } from '@forum/core'
import { FORUM_TYPES, type ForumType } from '@forum/forums'
import { foldIdentifier } from '@forum/accounts'

import { createContext, type CliContext } from './context'
import { integer, optional, parseFlags, required, type Flags } from './args'

/**
 * Read a password without putting it in `argv`.
 *
 * Anything on the command line is visible in shell history and to every user on
 * the box via `ps`. Piping is therefore the supported path; `--password` is
 * accepted for scripted use but warns, because a silent insecure default is
 * worse than a noisy one.
 */
async function readPassword(flags: Flags): Promise<string> {
  const inline = optional(flags, 'password')
  if (inline !== undefined) {
    console.warn(
      'warning: --password is visible in shell history and to `ps`. ' +
        'Prefer:  echo "secret" | forum user:create --username u --email e@x.com',
    )
    return inline
  }

  if (process.stdin.isTTY) {
    throw new ValidationError(
      'No password supplied. Pipe one in:\n' +
        '  echo "correct horse battery staple" | forum user:create --username u --email u@example.com',
    )
  }

  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')

  if (password === '') throw new ValidationError('The password read from stdin was empty.')
  return password
}

/** Resolve a user by numeric id or by username, so operators can use either. */
async function findUser(ctx: CliContext, reference: string) {
  const user = await ctx.admin.findUser(reference, foldIdentifier(reference))
  if (!user) throw new ValidationError(`No such user: ${reference}`)
  return user
}

/** Resolve a group by key or numeric id. Keys are the stable handle. */
async function findGroup(ctx: CliContext, reference: string) {
  const group = await ctx.admin.findGroup(reference)
  if (!group) {
    const keys = await ctx.admin.listGroupKeys()
    throw new ValidationError(
      `No such group: ${reference}. Available: ${keys.join(', ')}`,
    )
  }
  return group
}

export async function userCreate(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)
  const username = required(flags, 'username')
  const email = required(flags, 'email')
  const password = await readPassword(flags)

  const ctx = await createContext()
  const result = await ctx.identity.register({ username, email, password })

  const groupRef = optional(flags, 'group')
  if (groupRef !== undefined) {
    const group = await findGroup(ctx, groupRef)
    await ctx.admin.setPrimaryGroup(result.account.id, group.id)
    console.log(`Created user ${username} (id ${result.account.id}) in group ${group.key}.`)
  } else {
    console.log(`Created user ${username} (id ${result.account.id}).`)
  }

  return 0
}

export async function userPromote(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)
  // Arguments are validated before the database is touched, so a typo is
  // reported as a typo rather than as whatever the connection happens to say.
  const userRef = required(flags, 'user')
  const groupRef = required(flags, 'group')

  const ctx = await createContext()
  const user = await findUser(ctx, userRef)
  const group = await findGroup(ctx, groupRef)

  if (user.primaryGroupId === group.id) {
    console.log(`${user.username} is already in ${group.key}. Nothing to do.`)
    return 0
  }

  await ctx.admin.setPrimaryGroup(user.id, group.id)
  console.log(`${user.username} is now in ${group.key} (${group.title}).`)
  return 0
}

export async function forumCreate(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)

  const rawType = optional(flags, 'type') ?? 'forum'
  if (!(FORUM_TYPES as readonly string[]).includes(rawType)) {
    throw new ValidationError(`--type must be one of ${FORUM_TYPES.join(', ')}, got "${rawType}".`)
  }

  // Everything the command needs is resolved before the database is opened, so
  // a missing --title is reported as a missing --title.
  const input = {
    type: rawType as ForumType,
    title: required(flags, 'title'),
    slug: required(flags, 'slug'),
    description: optional(flags, 'description'),
    parentId: integer(flags, 'parent') ?? null,
    linkUrl: optional(flags, 'link-url'),
  }

  const ctx = await createContext()
  const created = await ctx.forums.create(input)

  console.log(
    `Created ${created.type} "${created.title}" (id ${created.id}, path ${created.path}).`,
  )
  return 0
}

export async function settingsGet(args: readonly string[]): Promise<number> {
  const { positional } = parseFlags(args)
  const key = positional[0]
  if (key === undefined) throw new ValidationError('Usage: forum settings:get <key>')

  const ctx = await createContext()
  const snapshot = SettingsSnapshot.fromOverrides(await ctx.settings.loadAll())

  const definition = SETTING_DEFINITION_BY_KEY.get(key)
  if (!definition) throw new ValidationError(`Unknown setting "${key}".`)

  const value = snapshot.get(key as SettingKey)
  const isDefault = Object.is(value, definition.default)
  console.log(`${key} = ${JSON.stringify(value)}${isDefault ? '  (default)' : ''}`)
  return 0
}

export async function settingsSet(args: readonly string[]): Promise<number> {
  const { positional } = parseFlags(args)
  const [key, raw] = positional
  if (key === undefined || raw === undefined) {
    throw new ValidationError('Usage: forum settings:set <key> <value>')
  }

  const definition = SETTING_DEFINITION_BY_KEY.get(key)
  if (!definition) throw new ValidationError(`Unknown setting "${key}".`)

  const ctx = await createContext()
  const snapshot = SettingsSnapshot.fromOverrides(await ctx.settings.loadAll())

  /*
   * Coerce from the string a shell inevitably supplies, then let the registry's
   * own schema validate. The CLI does not get its own idea of what is valid —
   * `saveSettings` is the same call the ACP will make.
   */
  // `saveSettings` throws on a value its schema rejects; the dispatcher prints
  // that message and exits 1, so there is no error branch to handle here.
  const result = await saveSettings(ctx.settings, { [key]: coerce(raw, definition) }, snapshot)

  console.log(
    result.changed.length === 0
      ? `${key} was already ${raw}. Nothing written.`
      : `${key} = ${raw}`,
  )
  return 0
}

/**
 * Turn a shell string into the type the registry expects.
 *
 * The target type is read off the definition's `default`, because that is the
 * one place the intended type is stated as a *value*. Zod schemas are not
 * introspectable for this without unwrapping every wrapper type, and guessing
 * from the raw string would make `settings:set board.name 42` a number.
 *
 * The registry's own schema still validates afterwards — this only decides how
 * to read the shell's string, never whether the value is acceptable.
 */
function coerce(raw: string, definition: SettingDefinition): unknown {
  const type = typeof definition.default
  if (type === 'boolean') {
    if (['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())) return true
    if (['0', 'false', 'no', 'off'].includes(raw.toLowerCase())) return false
    throw new ValidationError(`Expected a boolean, got "${raw}".`)
  }
  if (type === 'number') {
    const value = Number(raw)
    if (Number.isNaN(value)) throw new ValidationError(`Expected a number, got "${raw}".`)
    return value
  }
  return raw
}
