import 'server-only'

import { env, logger } from '@meith/core'
import { getDb, pluginGrants } from '@meith/db'
import {
  resolvePluginSettings,
  unavailablePluginGrants,
  type PluginDefinition,
  type PluginGrants,
} from '@meith/plugin-kit'
import type { ReactNode } from 'react'

import forumConfig from '../../community.config'
import { getSettingOverrides } from './settings'

export function grantsFor(pluginKey: string): PluginGrants {
  return env.DATA_SOURCE === 'postgres'
    ? pluginGrants(getDb(), pluginKey)
    : unavailablePluginGrants('this board is running on in-memory sample data')
}

export interface RenderedPluginPage {
  readonly title: string
  readonly node: ReactNode | null
}

export async function renderPluginAdminPage(
  pluginKey: string,
  path: string,
): Promise<RenderedPluginPage | null> {
  const entry = (forumConfig.plugins ?? []).find((candidate) => candidate.key === pluginKey)
  const definition = entry?.plugin as PluginDefinition | undefined

  if (entry === undefined || definition === undefined) return null
  if (entry.enabled === false) return null

  const page = (definition.adminPages ?? []).find((candidate) => candidate.path === path)
  if (page === undefined) return null

  const overrides = await getSettingOverrides()
  if (overrides.get(`plugin.${pluginKey}._enabled`) === '0') return null

  const log = logger({ component: 'plugin-page', plugin: pluginKey })

  try {
    return {
      title: page.title,
      node: await page.render({
        settings: resolvePluginSettings(definition, overrides),
        logger: {
          info: (message, detail) => log.info(detail ?? {}, message),
          warn: (message, detail) => log.warn(detail ?? {}, message),
          error: (message, detail) => log.error(detail ?? {}, message),
        },
        grants: grantsFor(pluginKey),
      }),
    }
  } catch (error) {
    log.error({ err: error, path }, 'plugin admin page failed to render')
    return { title: page.title, node: null }
  }
}
