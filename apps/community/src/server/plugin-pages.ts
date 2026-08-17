import 'server-only'

import type { ReactNode } from 'react'

import { env, logger, readPluginEnv } from '@meith/core'
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

import forumConfig from '../../community.config'
import { getLocale } from './i18n'
import { notificationService } from './notifications'
import { getSettingOverrides } from './settings'

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
  const entry = (forumConfig.plugins ?? []).find((candidate) => candidate.key === pluginKey)
  const definition = entry?.plugin as PluginDefinition | undefined
  const service = notificationService()

  if (definition === undefined || service === null) {
    return unavailablePluginNotify('this board is running on in-memory sample data')
  }
  return pluginNotify(pluginKey, definition.notifications ?? [], service)
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

export interface RenderedPluginPage {
  readonly title: string
  readonly node: ReactNode | null
}

export interface BoardPageRequest {
  readonly viewer: { readonly userId: number | null; readonly isGuest: boolean }
  readonly query: Readonly<Record<string, string>>
  readonly boardUrl: string
}

export type BoardPageResult =
  | { readonly outcome: 'rendered'; readonly title: string; readonly node: ReactNode | null }
  | { readonly outcome: 'missing' }
  | { readonly outcome: 'sign-in-first'; readonly title: string }

export function pluginBoardPageTitle(pluginKey: string, path: string): string | null {
  const entry = (forumConfig.plugins ?? []).find((candidate) => candidate.key === pluginKey)
  const definition = entry?.plugin as PluginDefinition | undefined
  return (definition?.pages ?? []).find((page) => page.path === path)?.title ?? null
}

export async function renderPluginBoardPage(
  pluginKey: string,
  path: string,
  request: BoardPageRequest,
): Promise<BoardPageResult> {
  const entry = (forumConfig.plugins ?? []).find((candidate) => candidate.key === pluginKey)
  const definition = entry?.plugin as PluginDefinition | undefined

  if (entry === undefined || definition === undefined) return { outcome: 'missing' }
  if (entry.enabled === false) return { outcome: 'missing' }

  const page = (definition.pages ?? []).find((candidate) => candidate.path === path)
  if (page === undefined) return { outcome: 'missing' }

  const overrides = await getSettingOverrides()
  if (overrides.get(`plugin.${pluginKey}._enabled`) === '0') return { outcome: 'missing' }

  if (page.access === 'member' && request.viewer.userId === null) {
    return { outcome: 'sign-in-first', title: page.title }
  }

  const log = logger({ component: 'plugin-page', plugin: pluginKey })

  try {
    return {
      outcome: 'rendered',
      title: page.title,
      node: await page.render({
        ...runtimeContextFor(pluginKey, definition, overrides, log),
        viewer: request.viewer,
        path,
        query: request.query,
        boardUrl: request.boardUrl,
        locale: (await getLocale()).locale,
      }),
    }
  } catch (error) {
    log.error({ err: error, path }, 'plugin board page failed to render')
    return { outcome: 'rendered', title: page.title, node: null }
  }
}

export async function renderPluginAdminPage(
  pluginKey: string,
  path: string,
  query: Readonly<Record<string, string>> = {},
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
        ...runtimeContextFor(pluginKey, definition, overrides, log),
        query,
        locale: (await getLocale()).locale,
      }),
    }
  } catch (error) {
    log.error({ err: error, path }, 'plugin admin page failed to render')
    return { title: page.title, node: null }
  }
}
