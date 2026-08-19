import 'server-only'

import { cache } from 'react'

import { CacheTags, cachedGlobal, env } from '@meith/core'
import { logger } from '@meith/core/logger'
import { getDb, readPluginHealth, recordPluginFailure } from '@meith/db'
import { drivers } from '@meith/drivers'
import {
  type DurablyDisabledPlugin,
  operatorDisabledPlugins,
  type PluginDefinition,
  PluginHost,
} from '@meith/plugin-kit'

import forumConfig from '../../community.config'
import { getSettingOverrides } from './settings'

const HEALTH_TTL_SECONDS = 30

export const FAILURE_THRESHOLD = 5

export interface ConfiguredPlugin {
  readonly key: string
  readonly enabled: boolean
  readonly hasDefinition: boolean
  readonly name: string | null
  readonly version: string | null
}

export function configuredPlugins(): readonly ConfiguredPlugin[] {
  return (forumConfig.plugins ?? []).map((entry) => {
    const definition = entry.plugin as PluginDefinition | undefined
    return {
      key: entry.key,
      enabled: entry.enabled !== false,
      hasDefinition: definition !== undefined,
      name: definition?.name ?? null,
      version: definition?.version ?? null,
    }
  })
}

export function activeDefinitions(): readonly PluginDefinition[] {
  return (forumConfig.plugins ?? [])
    .filter((entry) => entry.enabled !== false && entry.plugin !== undefined)
    .map((entry) => entry.plugin as PluginDefinition)
}

export const pluginHost = new PluginHost({
  plugins: activeDefinitions(),
  failureThreshold: FAILURE_THRESHOLD,
  logger: {
    warn: (message, detail) => logger().warn(detail, message),
    error: (message, detail) => logger().error(detail, message),
  },
  health: {
    failed: (failure) => {
      void persistFailure(failure.pluginKey, failure.threshold, failure.hook, failure.message)
    },
  },
})

/**
 * A plugin failing somewhere the host does not itself dispatch — a lifecycle
 * callback — counted and reported exactly as a failing hook is. There is one
 * failure record per plugin, and an operator reading it should not have to know
 * which door the plugin was behind when it broke.
 */
export async function recordPluginFault(
  pluginKey: string,
  surface: string,
  error: unknown,
): Promise<void> {
  await persistFailure(
    pluginKey,
    FAILURE_THRESHOLD,
    surface,
    error instanceof Error ? error.message : String(error),
  )
}

async function persistFailure(
  pluginKey: string,
  threshold: number,
  hook: string,
  message: string,
): Promise<void> {
  if (env.DATA_SOURCE !== 'postgres') return

  try {
    const record = await recordPluginFailure(getDb(), {
      pluginKey,
      threshold,
      reason: `${threshold} failures, most recently in "${hook}": ${message}`,
    })
    if (record.disabledAt !== null) {
      await invalidatePluginHealth()
      await pluginHost.emit('plugin.disabled', { pluginKey, reason: 'failures' }, {})
    }
  } catch (error) {
    logger().warn({ err: String(error), plugin: pluginKey }, 'could not record plugin failure')
  }
}

export async function invalidatePluginHealth(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.pluginHealth()])
}

export async function durablyDisabledPlugins(): Promise<readonly DurablyDisabledPlugin[]> {
  if (env.DATA_SOURCE !== 'postgres') return []

  return cachedGlobal<readonly DurablyDisabledPlugin[]>(
    drivers().cache,
    {
      key: ['plugin', 'health', 'disabled'],
      tags: [CacheTags.pluginHealth()],
      revalidate: HEALTH_TTL_SECONDS,
    },
    async () =>
      (await readPluginHealth(getDb()))
        .filter((row) => row.disabledAt !== null)
        .map((row) => ({ key: row.pluginKey, reason: row.reason ?? 'repeated failures' })),
  )
}

export async function reconcilePluginHealth(): Promise<void> {
  pluginHost.setDurablyDisabled(await durablyDisabledPlugins())
}

export const syncPluginEnablement = cache(async (): Promise<void> => {
  try {
    pluginHost.setOperatorDisabled(operatorDisabledPlugins(await getSettingOverrides()))
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read plugin enablement')
  }

  try {
    pluginHost.setDurablyDisabled(await durablyDisabledPlugins())
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read plugin health')
  }
})
