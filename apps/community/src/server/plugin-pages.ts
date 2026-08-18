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
import { getTranslator } from './i18n'
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

function translated(
  t: Awaited<ReturnType<typeof getTranslator>> | undefined,
  key: string | undefined,
  fallback: string,
  args?: Parameters<Awaited<ReturnType<typeof getTranslator>>['t']>[1],
): string {
  return t !== undefined && key !== undefined && t.has(key) ? t.t(key, args) : fallback
}

export function pluginBoardPageTitle(
  pluginKey: string,
  path: string,
  t?: Awaited<ReturnType<typeof getTranslator>>,
): string | null {
  const entry = (forumConfig.plugins ?? []).find((candidate) => candidate.key === pluginKey)
  const definition = entry?.plugin as PluginDefinition | undefined
  const page = (definition?.pages ?? []).find((candidate) => candidate.path === path)
  return page === undefined ? null : translated(t, page.titleKey, page.title, page.titleArgs)
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

  const [log, t] = [logger({ component: 'plugin-page', plugin: pluginKey }), await getTranslator()]
  const title = translated(t, page.titleKey, page.title, page.titleArgs)

  if (page.access === 'member' && request.viewer.userId === null) {
    return { outcome: 'sign-in-first', title }
  }

  try {
    return {
      outcome: 'rendered',
      title,
      node: await page.render({
        ...runtimeContextFor(pluginKey, definition, overrides, log),
        viewer: request.viewer,
        path,
        query: request.query,
        boardUrl: request.boardUrl,
        locale: t.locale,
        t,
      }),
    }
  } catch (error) {
    log.error({ err: error, path }, 'plugin board page failed to render')
    return { outcome: 'rendered', title, node: null }
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

  const [log, t] = [logger({ component: 'plugin-page', plugin: pluginKey }), await getTranslator()]
  const title = translated(t, page.titleKey, page.title, page.titleArgs)

  try {
    return {
      title,
      node: await page.render({
        ...runtimeContextFor(pluginKey, definition, overrides, log),
        query,
        locale: t.locale,
        t,
      }),
    }
  } catch (error) {
    log.error({ err: error, path }, 'plugin admin page failed to render')
    return { title, node: null }
  }
}
