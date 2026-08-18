import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { cn } from '@meith/ui'

import { ImportThemeForm, ResetThemeForm, ThemeEditorForm } from '@/components/admin/theme-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { buildThemeAdminView, themeAdminRepository } from '@/server/theme-admin'
import { themeAdminCopy } from '@/view/admin-theme-copy'
import { contrastCopy } from '@/view/contrast'
import { tokenGroupCopy } from '@/view/theme-tokens'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.theme') }
}

export default async function AdminThemePage({ params }: { params: Promise<{ key: string }> }) {
  if ((await adminPageContext()) === null) return null

  const { key } = await params
  const view = await buildThemeAdminView(key)
  if (view === null) notFound()

  const repository = themeAdminRepository()
  const exported = repository === null ? null : await repository.exportTheme(key)
  const now = new Date()
  const translator = await getTranslator()
  const copy = {
    ...tokenGroupCopy(translator),
    ...contrastCopy(translator),
    ...themeAdminCopy(translator),
  }

  return (
    <PanelPage
      back={{ href: '/admin/themes', label: translator.t('adminThemes.all') }}
      title={view.title}
      gap="loose"
      width="wide"
      lede={
        <>
          <code className="font-mono text-xs">{view.key}</code>
          {view.isDefault
            ? translator.t('adminThemes.defaultLede')
            : view.enabled
              ? translator.t('adminThemes.enabledLede')
              : translator.t('adminThemes.disabledLede')}
          {view.updatedAt !== null && (
            <>
              {' '}
              · last changed{' '}
              <time dateTime={view.updatedAt.toISOString()}>
                {formatTime(view.updatedAt, now, translator).label}
              </time>
            </>
          )}
        </>
      }
      meta={
        view.isBuildTheme
          ? translator.t('adminThemes.buildMeta')
          : translator.t('adminThemes.memberMeta')
      }
    >
      <section className={PANEL_CARD}>
        <ThemeEditorForm
          copy={copy}
          themeKey={view.key}
          tokens={view.tokens}
          customCss={view.customCss}
          isDefault={view.isDefault}
        />
      </section>

      <section className={cn(PANEL_CARD, 'max-w-3xl')}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminThemes.export')}</h2>
        <p className="text-sm text-muted-foreground">{translator.t('adminThemes.exportHint')}</p>
        <textarea
          readOnly
          rows={8}
          value={exported === null ? '' : JSON.stringify(exported, null, 2)}
          className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs"
        />
      </section>

      <section className={cn(PANEL_CARD, 'max-w-3xl')}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminThemes.import')}</h2>
        <ImportThemeForm themeKey={view.key} copy={copy} />
      </section>

      <section className={cn(PANEL_CARD, 'max-w-3xl')}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminThemes.reset')}</h2>
        {view.customised ? (
          <>
            <p className="text-sm text-muted-foreground">{translator.t('adminThemes.resetHint')}</p>
            <ResetThemeForm themeKey={view.key} copy={copy} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {await tr('page.nothing-reset-this-theme-already')}
          </p>
        )}
      </section>
    </PanelPage>
  )
}
