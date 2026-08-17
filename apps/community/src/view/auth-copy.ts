import type { Translator } from '@meith/i18n'

import { copyFor, splitAround } from './copy'
import { untranslated } from './time'

export function loginFormCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'authForm.login.identifier',
      'authForm.login.password',
      'authForm.login.remember',
      'authForm.login.submit',
    ],
    t,
  )
}

export interface RegistrationLimits {
  readonly minPasswordLength: number
  readonly usernameMin: number
  readonly usernameMax: number
}

export function registerFormCopy(
  limits: RegistrationLimits,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  const [termsLead, termsTail] = splitAround(t, 'authForm.register.terms', 'policy')
  return {
    ...copyFor(
      [
        'authForm.register.username',
        'authForm.email',
        'authForm.register.password',
        'authForm.register.honeypot',
        'authForm.register.challengeHint',
        'authForm.register.submit',
      ],
      t,
    ),
    'authForm.register.usernameHint': t.t('authForm.register.usernameHint', {
      min: limits.usernameMin,
      max: limits.usernameMax,
    }),
    'authForm.passwordHint': t.t('authForm.passwordHint', { min: limits.minPasswordLength }),
    'authForm.register.termsLead': termsLead,
    'authForm.register.termsTail': termsTail,
  }
}

export function resetRequestFormCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(['authForm.reset.continue', 'authForm.email', 'authForm.reset.submit'], t)
}

export function resetConfirmFormCopy(
  minLength: number,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'authForm.resetConfirm.password',
        'authForm.resetConfirm.confirm',
        'authForm.resetConfirm.submit',
      ],
      t,
    ),
    'authForm.passwordHint': t.t('authForm.passwordHint', { min: minLength }),
  }
}

export function resendVerificationFormCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(['authForm.email', 'authForm.resend.submit'], t)
}

export function secondFactorFormCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(
    [
      'authForm.secondFactor.code',
      'authForm.secondFactor.recoveryHint',
      'authForm.secondFactor.recoveryHintExhausted',
      'authForm.secondFactor.submit',
      'authForm.secondFactor.cancel',
    ],
    t,
  )
}

export function passkeyCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'authForm.or',
      'authForm.passkey.waiting',
      'authForm.passkey.signIn',
      'authForm.passkey.confirm',
      'authForm.passkey.cancelled',
      'authForm.passkey.failed',
      'authForm.passkey.noneCreated',
      'authForm.passkey.noneOffered',
    ],
    t,
  )
}

export function passkeyEnrolCopy(
  limit: number,
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...passkeyCopy(t),
    ...copyFor(
      [
        'accountForm.passkey.unsupported',
        'accountForm.passkey.label',
        'accountForm.passkey.placeholder',
        'accountForm.passkey.submit',
      ],
      t,
    ),
    'accountForm.passkey.hint': t.t('accountForm.passkey.hint', { limit }),
  }
}

export interface SsoButtonModel {
  readonly id: string
  readonly cta: string
}

export function ssoButtonModels(
  providers: ReadonlyArray<{ readonly id: string; readonly label: string }>,
  t: Translator = untranslated(),
): readonly SsoButtonModel[] {
  return providers.map((provider) => ({
    id: provider.id,
    cta: t.t('authForm.sso.continue', { provider: provider.label }),
  }))
}

export function ssoButtonsCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(['authForm.sso.lede', 'authForm.or'], t)
}
