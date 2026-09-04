'use server'

import { rm } from 'node:fs/promises'

import { revalidatePath } from 'next/cache'

import { isBundleName } from '@meith/backup'
import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { recordAdminAction, requireAdmin, requireFreshAdmin } from './admin'
import type { FormState } from './auth-form-state'
import {
  backupsAvailable,
  currentBackupSettings,
  destinationFor,
  localBundlePath,
  requireBackupRuns,
} from './backup-admin'
import { requireConfirmation } from './confirm'
import { formStateReporter } from './form-state-reporter'
import { tr } from './i18n'

const toFormState = formStateReporter('backup-admin', 'backup action failed')

const BACKUPS_PATH = '/admin/system/backups'

function refreshBackupsScreen(): void {
  revalidatePath(BACKUPS_PATH)
}

export async function requestBackupAction(): Promise<FormState> {
  try {
    const admin = await requireAdmin()
    if (backupsAvailable() !== 'available') {
      throw new ValidationError(msg('error.app.backups-not-on-this-deployment'))
    }

    const { queued } = await requireBackupRuns().enqueue({
      trigger: 'manual',
      requestedByUserId: admin.session.userId,
      now: new Date(),
    })

    refreshBackupsScreen()
    if (queued) await recordAdminAction({ action: 'backup.requested' })
    return { notice: queued ? 'queued' : 'already' }
  } catch (err) {
    return toFormState(err)
  }
}

function bundleNameFrom(form: FormData): string {
  const raw = form.get('name')
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!isBundleName(name)) throw new ValidationError(msg('error.app.not-a-backup-bundle-name'))
  return name
}

export async function deleteBackupAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requireFreshAdmin()
    const name = bundleNameFrom(form)

    const confirm = requireConfirmation(form, await tr('adminBackups.confirm.delete'))
    if (confirm !== null) return confirm

    const local = await localBundlePath(name)
    if (local !== null) await rm(local, { force: true })

    let remote = false
    const destination = destinationFor(await currentBackupSettings())
    if (destination !== undefined) {
      const listed = await destination.list()
      if (listed.some((bundle) => bundle.name === name)) {
        await destination.delete(name)
        remote = true
      }
    }

    if (local === null && !remote) throw new ValidationError(msg('error.app.no-such-bundle'))

    refreshBackupsScreen()
    await recordAdminAction({
      action: 'backup.deleted',
      detail: { name, local: local !== null, remote },
    })
    return { notice: 'deleted', values: { name } }
  } catch (err) {
    return toFormState(err)
  }
}

export async function testBackupDestinationAction(): Promise<FormState> {
  try {
    await requireAdmin()
    const settings = await currentBackupSettings()
    if (settings.destination.problem !== null) {
      throw new ValidationError(settings.destination.problem)
    }
    const destination = destinationFor(settings)
    if (destination === undefined) {
      throw new ValidationError(msg('error.app.no-off-site-destination'))
    }

    const bundles = await destination.list()
    await recordAdminAction({
      action: 'backup.destination_tested',
      detail: { count: bundles.length },
    })
    return { notice: 'reachable', values: { count: String(bundles.length) } }
  } catch (err) {
    return toFormState(err)
  }
}
