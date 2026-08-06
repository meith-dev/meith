'use server'

import { canProceed, parseInstallInput } from '@meith/install'
import { redirect } from 'next/navigation'

import { gatherPreflight, installerIsSealed, runInstall } from './install'

export interface InstallFormState {
  readonly errors?: Record<string, string>
  readonly failedStep?: { readonly id: string; readonly error: string }
  readonly values?: Record<string, string>
}

function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

export async function installAction(
  _previous: InstallFormState,
  form: FormData,
): Promise<InstallFormState> {
  const values = {
    boardName: field(form, 'boardName'),
    username: field(form, 'username'),
    email: field(form, 'email'),
  }

  if (await installerIsSealed()) {
    redirect('/')
  }

  const parsed = parseInstallInput({
    ...values,
    password: field(form, 'password'),
  })
  if (!parsed.ok) return { errors: parsed.errors, values }

  if (!canProceed(await gatherPreflight())) {
    return {
      errors: {
        form: 'The board is not ready to install. Reload this page for the current checks.',
      },
      values,
    }
  }

  const report = await runInstall(parsed.value)
  const failure = report.find((step) => step.status === 'failed')

  if (failure !== undefined) {
    return {
      failedStep: { id: failure.id, error: failure.error ?? 'Unknown failure.' },
      values,
    }
  }

  redirect('/login?installed=1')
}
