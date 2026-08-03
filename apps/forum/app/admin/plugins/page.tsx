import type { Metadata } from 'next'

import { requireAdmin } from '@/server/admin'
import { configuredPlugins } from '@/server/plugin-admin'

export const metadata: Metadata = { title: 'Plugins' }

/**
 * F69 — the plugin inventory.
 *
 * This screen is mostly an honest account of what is not built yet, and that is
 * the deliverable rather than a shortfall. F69's line asks for enable/disable,
 * migrations, settings, ACP pages and hook health; every one of those describes
 * the plugin **lifecycle**, which is F79's, and none of it exists — there is no
 * hook registry, no plugin migration runner, no plugin settings namespace, and
 * no way for a plugin to contribute a page.
 *
 * Rendering five controls over machinery that is not there would be the stub
 * D32 refuses. So: the inventory, the install story, and a precise statement of
 * what each missing piece is waiting on.
 */
export default async function AdminPluginsPage() {
  /* Re-run, because a layout is not a security boundary (see the ACP layout). */
  await requireAdmin()

  const plugins = configuredPlugins()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Plugins</h1>
        <p className="text-sm text-muted-foreground">
          Everything installable is named in{' '}
          <code className="text-xs">forum.config.ts</code> so the bundler can see
          it and the compiler can check it. Nothing is discovered by scanning a
          directory at request time.
        </p>
      </div>

      {plugins.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No plugins are configured on this board.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {plugins.map((plugin) => (
            <li key={plugin.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{plugin.key}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {plugin.enabled ? 'enabled in the configuration' : 'disabled in the configuration'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
        <h2 className="font-serif text-lg font-semibold">Installing a plugin</h2>
        <p className="text-muted-foreground">
          A plugin is code, so it has to be in the build before it can run:{' '}
          <code className="text-xs">pnpm add</code> the package, add it to the{' '}
          <code className="text-xs">plugins</code> array in{' '}
          <code className="text-xs">forum.config.ts</code>, and redeploy. The
          same three steps a theme takes, and for the same reason — a serverless
          bundle contains only what the bundler saw.
        </p>
        <p className="text-muted-foreground">
          A duplicate key is refused when the configuration loads rather than at
          first use, so a board that boots has a registry that makes sense.
        </p>
      </section>

      {/*
        The honest half. Naming what is absent, and what it is waiting on, is
        more use than five controls over machinery that does not exist.
      */}
      <section className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
        <h2 className="font-serif text-lg font-semibold">What this screen cannot do yet</h2>
        <p className="text-muted-foreground">
          A plugin is currently a key and nothing else. The lifecycle that gives
          it behaviour — hooks, migrations, settings, its own panel pages — is a
          later feature, and until it exists these would be controls over
          nothing:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          <li>
            <strong>Enabling and disabling at runtime.</strong> Nothing reads a
            plugin&rsquo;s enabled state today, so a switch here would change a
            stored value and no behaviour.
          </li>
          <li>
            <strong>Migrations.</strong> Plugins own no tables, so there is
            nothing to run or to report.
          </li>
          <li>
            <strong>Settings and panel pages.</strong> Both need a plugin to be
            able to declare them, which is what the lifecycle adds.
          </li>
          <li>
            <strong>Hook health.</strong> There is no hook registry, so there is
            no timing to measure and nothing to auto-disable.
          </li>
        </ul>
        <p className="text-muted-foreground">
          Each arrives with the plugin lifecycle. What is here now is the
          inventory and the install story, both of which are true today.
        </p>
      </section>
    </div>
  )
}
