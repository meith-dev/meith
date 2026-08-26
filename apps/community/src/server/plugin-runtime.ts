import 'server-only'

import forumConfig from '@board/config'

import { env, type logger, readPluginEnv } from '@meith/core'
import { getDb, pluginData, pluginGrants, pluginUsers } from '@meith/db'
import {
  type PluginData,
  type PluginDefinition,
  type PluginGrants,
  type PluginNotify,
  type PluginRuntimeContext,
  type PluginUsers,
  pluginNotify,
  resolvePluginSettings,
  unavailablePluginData,
  unavailablePluginGrants,
  unavailablePluginNotify,
  unavailablePluginUsers,
} from '@meith/plugin-kit'

const REQUEST_STATEMENT_TIMEOUT_MS = 3_000

export function grantsFor(pluginKey: string): PluginGrants {
  return env.DATA_SOURCE === 'postgres'
    ? pluginGrants(getDb(), pluginKey)
    : unavailablePluginGrants('this board is running on in-memory sample data')
}

export function dataFor(pluginKey: string): PluginData {
  return env.DATA_SOURCE === 'postgres'
    ? pluginData(getDb(), pluginKey, { statementTimeoutMs: REQUEST_STATEMENT_TIMEOUT_MS })
    : unavailablePluginData('this board is running on in-memory sample data')
}

export function usersFor(): PluginUsers {
  return env.DATA_SOURCE === 'postgres'
    ? pluginUsers(getDb())
    : unavailablePluginUsers('this board is running on in-memory sample data')
}

export function notifyFor(pluginKey: string): PluginNotify {
  return {
    async send(input) {
      const { notificationService } = await import('./notifications')
      const entry = (forumConfig.plugins ?? []).find((candidate) => candidate.key === pluginKey)
      const definition = entry?.plugin as PluginDefinition | undefined
      const service = notificationService()

      const notify =
        definition === undefined || service === null
          ? unavailablePluginNotify('this board is running on in-memory sample data')
          : pluginNotify(pluginKey, definition.notifications ?? [], service)

      return notify.send(input)
    },
  }
}

export function runtimeContextFor(
  pluginKey: string,
  definition: PluginDefinition,
  overrides: ReadonlyMap<string, string>,
  log: ReturnType<typeof logger>,
): PluginRuntimeContext {
  return {
    settings: resolvePluginSettings(definition, overrides, readPluginEnv),
    logger: {
      info: (message, detail) => log.info(detail ?? {}, message),
      warn: (message, detail) => log.warn(detail ?? {}, message),
      error: (message, detail) => log.error(detail ?? {}, message),
    },
    grants: grantsFor(pluginKey),
    data: dataFor(pluginKey),
    users: usersFor(),
    notify: notifyFor(pluginKey),
  }
}
