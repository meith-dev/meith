import { foldIdentifier } from '@meith/accounts'
import { ValidationError } from '@meith/core'
import { FORUM_TYPES, type ForumType } from '@meith/forums'
import {
  SETTING_DEFINITION_BY_KEY,
  type SettingDefinition,
  type SettingKey,
  SettingsSnapshot,
  saveSettings,
} from '@meith/settings'

import { type Flags, integer, optional, parseFlags, required } from './args'
import { type CliContext, createContext } from './context'

async function readPassword(flags: Flags): Promise<string> {
  const inline = optional(flags, 'password')
  if (inline !== undefined) {
    console.warn(
      'warning: --password is visible in shell history and to `ps`. ' +
        'Prefer:  echo "secret" | community user:create --username u --email e@x.com',
    )
    return inline
  }

  if (process.stdin.isTTY) {
    throw new ValidationError(
      'No password supplied. Pipe one in:\n' +
        '  echo "correct horse battery staple" | community user:create --username u --email u@example.com',
    )
  }

  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const password = Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '')

  if (password === '') throw new ValidationError('The password read from stdin was empty.')
  return password
}

async function findUser(ctx: CliContext, reference: string) {
  const user = await ctx.admin.findUser(reference, foldIdentifier(reference))
  if (!user) throw new ValidationError(`No such user: ${reference}`)
  return user
}

async function findGroup(ctx: CliContext, reference: string) {
  const group = await ctx.admin.findGroup(reference)
  if (!group) {
    const keys = await ctx.admin.listGroupKeys()
    throw new ValidationError(`No such group: ${reference}. Available: ${keys.join(', ')}`)
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
  if (key === undefined) throw new ValidationError('Usage: community settings:get <key>')

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
    throw new ValidationError('Usage: community settings:set <key> <value>')
  }

  const definition = SETTING_DEFINITION_BY_KEY.get(key)
  if (!definition) throw new ValidationError(`Unknown setting "${key}".`)

  const ctx = await createContext()
  const snapshot = SettingsSnapshot.fromOverrides(await ctx.settings.loadAll())

  const result = await saveSettings(ctx.settings, { [key]: coerce(raw, definition) }, snapshot)

  console.log(
    result.changed.length === 0 ? `${key} was already ${raw}. Nothing written.` : `${key} = ${raw}`,
  )
  return 0
}

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
