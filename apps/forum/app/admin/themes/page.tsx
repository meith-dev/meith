import type { Metadata } from 'next'

import { requireAdmin } from '@/server/admin'
import { installedThemes, themeAdminRepository } from '@/server/theme-admin'

export const metadata: Metadata = { title: 'Themes' }

/**
 * F68 — the theme list.
 *
 * **There is no "switch theme" button, and that is the honest answer rather
 * than a gap.** `forum.config.ts` is the build-time registry (invariant 6): a
 * serverless bundle contains only what the bundler saw, and the resolved theme
 * is a module-level constant because its `extends` chain cannot change at
 * runtime. A control that appeared to switch themes would either not work or
 * would cost the board its first paint, which currently needs no database round
 * trip at all.
 *
 * So this screen says what installing and switching actually involve, in the
 * same words F69 uses about plugins: `pnpm add`, a line in `forum.config.ts`,
 * redeploy. Everything below that line — tokens, custom CSS — *is* runtime, and
 * is what the editor changes.
 */
export default async function AdminThemesPage() {
  await requireAdmin()

  const repository = themeAdminRepository()
  const customised = repository === null ? [] : await repository.list()
  const byKey = new Map(customised.map((row) => [row.key, row]))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Themes</h1>
        <p className="text-sm text-muted-foreground">
          A theme ships its own colours, spacing and components. What this panel
          changes is the part a board can change at runtime: the token values and
          any custom CSS.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {installedThemes().map((theme) => {
          const record = byKey.get(theme.key)
          return (
            <li key={theme.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {theme.title}
                  {theme.active && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      in use
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {theme.key} ·{' '}
                  {record === undefined
                    ? 'no changes — exactly as it ships'
                    : `${Object.keys(record.tokenOverrides).length} token${
                        Object.keys(record.tokenOverrides).length === 1 ? '' : 's'
                      } overridden${record.customCss === null ? '' : ', plus custom CSS'}`}
                </span>
              </span>
              <a
                href={`/admin/themes/${theme.key}`}
                className="shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Edit
              </a>
            </li>
          )
        })}
      </ul>

      <section className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
        <h2 className="font-serif text-lg font-semibold">Installing or switching a theme</h2>
        <p className="text-muted-foreground">
          Not something this screen can do, and the reason is worth knowing. A
          theme is code — components, not configuration — so it has to be in the
          build before it can render. Everything installable is named in{' '}
          <code className="text-xs">forum.config.ts</code> so the bundler can see
          it and the compiler can check it; nothing is discovered by scanning a
          directory at request time.
        </p>
        <p className="text-muted-foreground">
          Installing a theme is therefore three steps:{' '}
          <code className="text-xs">pnpm add</code> the package, add a line to{' '}
          <code className="text-xs">forum.config.ts</code>, and redeploy.
          Switching which one is active is a change to{' '}
          <code className="text-xs">defaultTheme</code> in the same file.
        </p>
      </section>
    </div>
  )
}
