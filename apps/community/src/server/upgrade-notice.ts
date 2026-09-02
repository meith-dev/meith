import 'server-only'

import { env, logger, ValidationError } from '@meith/core'
import {
  appliedPluginMigrations,
  applyPluginMigration,
  getDb,
  PostgresNavigationRepository,
  readVersion,
  recordVersion,
} from '@meith/db'
import { msg } from '@meith/i18n'
import { pluginNavigationPlacements } from '@meith/plugin-kit'
import { runPluginLifecycle } from '@meith/runtime'
import { planUpgrade, type UpgradeState, upgradeNotice } from '@meith/upgrade'

import { activeDefinitions } from './plugin-host'

export const CODE_VERSION = '0.33.1'

export interface UpgradeApplied {
  readonly plugins: readonly string[]
}

export async function applyPendingUpgrade(): Promise<UpgradeApplied> {
  const db = getDb()
  const definitions = activeDefinitions()

  const applied: Record<string, readonly string[]> = {}
  for (const plugin of definitions) {
    applied[plugin.key] = await appliedPluginMigrations(db, plugin.key)
  }

  const state: UpgradeState = {
    recordedVersion: (await readVersion(db, 'core')) ?? CODE_VERSION,
    codeVersion: CODE_VERSION,
    pendingCoreMigrations: [],
    plugins: definitions.map((plugin) => ({
      key: plugin.key,
      version: plugin.version,
      dependsOn: plugin.dependsOn ?? [],
      migrationIds: (plugin.migrations ?? []).map((migration) => migration.id),
    })),
    appliedPluginMigrations: applied,
  }

  const plan = planUpgrade(state)
  if (plan.refusal !== null || plan.orderFailure !== null) {
    const notice = upgradeNotice(plan, state)
    throw notice === null
      ? new ValidationError(msg('error.app.board-cannot-be-upgraded'))
      : new ValidationError(notice)
  }

  const fresh = new Set<string>()
  for (const plugin of definitions) {
    if ((await readVersion(db, `plugin:${plugin.key}`)) === null) fresh.add(plugin.key)
  }

  const touched: string[] = []
  for (const definition of definitions) {
    let changed = false
    for (const migration of definition.migrations ?? []) {
      const ran = await applyPluginMigration(db, definition.key, migration.id, migration.statements)
      if (ran) changed = true
    }
    if (fresh.has(definition.key) && definition.onInstall !== undefined) {
      const { ran } = await runPluginLifecycle({ db, plugin: definition, phase: 'install' })
      if (ran) changed = true
    }
    await recordVersion(db, `plugin:${definition.key}`, definition.version)
    if (changed) touched.push(definition.key)
  }

  await new PostgresNavigationRepository(db).syncPluginItems(
    pluginNavigationPlacements(definitions).map((item) => ({
      key: item.key,
      href: item.href,
      audience: item.audience,
      parentKey: item.parentKey,
    })),
  )

  await recordVersion(db, 'core', CODE_VERSION)

  return { plugins: touched }
}

export async function pendingUpgradeNotice(): Promise<string | null> {
  if (env.DATA_SOURCE !== 'postgres') return null

  try {
    const db = getDb()
    const plugins = activeDefinitions()

    const applied: Record<string, readonly string[]> = {}
    for (const plugin of plugins) {
      applied[plugin.key] = await appliedPluginMigrations(db, plugin.key)
    }

    const state: UpgradeState = {
      recordedVersion: (await readVersion(db, 'core')) ?? CODE_VERSION,
      codeVersion: CODE_VERSION,
      pendingCoreMigrations: [],
      plugins: plugins.map((plugin) => ({
        key: plugin.key,
        version: plugin.version,
        dependsOn: plugin.dependsOn ?? [],
        migrationIds: (plugin.migrations ?? []).map((migration) => migration.id),
      })),
      appliedPluginMigrations: applied,
    }

    return upgradeNotice(planUpgrade(state), state)
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not determine upgrade state')
    return null
  }
}
