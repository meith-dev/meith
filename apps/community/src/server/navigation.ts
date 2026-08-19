import 'server-only'

import type { Actor } from '@meith/authorization'
import { CacheTags, cachedGlobal, env, logger } from '@meith/core'
import { getDb, type NavigationItemRow, PostgresNavigationRepository } from '@meith/db'
import { drivers } from '@meith/drivers'
import { pluginKeyOfNavigation, pluginNavigationPlacements } from '@meith/plugin-kit'
import type { LinkModel, ViewerModel } from '@meith/theme-kit'

import { buildNavigation, defaultNavigationItems, type NavigationNames } from '../view/navigation'
import { getContainer } from './container'
import { getTranslator } from './i18n'
import { activeDefinitions, pluginHost, syncPluginEnablement } from './plugin-host'
import { searchEnabled } from './search'

const TTL_SECONDS = 60

export function navigationRepository(): PostgresNavigationRepository | null {
  return env.DATA_SOURCE === 'postgres' ? new PostgresNavigationRepository(getDb()) : null
}

export async function navigationItems(): Promise<readonly NavigationItemRow[]> {
  const repository = navigationRepository()
  if (repository === null) return defaultNavigationItems()

  try {
    return await cachedGlobal<NavigationItemRow[]>(
      drivers().cache,
      { key: ['navigation', 'items'], tags: [CacheTags.navigation()], revalidate: TTL_SECONDS },
      async () => [...(await repository.list())],
    )
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not read the board navigation')
    return defaultNavigationItems()
  }
}

export function pluginNavigationNames(): NavigationNames {
  return Object.fromEntries(
    pluginNavigationPlacements(activeDefinitions()).map((item) => [
      item.key,
      { label: item.label, labelKey: item.labelKey, labelArgs: item.labelArgs },
    ]),
  )
}

/**
 * A row belongs to a plugin that is switched off, or has failed its way off, or
 * is no longer in the build. It is left in place — an operator's ordering is
 * worth keeping — but it is not a link anybody should be offered.
 */
async function pluginRowIsLive(key: string | null): Promise<boolean> {
  const pluginKey = pluginKeyOfNavigation(key)
  if (pluginKey === null) return true

  await syncPluginEnablement()
  return activeDefinitions().some((plugin) => plugin.key === pluginKey)
    ? pluginHost.isEnabled(pluginKey)
    : false
}

function pluginNavigationDrifted(items: readonly NavigationItemRow[]): boolean {
  const declared = pluginNavigationPlacements(activeDefinitions())
  const stored = new Map(
    items
      .filter((item) => item.key?.startsWith('plugin.') === true)
      .map((item) => [item.key as string, item.href] as const),
  )
  if (declared.length !== stored.size) return true
  return declared.some((item) => stored.get(item.key) !== item.href)
}

export async function boardNavigation(
  actor: Actor,
  viewer: ViewerModel,
): Promise<readonly LinkModel[]> {
  const { authorizer } = getContainer()

  let items = await navigationItems()
  if (pluginNavigationDrifted(items)) {
    await syncPluginNavigation()
    items = await navigationItems()
  }
  const live = await Promise.all(items.map((item) => pluginRowIsLive(item.key)))
  const shown = items.filter((_, index) => live[index] === true)

  return buildNavigation(shown, viewer, {
    searchEnabled: await searchEnabled(),
    t: await getTranslator(),
    names: pluginNavigationNames(),
    admits: (item) => authorizer.inAnyGroup(actor, item.visibleToGroups),
  })
}

export async function syncPluginNavigation(): Promise<void> {
  const repository = navigationRepository()
  if (repository === null) return

  try {
    await repository.syncPluginItems(
      pluginNavigationPlacements(activeDefinitions()).map((item) => ({
        key: item.key,
        href: item.href,
        audience: item.audience,
        parentKey: item.parentKey,
      })),
    )
    await drivers().cache.invalidateTags([CacheTags.navigation()])
  } catch (error) {
    logger().warn({ err: String(error) }, 'could not reconcile the plugin navigation')
  }
}
