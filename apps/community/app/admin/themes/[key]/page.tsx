import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  ImportThemeForm,
  ResetThemeForm,
  ThemeEditorForm,
} from '@/components/admin/theme-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { buildThemeAdminView, themeAdminRepository } from '@/server/theme-admin'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Theme' }

export default async function AdminThemePage({
  params,
}: {
  params: Promise<{ key: string }>
}) {
  if ((await adminPageContext()) === null) return null

  const { key } = await params
  const view = await buildThemeAdminView(key)
  if (view === null) notFound()

  const repository = themeAdminRepository()
  const exported = repository === null ? null : await repository.exportTheme(key)
  const now = new Date()

  return (
    <PanelPage
      back={{ href: '/admin/themes', label: 'All themes' }}
      title={view.title}
      gap="loose"
      width="wide"
      lede={
        <>
          <code className="font-mono text-xs">{view.key}</code>
          {view.isDefault
            ? ' · what a member who has chosen nothing sees'
            : view.enabled
              ? ' · members may choose it'
              : ' · turned off, so nobody can choose it'}
          {view.updatedAt !== null && (
            <>
              {' '}
              · last changed{' '}
              <time dateTime={view.updatedAt.toISOString()}>
                {formatTime(view.updatedAt, now).label}
              </time>
            </>
          )}
        </>
      }
      meta={
        view.isBuildTheme
          ? 'The board falls back to this theme’s components when nothing else is chosen, so it is what a new visitor sees.'
          : 'A member who picks this theme gets its components as well as these colours.'
      }
    >
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <ThemeEditorForm
          themeKey={view.key}
          tokens={view.tokens}
          customCss={view.customCss}
        />
      </section>

      <section className="flex max-w-3xl flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Export</h2>
        <p className="text-sm text-muted-foreground">
          Everything this board has changed, as a document another board can import. It
          carries no timestamp and no board identity — only the overrides themselves.
        </p>
        <textarea
          readOnly
          rows={8}
          value={exported === null ? '' : JSON.stringify(exported, null, 2)}
          className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs"
        />
      </section>

      <section className="flex max-w-3xl flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Import</h2>
        <ImportThemeForm themeKey={view.key} />
      </section>

      <section className="flex max-w-3xl flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-heading text-lg font-semibold">Reset</h2>
        {view.customised ? (
          <>
            <p className="text-sm text-muted-foreground">
              Removes every override, putting the board back to exactly what the theme
              ships. Take a copy of the export above first if you might want it back.
            </p>
            <ResetThemeForm themeKey={view.key} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing to reset — this theme is already exactly as it ships.
          </p>
        )}
      </section>
    </PanelPage>
  )
}
