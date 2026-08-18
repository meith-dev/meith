import type { Translator } from '@meith/i18n'

import { copyFor, splitAround } from './copy'
import { untranslated } from './time'

export function profileFormCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'accountForm.profile.location',
      'accountForm.profile.website',
      'accountForm.profile.bio',
      'accountForm.profile.bioHint',
      'accountForm.profile.submit',
    ],
    t,
  )
}

export function displayGroupFormCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(
    [
      'accountForm.displayGroup.title',
      'accountForm.displayGroup.label',
      'accountForm.displayGroup.hint',
      'accountForm.displayGroup.submit',
    ],
    t,
  )
}

export function optionsFormCopy(
  boardPostsPerPage: number,
  boardThreadsPerPage: number,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'accountForm.options.timezone',
        'accountForm.options.timezoneHint',
        'accountForm.options.locale',
        'accountForm.options.localeHint',
        'accountForm.options.postsPerPage',
        'accountForm.options.threadsPerPage',
        'accountForm.options.pageSizeHint',
        'accountForm.options.invisible',
        'accountForm.options.invisibleHint',
        'accountForm.options.submit',
      ],
      t,
    ),
    'accountForm.options.postsPerPage.placeholder': t.t('accountForm.options.pageSizePlaceholder', {
      size: boardPostsPerPage,
    }),
    'accountForm.options.threadsPerPage.placeholder': t.t(
      'accountForm.options.pageSizePlaceholder',
      { size: boardThreadsPerPage },
    ),
  }
}

export function passwordFormCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'accountForm.password.title',
      'accountForm.password.current',
      'accountForm.password.new',
      'accountForm.password.confirm',
      'accountForm.password.note',
      'accountForm.password.submit',
    ],
    t,
  )
}

export function emailFormCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  const [currentLead, currentTail] = splitAround(t, 'accountForm.email.current', 'email')
  return {
    ...copyFor(
      [
        'accountForm.email.title',
        'accountForm.password.current',
        'accountForm.email.new',
        'accountForm.email.note',
        'accountForm.email.submit',
      ],
      t,
    ),
    'accountForm.email.currentLead': currentLead,
    'accountForm.email.currentTail': currentTail,
  }
}

function lockedReasonEntries(t: Translator): Readonly<Record<string, string>> {
  const [reasonLead, reasonTail] = splitAround(t, 'accountForm.locked.reason', 'reason')
  return {
    'accountForm.locked.reasonLead': reasonLead,
    'accountForm.locked.reasonTail': reasonTail,
  }
}

export function signatureFormCopy(
  maxLength: number,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'accountForm.signature.lockedTitle',
        'accountForm.signature.lockedBody',
        'accountForm.signature.label',
        'accountForm.signature.submit',
      ],
      t,
    ),
    ...lockedReasonEntries(t),
    'accountForm.signature.hint': t.t('accountForm.signature.hint', { max: maxLength }),
  }
}

export function avatarFormCopy(
  limits: { readonly maxMegabytes: number; readonly width: number; readonly height: number },
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'accountForm.avatar.lockedTitle',
        'accountForm.avatar.lockedBody',
        'accountForm.avatar.title',
        'accountForm.avatar.pending',
        'accountForm.avatar.failed',
        'accountForm.avatar.none',
        'accountForm.avatar.choose',
        'accountForm.avatar.upload',
        'accountForm.avatar.removeBlurb',
        'accountForm.avatar.remove',
      ],
      t,
    ),
    ...lockedReasonEntries(t),
    'accountForm.avatar.hint': t.t('accountForm.avatar.hint', {
      max: limits.maxMegabytes,
      width: limits.width,
      height: limits.height,
    }),
  }
}

