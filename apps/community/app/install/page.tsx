import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { DEFAULT_AUTH_POLICY } from '@meith/accounts'
import { env } from '@meith/core'
import {
  blockers,
  type Check,
  canProceed,
  freshReport,
  INSTALL_STEPS,
  warnings,
} from '@meith/install'
import { isUsableOrigin, MAIL_PRESETS, normaliseOrigin } from '@meith/settings'
import { Alert, AlertDescription, AlertTitle, Disclosure } from '@meith/ui'

import { InstallForm } from '@/components/install/install-form'
import { getTranslator, tr } from '@/server/i18n'
import { gatherPreflight, installerIsSealed, probeMail } from '@/server/install'
import { installFormCopy } from '@/view/install-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.install') }
}

export const dynamic = 'force-dynamic'

export default async function InstallPage() {
  const t = await getTranslator()
  if (await installerIsSealed()) notFound()

  const checks = await gatherPreflight()
  const ready = canProceed(checks)
  const mail = await probeMail()
  const suggestedBoardUrl = await suggestBoardUrl()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t.t('page.install-this-board')}
        </h1>
        <p className="text-sm text-muted-foreground">{t.t('page.this-page-works-once-when')}</p>
      </header>

      <Preflight checks={checks} />

      {ready && (
        <InstallForm
          presets={MAIL_PRESETS}
          steps={INSTALL_STEPS}
          initialReport={freshReport()}
          mailIsFromEnvironment={mail.source === 'environment'}
          suggestedBoardUrl={suggestedBoardUrl}
          boardUrlIsFromEnvironment={(env.APP_URL ?? '') !== ''}
          copy={installFormCopy(DEFAULT_AUTH_POLICY.reservedUsernames, t)}
        />
      )}
    </main>
  )
}

async function Preflight({ checks }: { checks: readonly Check[] }) {
  const t = await getTranslator()
  const stopping = blockers(checks)
  const warned = warnings(checks)
  const passed = checks.filter((check) => check.level === 'ok')

  return (
    <section aria-labelledby="preflight" className="flex flex-col gap-3">
      <h2
        id="preflight"
        className="font-heading text-lg font-semibold tracking-tight text-foreground"
      >
        {t.t('page.before-installing')}
      </h2>

      {stopping.length > 0 && (
        <div role="alert" className="flex flex-col gap-2">
          {stopping.map((check) => (
            <Finding key={check.id} check={check} />
          ))}
          <p className="text-sm text-muted-foreground">
            {stopping.length === 1
              ? t.t('installPreflight.blocker.one')
              : t.t('installPreflight.blocker.other', { count: stopping.length })}
          </p>
        </div>
      )}

      {stopping.length === 0 ? (
        <>
          {warned.map((check) => (
            <Finding key={check.id} check={check} />
          ))}
          {warned.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {warned.length === 1
                ? t.t('installPreflight.warning.one')
                : t.t('installPreflight.warning.other')}
            </p>
          )}
        </>
      ) : (
        warned.length > 0 && (
          <Disclosure
            summary={`${warned.length === 1 ? '1 warning' : `${warned.length} warnings`}${
              stopping.length === 1 ? ', for after that is fixed' : ', for after those are fixed'
            }`}
          >
            <div className="flex flex-col gap-2">
              {warned.map((check) => (
                <Finding key={check.id} check={check} />
              ))}
            </div>
          </Disclosure>
        )
      )}

      {passed.length > 0 && (
        <Disclosure summary={t.t('installPreflight.passed', { count: passed.length })}>
          <ul className="flex flex-col gap-1 text-sm">
            {passed.map((check) => (
              <li key={check.id} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground">
                  ✓
                </span>
                <span>{check.title}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  )
}

function Finding({ check }: { check: Check }) {
  return (
    <Alert tone={check.level === 'blocker' ? 'error' : 'warning'}>
      <AlertDescription>
        <span className="font-mono text-xs uppercase text-muted-foreground">
          {check.level}
          {' · '}
        </span>
        <AlertTitle>{check.title}</AlertTitle>
        {check.detail !== '' && (
          <span className="mt-1 block text-muted-foreground">{check.detail}</span>
        )}
      </AlertDescription>
    </Alert>
  )
}

async function suggestBoardUrl(): Promise<string> {
  try {
    const incoming = await headers()
    const host = incoming.get('x-forwarded-host') ?? incoming.get('host') ?? ''
    if (host === '') return ''

    const proto = incoming.get('x-forwarded-proto') ?? 'https'
    const candidate = `${proto.split(',')[0]?.trim() ?? 'https'}://${host.split(',')[0]?.trim() ?? ''}`

    return isUsableOrigin(candidate) ? normaliseOrigin(candidate) : ''
  } catch {
    return ''
  }
}
