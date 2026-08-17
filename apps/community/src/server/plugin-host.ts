import 'server-only'

import { cache } from 'react'

import { logger } from '@meith/core/logger'
import { operatorDisabledPlugins, type PluginDefinition, PluginHost } from '@meith/plugin-kit'

import forumConfig from '../../community.config'
import { getSettingOverrides } from './settings'

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
  logger: {
    warn: (message, detail) => logger().warn(detail, message),
    error: (message, detail) => logger().error(detail, message),
  },
})

export const syncOperatorDisables = cache(async (): Promise<void> => {
  try {
    pluginHost.setOperatorDisabled(operatorDisabledPlugins(await getSettingOverrides()))
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read plugin enablement')
  }
})
