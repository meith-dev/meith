import 'server-only'

import { env, logger, readPluginEnv } from '@meith/core'
import { getDb, pluginData, pluginGrants, pluginUsers } from '@meith/db'
import {
  resolvePluginSettings,
  unavailablePluginData,
  unavailablePluginGrants,
  unavailablePluginUsers,
  type PluginData,
  type PluginDefinition,
  type PluginGrants,
  type PluginUsers,
} from '@meith/plugin-kit'
import type { ReactNode } from 'react'

import forumConfig from '../../community.config'
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
        settings: resolvePluginSettings(definition, overrides, readPluginEnv),
        logger: {
          info: (message, detail) => log.info(detail ?? {}, message),
          warn: (message, detail) => log.warn(detail ?? {}, message),
          error: (message, detail) => log.error(detail ?? {}, message),
        },
        grants: grantsFor(pluginKey),
        data: dataFor(pluginKey),
        users: usersFor(),
        viewer: request.viewer,
        path,
        query: request.query,
        boardUrl: request.boardUrl,
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
        settings: resolvePluginSettings(definition, overrides, readPluginEnv),
        logger: {
          info: (message, detail) => log.info(detail ?? {}, message),
          warn: (message, detail) => log.warn(detail ?? {}, message),
          error: (message, detail) => log.error(detail ?? {}, message),
        },
        grants: grantsFor(pluginKey),
        data: dataFor(pluginKey),
        users: usersFor(),
      }),
    }
  } catch (error) {
    log.error({ err: error, path }, 'plugin admin page failed to render')
    return { title: page.title, node: null }
  }
}
