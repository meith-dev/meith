'use server'

import { redirect } from 'next/navigation'

import { env } from '@meith/core'
import {
  canProceed,
  ECHOED_FIELDS,
  fieldErrorsFromReport,
  firstFailure,
  installInputFromForm,
  MAIL_SKIP,
  mailConfigFromInstallInput,
  parseInstallInput,
  type StepOutcome,
  stepTitleKey,
  withEnvironmentAnswers,
} from '@meith/install'
import { mailConfigFromEnvironment } from '@meith/settings'

import { getTranslator } from './i18n'
import { gatherPreflight, installerIsSealed, runInstall } from './install'
import { sendTestMail } from './mail-test'

export interface InstallFormState {
  readonly errors?: Record<string, string>
  readonly failedStep?: {
    readonly id: string
    readonly title: string
    readonly error: string
  }
  readonly report?: readonly StepOutcome[]
  readonly values?: Record<string, string>
}

export async function installAction(
  _previous: InstallFormState,
  form: FormData,
): Promise<InstallFormState> {
  const submitted = withEnvironmentAnswers(installInputFromForm(form), {
    boardUrl: env.APP_URL ?? null,
    mailIsFromEnvironment: mailConfigFromEnvironment(env) !== null,
  })

  const values = Object.fromEntries(
    ECHOED_FIELDS.map((name) => [name, submitted[name] ?? '']),
  ) as Record<string, string>

  if (await installerIsSealed()) {
    redirect('/')
  }

  const parsed = parseInstallInput(submitted)
  const t = await getTranslator()
  if (!parsed.ok) return { errors: translatedErrors(parsed.errors, t), values }

  if (!canProceed(await gatherPreflight())) {
    return {
      errors: {
        form: t.t('installAction.notReady'),
      },
      values,
    }
  }

  if (parsed.value.mailPreset !== MAIL_SKIP) {
    const test = await sendTestMail({
      config: mailConfigFromInstallInput(parsed.value),
      to: parsed.value.email,
      boardName: parsed.value.boardName,
      t,
    })

    if (!test.ok) {
      return {
        errors: {
          mailPreset: t.t('installAction.mailFailed', {
            email: parsed.value.email,
            error: test.error ?? t.t('installAction.noProviderResponse'),
          }),
        },
        values,
      }
    }
  }

  const report = await runInstall(parsed.value)
  const failure = firstFailure(report)

  if (failure !== null) {
    return {
      failedStep: {
        id: failure.id,
        title: t.t(stepTitleKey(failure.id)),
        error: failure.error ?? t.t('installAction.unknownFailure'),
      },
      errors: translatedErrors(fieldErrorsFromReport(report), t),
      report,
      values,
    }
  }

  redirect('/login?installed=1')
}

function translatedErrors(
  errors: Record<string, string>,
  t: Awaited<ReturnType<typeof getTranslator>>,
) {
  return Object.fromEntries(
    Object.entries(errors).map(([field, error]) => [field, t.has(error) ? t.t(error) : error]),
  )
}