export function twoFactorFormsCopy(
  recoveryCodesLeft: number,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  const [writtenDownLead, writtenDownTail] = splitAround(
    t,
    'accountForm.twoFactor.writtenDown',
    'link',
  )
  const [step1Lead, step1Tail] = splitAround(t, 'accountForm.twoFactor.step1', 'link')
  const [statusLead, statusTail] = splitAround(t, 'accountForm.twoFactor.status', 'codes')
  return {
    ...copyFor(
      [
        'accountForm.twoFactor.recoverySave',
        'accountForm.twoFactor.recoveryBlurb',
        'accountForm.twoFactor.enabledTitle',
        'accountForm.twoFactor.backToSecurity',
        'accountForm.twoFactor.setupTitle',
        'accountForm.twoFactor.step1Link',
        'accountForm.twoFactor.step2',
        'accountForm.twoFactor.step3',
        'accountForm.twoFactor.codeLabel',
        'accountForm.twoFactor.codeHint',
        'accountForm.twoFactor.turnOn',
        'accountForm.twoFactor.cancel',
        'accountForm.twoFactor.title',
        'accountForm.twoFactor.blurb',
        'accountForm.twoFactor.requiredBlurb',
        'accountForm.twoFactor.begin',
        'accountForm.twoFactor.passwordLabel',
        'accountForm.twoFactor.codeProofLabel',
        'accountForm.twoFactor.codeProofHint',
        'accountForm.twoFactor.exhausted',
        'accountForm.twoFactor.replaceTitle',
        'accountForm.twoFactor.replaceBlurb',
        'accountForm.twoFactor.replaceSubmit',
        'accountForm.twoFactor.requiredOff',
        'accountForm.twoFactor.offTitle',
        'accountForm.twoFactor.offSubmit',
      ],
      t,
    ),
    'accountForm.twoFactor.writtenDownLead': writtenDownLead,
    'accountForm.twoFactor.writtenDownTail': writtenDownTail,
    'accountForm.twoFactor.step1Lead': step1Lead,
    'accountForm.twoFactor.step1Tail': step1Tail,
    'accountForm.twoFactor.statusLead': statusLead,
    'accountForm.twoFactor.statusTail': statusTail,
    'accountForm.twoFactor.codes': t.t('accountForm.twoFactor.codes', {
      count: recoveryCodesLeft,
    }),
  }
}

export function signInMethodsCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(
    [
      'accountForm.linked.title',
      'accountForm.linked.blurb',
      'accountForm.linked.none',
      'accountForm.linked.unlink',
      'accountForm.passkeys.title',
      'accountForm.passkeys.blurb',
      'accountForm.passkeys.none',
      'accountForm.passkeys.remove',
    ],
    t,
  )
}

export function linkedUsageLabel(
  linkedAt: string,
  lastUsedAt: string | null,
  t: Translator = untranslated(),
): string {
  return lastUsedAt === null
    ? t.t('accountForm.linked.linkedNever', { at: linkedAt })
    : t.t('accountForm.linked.linkedUsed', { at: linkedAt, used: lastUsedAt })
}

export function passkeyUsageLabel(
  createdAt: string,
  lastUsedAt: string | null,
  t: Translator = untranslated(),
): string {
  return lastUsedAt === null
    ? t.t('accountForm.passkeys.addedNever', { at: createdAt })
    : t.t('accountForm.passkeys.addedUsed', { at: createdAt, used: lastUsedAt })
}

export function activeSessionsCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(
    [
      'accountForm.sessions.title',
      'accountForm.sessions.blurb',
      'accountForm.sessions.thisDevice',
      'accountForm.sessions.signOut',
      'accountForm.sessions.signOutElsewhere',
    ],
    t,
  )
}

export function sessionDetailLabel(
  address: string,
  startedAt: string,
  lastSeen: string,
  t: Translator = untranslated(),
): string {
  return t.t('accountForm.sessions.detail', { address, started: startedAt, seen: lastSeen })
}

export function securityActivityCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(
    ['accountForm.activity.title', 'accountForm.activity.blurb', 'accountForm.activity.none'],
    t,
  )
}

export function activityDetailLabel(
  at: string,
  device: string,
  address: string,
  t: Translator = untranslated(),
): string {
  return t.t('accountForm.activity.detail', { at, device, address })
}

export function notificationFormsCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(
    [
      'accountForm.notifications.markRead',
      'accountForm.notifications.markAllRead',
      'accountForm.notifications.legend',
      'accountForm.notifications.channels',
      'accountForm.notifications.email',
      'accountForm.notifications.push',
      'accountForm.notifications.blurb',
      'accountForm.notifications.submit',
      'accountForm.push.heading',
      'accountForm.push.subscribe',
      'accountForm.push.unsubscribe',
      'accountForm.push.subscribed',
      'accountForm.push.unsubscribed',
      'accountForm.push.unsupported',
      'accountForm.push.blocked',
      'accountForm.push.failed',
      'accountForm.push.blurb',
      'form.working',
    ],
    t,
  )
}

export function followFormCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'accountForm.follow.notifyMe',
      'accountForm.follow.frequency',
      'accountForm.follow.follow',
      'accountForm.follow.save',
      'accountForm.follow.stop',
      'accountForm.follow.unsubscribe',
    ],
    t,
  )
}

export function rateMemberFormCopy(
  username: string,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'accountForm.rate.why',
        'accountForm.rate.whyOptional',
        'accountForm.rate.whyHint',
        'accountForm.rate.positive',
        'accountForm.rate.thanks',
        'accountForm.rate.neutral',
        'accountForm.rate.justComment',
        'accountForm.rate.negative',
        'accountForm.rate.withdraw',
      ],
      t,
    ),
    'accountForm.rate.title': t.t('accountForm.rate.title', { username }),
    'accountForm.rate.changeTitle': t.t('accountForm.rate.changeTitle', { username }),
  }
}
