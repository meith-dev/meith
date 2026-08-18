'use server'

import { revalidatePath } from 'next/cache'

import { CacheTags, ValidationError } from '@meith/core'
import type {
  NavigationAudience,
  NavigationItemInput,
  PostgresNavigationRepository,
} from '@meith/db'
import { drivers } from '@meith/drivers'
import { msg } from '@meith/i18n'

import { NAVIGATION_AUDIENCE_VALUES } from '../view/navigation'
import { recordAdminAction, requireAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { formStateReporter } from './form-state-reporter'
import { checkbox, trimmedText } from './form-values'
import { navigationRepository } from './navigation'
import { isSafeLocalPath } from './safe-path'

const PANEL = '/admin/content/navigation'

const toFormState = formStateReporter('navigation-admin', 'navigation administration write failed')

function requireNavigation(): PostgresNavigationRepository {
  const repository = navigationRepository()
  if (repository === null) {
    throw new ValidationError(msg('error.app.board-running-in-memory-navigation'))
  }
  return repository
}

function itemId(form: FormData): number {
  const value = Number(trimmedText(form, 'id'))
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(msg('error.app.such-row'))
  }
  return value
}

function isAbsoluteWebAddress(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function href(form: FormData): string {
  const value = trimmedText(form, 'href')
  if (value === '') throw new ValidationError(msg('error.db.navigation-item-needs-address'))
  if (isSafeLocalPath(value) || isAbsoluteWebAddress(value)) return value
  throw new ValidationError(msg('error.app.navigation-address-path-or-web-address'))
}

function audience(form: FormData): NavigationAudience {
  const value = trimmedText(form, 'audience')
  const found = NAVIGATION_AUDIENCE_VALUES.find((entry) => entry === value)
  if (found === undefined) throw new ValidationError(msg('error.app.navigation-audience-unknown'))
  return found
}

function displayOrder(form: FormData): number {
  const value = Number(trimmedText(form, 'displayOrder') || '0')
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(msg('error.app.display-order-must-whole-number'))
  }
  return value
}

function visibleToGroups(form: FormData): readonly number[] {
  return form
    .getAll('groups')
    .map((value) => Number(typeof value === 'string' ? value : ''))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
}

function itemInput(form: FormData): NavigationItemInput {
  return {
    label: trimmedText(form, 'label'),
    href: href(form),
    displayOrder: displayOrder(form),
    audience: audience(form),
    newTab: checkbox(form, 'newTab'),
    enabled: checkbox(form, 'enabled'),
    visibleToGroups: visibleToGroups(form),
  }
}

async function refresh(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.navigation()])
  revalidatePath(PANEL)
}

export async function createNavigationItemAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const navigationItemId = await requireNavigation().create(itemInput(form))

    await refresh()
    await recordAdminAction({
      action: 'content.navigation_item_added',
      detail: { navigationItemId },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function updateNavigationItemAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const navigationItemId = itemId(form)
    await requireNavigation().update(navigationItemId, itemInput(form))

    await refresh()
    await recordAdminAction({
      action: 'content.navigation_item_changed',
      detail: { navigationItemId },
    })

    return { notice: 'saved' }
  } catch (err) {
    return toFormState(err)
  }
}

export async function deleteNavigationItemAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const navigationItemId = itemId(form)
    await requireNavigation().delete(navigationItemId)

    await refresh()
    await recordAdminAction({
      action: 'content.navigation_item_removed',
      detail: { navigationItemId },
    })

    return { notice: 'deleted' }
  } catch (err) {
    return toFormState(err)
  }
}
