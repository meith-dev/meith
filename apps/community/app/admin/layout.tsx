import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ADMIN_IDLE_MINUTES } from '@meith/admin'

import {
  AdminSecondFactorForm,
  AdminSignInForm,
  AdminSignOutForm,
} from '@/components/admin/admin-forms'
import { AdminNav } from '@/components/admin/admin-nav'
import { PanelShell } from '@/components/shell/panel-shell'
import { askForPassword, pendingAdminSecondFactor, resolveAdmin } from '@/server/admin'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { twoFactorState } from '@/server/two-factor'
import { adminFormsCopy } from '@/view/admin-panel-copy'
import { buildPanelLinks } from '@/view/shell'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.control-panel') }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const resolved = await resolveAdmin()

  if ('denied' in resolved) {
    if (!askForPassword(resolved.denied)) notFound()

    const copy = adminFormsCopy(await getTranslator())
    const pending = await pendingAdminSecondFactor()

    return (
      <main
        id="board-content"
        tabIndex={-1}
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-12"
      >
        {pending === null ? (
          <AdminSignInForm
            next="/admin"
            reason={resolved.denied === 'expired' ? 'expired' : null}
            idleMinutes={ADMIN_IDLE_MINUTES}
            copy={copy}
          />
        ) : (
          <AdminSecondFactorForm
            recoveryCodesLeft={(await twoFactorState(pending.userId)).recoveryCodesLeft}
            copy={copy}
          />
        )}
        <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
          {await tr('adminPanel.cancel')}
        </a>
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

      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-x-3 px-4 sm:gap-x-4 sm:px-6">
          <a
            href="/admin"
            className="flex min-w-0 items-center gap-2.5 font-heading text-base font-semibold whitespace-nowrap text-foreground sm:text-lg"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 4.5h10M3 8h10M3 11.5h10M6 3v3M10.5 6.5v3M5 10v3" />
              </svg>
            </span>
            <span className="truncate">{await tr('page.control-panel')}</span>
          </a>
          <div className="ml-auto flex shrink-0 items-center gap-3 text-sm whitespace-nowrap sm:gap-4">
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
