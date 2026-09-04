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
import { InstallRestoreForm } from '@/components/install/restore-form'
import { getTranslator, tr } from '@/server/i18n'
import { gatherPreflight, installerIsSealed, probeMail } from '@/server/install'
import { installRestoreView } from '@/server/install-restore'
import { formatBytes } from '@/view/attachments'
import { installFormCopy, installRestoreCopy } from '@/view/install-copy'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.install') }
}

export const dynamic = 'force-dynamic'

const LEVEL_KEYS = {
  blocker: 'installPreflight.level.blocker',
  warning: 'installPreflight.level.warning',
  ok: 'installPreflight.level.ok',
} as const

const MAIL_PRESET_KEYS: Record<string, { readonly label: string; readonly note: string }> = {
  mailbox: {
    label: 'install.mailPreset.mailbox.label',
    note: 'install.mailPreset.mailbox.note',
  },
  'resend-http': {
    label: 'install.mailPreset.resendHttp.label',
    note: 'install.mailPreset.resendHttp.note',
  },
  'resend-smtp': {
    label: 'install.mailPreset.resendSmtp.label',
    note: 'install.mailPreset.resendSmtp.note',
  },
  brevo: {
    label: 'install.mailPreset.brevo.label',
    note: 'install.mailPreset.brevo.note',
  },
  postmark: {
    label: 'install.mailPreset.postmark.label',
    note: 'install.mailPreset.postmark.note',
  },
  ses: {
    label: 'install.mailPreset.ses.label',
    note: 'install.mailPreset.ses.note',
  },
  smtp: {
    label: 'install.mailPreset.smtp.label',
    note: 'install.mailPreset.smtp.note',
  },
  http: {
    label: 'install.mailPreset.http.label',
    note: 'install.mailPreset.http.note',
  },
}

export default async function InstallPage() {
  const t = await getTranslator()
  if (await installerIsSealed()) notFound()

  const checks = await gatherPreflight()
  const ready = canProceed(checks)
  const mail = await probeMail()
  const suggestedBoardUrl = await suggestBoardUrl()
  const restore = ready ? await installRestoreView() : null
  const now = new Date()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t.t('page.install-this-board')}
        </h1>
        <p className="text-sm text-muted-foreground">{t.t('page.this-page-works-once-when')}</p>
      </header>

      <Preflight checks={checks} />

      {restore?.possible && (
        <InstallRestoreForm
          candidates={restore.candidates.map((candidate) => ({
            name: candidate.name,
            label:
              candidate.takenAt === null
                ? candidate.name
                : t.t('install.restore.takenAt', {
                    time: formatTime(candidate.takenAt, now, t).label,
                  }),
            size: formatBytes(candidate.size),
            location:
              candidate.location === 'server'
                ? t.t('install.restore.onServer')
                : t.t('install.restore.offSite'),
          }))}
          destination={restore.destination}
          problem={restore.problem}
          copy={installRestoreCopy(t)}
        />
      )}

      {ready && (
        <InstallForm
          presets={MAIL_PRESETS.map((preset) => ({
            ...preset,
            label: t.t(MAIL_PRESET_KEYS[preset.id]?.label ?? preset.label),
            note: t.t(MAIL_PRESET_KEYS[preset.id]?.note ?? preset.note),
          }))}
          steps={INSTALL_STEPS.map((step) => ({
            id: step.id,
            title: t.t(step.titleKey),
            detail: t.t(step.detailKey),
          }))}
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
            <Finding key={check.id} check={check} t={t} />
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
            <Finding key={check.id} check={check} t={t} />
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
            summary={t.t('installPreflight.deferredWarnings', {
              warnings: warned.length,
              blockers: stopping.length,
            })}
          >
            <div className="flex flex-col gap-2">
              {warned.map((check) => (
                <Finding key={check.id} check={check} t={t} />
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
                <span>{t.t(check.titleKey, check.titleArgs)}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  )
}

function Finding({ check, t }: { check: Check; t: Awaited<ReturnType<typeof getTranslator>> }) {
  return (
    <Alert tone={check.level === 'blocker' ? 'error' : 'warning'}>
      <AlertDescription>
        <span className="font-mono text-xs uppercase text-muted-foreground">
          {t.t(LEVEL_KEYS[check.level])}
          {' · '}
        </span>
        <AlertTitle>{t.t(check.titleKey, check.titleArgs)}</AlertTitle>
        {check.detailKey !== undefined && (
          <span className="mt-1 block text-muted-foreground">
            {t.t(check.detailKey, check.detailArgs)}
          </span>
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
