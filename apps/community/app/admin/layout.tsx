import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ADMIN_IDLE_MINUTES } from '@meith/admin'

import { AdminSignInForm, AdminSignOutForm } from '@/components/admin/admin-forms'
import { AdminNav } from '@/components/admin/admin-nav'
import { PanelShell } from '@/components/shell/panel-shell'
import { askForPassword, resolveAdmin } from '@/server/admin'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { adminFormsCopy } from '@/view/admin-panel-copy'
import { buildPanelLinks } from '@/view/shell'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.control-panel') }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const resolved = await resolveAdmin()

  if ('denied' in resolved) {
    if (!askForPassword(resolved.denied)) notFound()

    return (
      <main
        id="board-content"
        tabIndex={-1}
        className="flex min-h-screen items-center justify-center px-6 py-12"
      >
        <AdminSignInForm
          next="/admin"
          reason={resolved.denied === 'expired' ? 'expired' : null}
          idleMinutes={ADMIN_IDLE_MINUTES}
          copy={adminFormsCopy(await getTranslator())}
        />
      </main>
    )
  }

  const actor = await getActor()
  const t = await getTranslator()
  const links = buildPanelLinks({
    t,
    current: 'admincp',
    canAccessModCp: actor.global.canAccessModCp === true,
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#board-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:inline-flex focus-visible:h-9 focus-visible:items-center focus-visible:rounded-md focus-visible:border focus-visible:border-border focus-visible:bg-card focus-visible:px-3 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-lg"
      >
        {await tr('page.skip-content')}
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center gap-x-3 px-4 py-2 sm:gap-x-4 sm:px-6">
          <a
            href="/admin"
            className="min-w-0 truncate font-heading text-base font-semibold whitespace-nowrap text-foreground sm:text-lg"
          >
            {await tr('page.control-panel')}
          </a>
          <div className="ml-auto flex shrink-0 items-center gap-3 text-sm whitespace-nowrap sm:gap-4">
            <a href="/" className="text-muted-foreground hover:text-foreground">
              {await tr('page.board')}
            </a>
            <AdminSignOutForm copy={adminFormsCopy(t)} />
          </div>
        </div>
      </header>

      {resolved.context.needsReauth && (
        <p className="border-b border-border bg-muted px-6 py-2 text-center text-xs text-muted-foreground">
          {t.t('adminLayout.reauth')}
        </p>
      )}

      <PanelShell panel="admincp" nav={<AdminNav />} links={links}>
        {children}
      </PanelShell>
    </div>
  )
}
