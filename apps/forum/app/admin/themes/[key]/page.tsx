import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  ImportThemeForm,
  ResetThemeForm,
  ThemeEditorForm,
} from '@/components/admin/theme-forms'
import { requireAdmin } from '@/server/admin'
import { buildThemeAdminView, themeAdminRepository } from '@/server/theme-admin'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Theme' }

/**
 * F68 — one theme's editor.
 *
 * The token list comes from the **theme package**, not from the stored row: the
 * row holds overrides only, so a screen built from it would show an operator
 * the three tokens they have already changed and none of the thirty-five they
 * could. Same rule as F64's settings and F66's permissions — the registry is
 * the list, storage is the exception to it.
 *
 * The export is rendered on the page rather than offered as a download,
 * deliberately: it is a small JSON document, an operator wants to paste it into
 * another board's import box, and a download would put a file on disk for them
 * to find and open first.
 */
export default async function AdminThemePage({
  params,
}: {
  params: Promise<{ key: string }>
}) {
  await requireAdmin()

  const { key } = await params
  const view = await buildThemeAdminView(key)
  if (view === null) notFound()

  const repository = themeAdminRepository()
  const exported = repository === null ? null : await repository.exportTheme(key)
  const now = new Date()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <a href="/admin/themes" className="text-sm text-primary hover:underline">
          ← All themes
        </a>
        <h1 className="font-serif text-2xl font-semibold">{view.title}</h1>
        <p className="text-sm text-muted-foreground">
          <code className="text-xs">{view.key}</code>
          {view.isActive ? ' · the theme this board renders' : ' · installed, not in use'}
          {view.updatedAt !== null && (
            <>
              {' '}
              · last changed{' '}
              <time dateTime={view.updatedAt.toISOString()}>
                {formatTime(view.updatedAt, now).label}
              </time>
            </>
          )}
        </p>
        {!view.isActive && (
          <p className="text-xs text-muted-foreground">
            Changes here are stored and will apply if this theme becomes the
            active one — which is a change to{' '}
            <code className="text-xs">forum.config.ts</code> and a redeploy.
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <ThemeEditorForm
          themeKey={view.key}
          tokens={view.tokens}
          customCss={view.customCss}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Export</h2>
        <p className="text-sm text-muted-foreground">
          Everything this board has changed, as a document another board can
          import. It carries no timestamp and no board identity — only the
          overrides themselves.
        </p>
        <textarea
          readOnly
          rows={8}
          value={exported === null ? '' : JSON.stringify(exported, null, 2)}
          className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs"
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Import</h2>
        <ImportThemeForm themeKey={view.key} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Reset</h2>
        {view.customised ? (
          <>
            <p className="text-sm text-muted-foreground">
              Removes every override, putting the board back to exactly what the
              theme ships. Take a copy of the export above first if you might
              want it back.
            </p>
            <ResetThemeForm themeKey={view.key} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing to reset — this theme is already exactly as it ships.
          </p>
        )}
      </section>
    </div>
  )
}
