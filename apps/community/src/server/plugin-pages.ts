import 'server-only'

/**
 * F69 — calling a plugin to render a panel page.
 *
 * This is the only place in the control panel where markup comes from installed
 * code, so it is worth being explicit about what crosses the boundary and what
 * does not.
 *
 * **What a page gets:** its own resolved settings and a namespaced logger. That
 * is `PluginRuntimeContext`, unchanged from what a task or a lifecycle callback
 * receives, and deliberately the same object — a page that could reach further
 * than a task would make "what a plugin can do" depend on where it is standing.
 *
 * **What it does not get:** the `Actor`, the database, the request, the params.
 * The same omission F79 made for hook payloads, and the same argument (R4): a
 * plugin handed group ids will eventually decide something from them, and a
 * plugin holding a `Database` is outside every guarantee this codebase makes.
 * The authorisation decision has already happened — the route calls
 * `requireAdmin()` before it gets here, and there is no per-page permission for
 * a plugin to get wrong.
 *
 * **Failure is contained here, not by React.** A `render` that throws is caught
 * and reported as a page that did not render; the rest of the panel is
 * untouched. What cannot be contained from here is a *node* that throws during
 * React's own render — that needs an error boundary, error boundaries are
 * client components, and the honest statement is the same one `renderRegion`
 * makes: build your markup in the function, do not return a component that does
 * work.
 */
import { logger } from '@meith/core'
import { resolvePluginSettings, type PluginDefinition } from '@meith/plugin-kit'
import type { ReactNode } from 'react'

import forumConfig from '../../community.config'
import { getSettingOverrides } from './settings'

export interface RenderedPluginPage {
  readonly title: string
  /** `null` when the plugin threw while building its markup. */
  readonly node: ReactNode | null
}

/**
 * Render one contributed page, or `null` if there is no such page.
 *
 * `null` covers three cases the caller treats identically and should: no such
 * plugin, a plugin with no definition, and a plugin that declares no page at
 * that path. All three are a URL that does not exist, and distinguishing them
 * in the response would tell an unauthenticated prober which plugins are
 * installed — except that nothing unauthenticated reaches this, which is why
 * the reason to collapse them is simply that there is nothing useful to say.
 *
 * A page belonging to a plugin the operator has switched off is **not**
 * rendered. Otherwise "disabled" would mean "its hooks stop firing but its
 * screens still work", which is a distinction nobody expects to have to know.
 */
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
      }),
    }
  } catch (error) {
    log.error({ err: error, path }, 'plugin admin page failed to render')
    return { title: page.title, node: null }
  }
}
