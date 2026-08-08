import type { Metadata } from 'next'

import { PanelPage } from '@/components/shell/panel-page'
import { PluginEnableForm } from '@/components/admin/plugin-forms'
import { requireAdmin } from '@/server/admin'
import { hookListeners, pluginInventory } from '@/server/plugin-admin'

export const metadata: Metadata = { title: 'Plugins' }

/**
 * F69 — the plugin manager.
 *
 * The screen's shape follows the one thing that is genuinely hard about
 * administering plugins: **"is it on" has three answers and they are not
 * interchangeable.**
 *
 *  - *in the build* — `community.config.ts`. Changing it is a redeploy.
 *  - *switched on* — this screen's button. Durable, immediate, reversible.
 *  - *running* — the host has not auto-disabled it for throwing.
 *
 * A row that showed one boolean would be wrong about the other two, and the
 * three have completely different things to do about them: redeploy, press the
 * button, read the error. So each row says which of the three is false, and the
 * disable button is only offered for the middle one — the only one this screen
 * can actually change.
 *
 * The hook table is at the bottom rather than per row because the question it
 * answers is a *cross-plugin* one — "two plugins filter the post body; which
 * one wins" — and the answer is the order they are listed in.
 */
export default async function AdminPluginsPage() {
  /* Re-run, because a layout is not a security boundary (see the ACP layout). */
  await requireAdmin()

  const { plugins, migrationsKnown } = await pluginInventory()
  const listeners = hookListeners()

  return (
    <PanelPage
      title="Plugins"
      lede={
        <>
          Everything installable is named in{' '}
          <code className="text-xs">community.config.ts</code> so the bundler can see it and
          the compiler can check it. Nothing is discovered by scanning a directory at
          request time.
        </>
      }
    >
      {plugins.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No plugins are configured on this board.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {plugins.map((plugin) => {
            const pending = plugin.migrations.filter(
              (migration) => !migration.applied,
            ).length

            return (
              <li
                key={plugin.key}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium">
                    {plugin.name ?? plugin.key}
                    {plugin.version !== null && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {plugin.version}
                      </span>
                    )}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {plugin.key}
                  </span>

                  {/*
                    One line, and only when something is off. A row that always
                    printed "running normally" would train an operator to skip
                    the column that matters on the day it says otherwise.
                  */}
                  {!plugin.hasDefinition ? (
                    <span className="text-xs text-muted-foreground">
                      Registered without a definition — a key, and no code.
                    </span>
                  ) : !plugin.configuredEnabled ? (
                    <span className="text-xs text-muted-foreground">
                      Disabled in <code className="text-xs">community.config.ts</code>.
                      Turning it back on is a change to that file and a redeploy.
                    </span>
                  ) : !plugin.operatorEnabled ? (
                    <span className="text-xs text-muted-foreground">
                      Switched off here. Its hooks are not called on any instance.
                    </span>
                  ) : plugin.health?.disabledReason != null ? (
                    <span className="text-xs text-destructive">
                      Stopped by this server after repeated failures:{' '}
                      {plugin.health.disabledReason}
                    </span>
                  ) : null}

                  {pending > 0 && migrationsKnown && (
                    <span className="text-xs text-destructive">
                      {pending} migration{pending === 1 ? '' : 's'} not applied — run{' '}
                      <code className="text-xs">community upgrade</code>.
                    </span>
                  )}
                </span>

                <span className="flex shrink-0 items-center gap-3">
                  <a
                    href={`/admin/plugins/${plugin.key}`}
                    className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                  >
                    Details
                  </a>
                  {/*
                    Offered only when the config allows the plugin at all.
                    Switching on something the build does not contain would
                    store a row that changes nothing, which is the "control over
                    machinery that is not there" this screen used to be made of.
                  */}
                  {plugin.configuredEnabled && plugin.hasDefinition && (
                    <PluginEnableForm
                      pluginKey={plugin.key}
                      enabled={plugin.operatorEnabled}
                    />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {!migrationsKnown && (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          This board could not be asked which plugin migrations have run, so the rows
          above do not say. On a board running on sample data there is no such table; on a
          real one, that is worth looking into.
        </p>
      )}

      {listeners.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
          <h2 className="font-heading text-lg font-semibold">Hooks in use</h2>
          <p className="text-muted-foreground">
            Only hooks something is listening on. The full list of every extension point
            is in the generated reference, and reproducing all ninety-one here would bury
            these. Plugins are listed in the order they run — priority first, then key —
            so where two of them change the same value, the last one named has the final
            say.
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {listeners.map((row) => (
              <li key={row.hook} className="flex flex-wrap items-baseline gap-2 py-2">
                <code className="text-xs">{row.hook}</code>
                <span className="text-xs text-muted-foreground">
                  {row.plugins.join(' → ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
        <h2 className="font-heading text-lg font-semibold">Installing a plugin</h2>
        <p className="text-muted-foreground">
          A plugin is code, so it has to be in the build before it can run:{' '}
          <code className="text-xs">pnpm add</code> the package, add it to the{' '}
          <code className="text-xs">plugins</code> array in{' '}
          <code className="text-xs">community.config.ts</code>, and redeploy. The same three
          steps a theme takes, and for the same reason — a serverless bundle contains only
          what the bundler saw.
        </p>
        <p className="text-muted-foreground">
          A duplicate key is refused when the configuration loads rather than at first
          use, so a board that boots has a registry that makes sense.
        </p>
        <p className="text-muted-foreground">
          There is no uninstall button, and that is deliberate: removing a plugin is{' '}
          <code className="text-xs">pnpm remove</code>, a line out of that file, and a
          redeploy. A button that dropped a plugin&rsquo;s rows and left its code running
          would leave the board in a state neither installing nor removing produces.
        </p>
      </section>
    </PanelPage>
  )
}
