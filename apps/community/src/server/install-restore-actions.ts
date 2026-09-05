'use server'

import { isAppError, logger } from '@meith/core'

import { getTranslator } from './i18n'
import { installerIsSealed } from './install'
import { type InstallRestoreOutcome, runInstallRestore } from './install-restore'
import { installUnlocked } from './install-unlock'

export interface InstallRestoreState {
  readonly error?: string
  readonly outcome?: InstallRestoreOutcome
}

export async function installRestoreAction(
  _previous: InstallRestoreState,
  form: FormData,
): Promise<InstallRestoreState> {
  const t = await getTranslator()
  if (await installerIsSealed()) return { error: t.t('installRestore.alreadyInstalled') }
  if (!(await installUnlocked())) return { error: t.t('installUnlock.required') }

  const raw = form.get('bundle')
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name === '') return { error: t.t('installRestore.pickOne') }
  if (form.get('confirm') !== '1') return { error: t.t('installRestore.confirmFirst') }

  try {
    const run = await runInstallRestore(name)
    if ('sealed' in run) return { error: t.t('installRestore.alreadyInstalled') }
    if ('busy' in run) return { error: t.t('installRestore.busy') }
    return { outcome: run.outcome }
  } catch (error) {
    if (isAppError(error)) return { error: error.message }
    logger({ module: 'install-restore' }).error({ err: error }, 'restore from the installer failed')
    return {
      error: t.t('installRestore.failed', {
        error: error instanceof Error ? error.message.slice(0, 300) : String(error),
      }),
    }
  }
}
