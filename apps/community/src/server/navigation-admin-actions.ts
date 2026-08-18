'use server'

import { revalidatePath } from 'next/cache'

import { CacheTags, ValidationError } from '@meith/core'
import type {
  NavigationAudience,
  NavigationDropTarget,
  NavigationItemInput,
  PostgresNavigationRepository,
} from '@meith/db'
import { drivers } from '@meith/drivers'
import { msg } from '@meith/i18n'

import { NAVIGATION_AUDIENCE_VALUES, outlineOf } from '../view/navigation'
import { isNavigationNudge, isWhereItIs, nudgeTarget } from '../view/navigation-arrange'
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

function optionalId(form: FormData, name: string): number | null {
  const value = trimmedText(form, name)
  if (value === '') return null

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ValidationError(msg('error.app.such-row'))
  }
  return parsed
}

function visibleToGroups(form: FormData): readonly number[] {
  return form
    .getAll('groups')
    .map((value) => Number(typeof value === 'string' ? value : ''))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
}

function itemInput(form: FormData): NavigationItemInput {
  return {
    parentId: optionalId(form, 'parentId'),
    label: trimmedText(form, 'label'),
    href: href(form),
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

export async function arrangeNavigationItemAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const repository = requireNavigation()
    const navigationItemId = itemId(form)
    const outline = outlineOf(await repository.list())

    if (!outline.some((row) => row.id === navigationItemId)) {
      throw new ValidationError(msg('error.app.such-row'))
    }

    const target = dropTarget(form, outline, navigationItemId)
    if (isWhereItIs(outline, navigationItemId, target)) return { notice: 'unmoved' }

    await repository.arrange(navigationItemId, target)

    await refresh()
    await recordAdminAction({
      action: 'content.navigation_item_moved',
      detail: { navigationItemId, parentId: target.parentId, afterId: target.afterId },
    })

    return { notice: 'moved' }
  } catch (err) {
    return toFormState(err)
  }
}

function dropTarget(
  form: FormData,
  outline: ReturnType<typeof outlineOf>,
  id: number,
): NavigationDropTarget {
  const nudge = trimmedText(form, 'nudge')

  if (nudge !== '') {
    if (!isNavigationNudge(nudge)) throw new ValidationError(msg('error.app.direction'))

    const target = nudgeTarget(outline, id, nudge)
    if (target === null) {
      throw new ValidationError(msg('error.app.navigation-item-go-further-direction'))
    }
    return target
  }

  return { parentId: optionalId(form, 'parentId'), afterId: optionalId(form, 'afterId') }
}
