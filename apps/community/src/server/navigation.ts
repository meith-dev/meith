import 'server-only'

import type { Actor } from '@meith/authorization'
import { CacheTags, cachedGlobal, env, logger } from '@meith/core'
import { getDb, type NavigationItemRow, PostgresNavigationRepository } from '@meith/db'
import { drivers } from '@meith/drivers'
import type { LinkModel, ViewerModel } from '@meith/theme-kit'

import { buildNavigation, defaultNavigationItems } from '../view/navigation'
import { getContainer } from './container'
import { getTranslator } from './i18n'
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

export async function boardNavigation(
  actor: Actor,
  viewer: ViewerModel,
): Promise<readonly LinkModel[]> {
  const { authorizer } = getContainer()

  return buildNavigation(await navigationItems(), viewer, {
    searchEnabled: await searchEnabled(),
    t: await getTranslator(),
    admits: (item) => authorizer.inAnyGroup(actor, item.visibleToGroups),
  })
}
