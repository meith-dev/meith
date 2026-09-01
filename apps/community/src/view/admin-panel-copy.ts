import type { Translator } from '@meith/i18n'

import { adminSharedCopy } from './admin-copy'
import { otpFieldCopy } from './auth-copy'
import { copyFor, patternCopy, splitAround } from './copy'
import { untranslated } from './time'

export function adminFormsCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'adminPanel.title',
        'adminPanel.reason.reauth',
        'adminPanel.reason.expired',
        'adminPanel.reason.default',
        'adminPanel.password',
        'adminPanel.twoFactorCode',
        'adminPanel.twoFactorCodeHint',
        'adminPanel.enter',
        'adminPanel.leave',
      ],
      t,
    ),
    ...patternCopy(['adminPanel.idleNote'], t),
    ...otpFieldCopy(t),
  }
}

export function apiTokenFormsCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(
    [
      'adminPanel.token.copyNow',
      'adminPanel.token.name',
      'adminPanel.token.namePlaceholder',
      'adminPanel.token.nameHint',
      'adminPanel.token.scopes',
      'adminPanel.token.scopesHint',
      'adminPanel.token.expiresInDays',
      'adminPanel.token.expiresPlaceholder',
      'adminPanel.token.expiresHint',
      'adminPanel.token.issue',
      'adminPanel.token.revoke',
    ],
    t,
  )
}

export function webhookFormsCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'adminPanel.webhook.copyNow',
      'adminPanel.webhook.url',
      'adminPanel.webhook.urlPlaceholder',
      'adminPanel.webhook.urlHint',
      'adminPanel.webhook.topics',
      'adminPanel.webhook.topicsHint',
      'adminPanel.webhook.format',
      'adminPanel.webhook.formatHint',
      'adminPanel.webhook.format.json',
      'adminPanel.webhook.format.discord',
      'adminPanel.webhook.active',
      'adminPanel.webhook.create',
      'adminPanel.webhook.enable',
      'adminPanel.webhook.disable',
      'adminPanel.webhook.delete',
    ],
    t,
  )
}

export function systemFormsCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'adminPanel.system.pruneTokens',
        'adminPanel.system.recountRun',
        'adminPanel.system.clearNote',
        'adminPanel.system.clearForumTree',
        'adminPanel.system.retried',
        'adminPanel.system.jobId',
        'adminPanel.system.jobIdHint',
        'adminPanel.system.retry',
        'adminPanel.system.nothingToIndex',
        'adminPanel.system.applyMigrations',
        'adminPanel.system.upgradeApplied',
      ],
      t,
    ),
    ...patternCopy(
      [
        'adminPanel.system.sessionsRemoved',
        'adminPanel.system.tokensRemoved',
        'adminPanel.system.pruneSessions',
        'adminPanel.system.recountResult',
        'adminPanel.system.cleared',
        'adminPanel.system.indexFinished',
        'adminPanel.system.indexMore',
        'adminPanel.system.indexNext',
      ],
      t,
    ),
  }
}

export function pluginFormsCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  const [envInertLead, envInertTail] = splitAround(t, 'adminPanel.plugin.envInert', 'name')
  const [envOverridesLead, envOverridesTail] = splitAround(
    t,
    'adminPanel.plugin.envOverrides',
    'name',
  )
  return {
    ...copyFor(
      [
        'adminPanel.plugin.enable',
        'adminPanel.plugin.disable',
        'adminPanel.plugin.saved',
        'adminPanel.plugin.secretFromEnvPlaceholder',
        'adminPanel.plugin.secretSetPlaceholder',
        'adminPanel.plugin.secretNotSetPlaceholder',
        'adminPanel.plugin.on',
        'adminPanel.plugin.off',
        'adminPanel.plugin.empty',
        'adminPanel.plugin.advanced',
        'adminPanel.plugin.save',
        'adminPanel.plugin.clearFailures',
      ],
      t,
    ),
    ...patternCopy(['adminPanel.plugin.shipsAs'], t),
    'adminPanel.plugin.envInertLead': envInertLead,
    'adminPanel.plugin.envInertTail': envInertTail,
    'adminPanel.plugin.envOverridesLead': envOverridesLead,
    'adminPanel.plugin.envOverridesTail': envOverridesTail,
  }
}

export function settingsFormCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return copyFor(
    [
      'adminPanel.setting.unchangedPlaceholder',
      'adminPanel.setting.clearStored',
      'adminPanel.setting.noMatches',
      'adminPanel.setting.saved',
      'adminPanel.setting.unchanged',
      'adminPanel.setting.advanced',
      'adminPanel.setting.changed',
      'adminPanel.setting.save',
    ],
    t,
  )
}

export function mailTestCardCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  const [driverOverridesLead, driverOverridesTail] = splitAround(
    t,
    'adminPanel.mail.driverOverrides',
    'name',
  )
  const [driverUntilUnsetLead, driverUntilUnsetTail] = splitAround(
    t,
    'adminPanel.mail.driverUntilUnset',
    'name',
  )
  const [testNoteLead, testNoteTail] = splitAround(t, 'adminPanel.mail.testNote', 'saved')
  return {
    ...copyFor(
      [
        'adminPanel.mail.title',
        'adminPanel.mail.reachesNobody',
        'adminPanel.mail.sending',
        'adminPanel.mail.send',
        'adminPanel.mail.testNoteSaved',
      ],
      t,
    ),
    'adminPanel.mail.driverOverridesLead': driverOverridesLead,
    'adminPanel.mail.driverOverridesTail': driverOverridesTail,
    'adminPanel.mail.driverUntilUnsetLead': driverUntilUnsetLead,
    'adminPanel.mail.driverUntilUnsetTail': driverUntilUnsetTail,
    'adminPanel.mail.testNoteLead': testNoteLead,
    'adminPanel.mail.testNoteTail': testNoteTail,
  }
}

export function brandingFormsCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return {
    ...adminSharedCopy(t),
    ...copyFor(
      [
        'adminPanel.branding.saved',
        'adminPanel.branding.removed',
        'adminPanel.branding.nothing',
        'adminPanel.branding.upload',
      ],
      t,
    ),
    ...patternCopy(['adminPanel.branding.formats'], t),
  }
}

export function faviconFormsCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return {
    ...adminSharedCopy(t),
    ...copyFor(
      [
        'adminPanel.favicon.saved',
        'adminPanel.favicon.removed',
        'adminPanel.favicon.nothing',
        'adminPanel.branding.upload',
      ],
      t,
    ),
    ...patternCopy(['adminPanel.favicon.formats'], t),
  }
}

export function badgeFormsCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return {
    ...adminSharedCopy(t),
    ...copyFor(
      ['adminPanel.badge.removed', 'adminPanel.badge.noBadge', 'adminPanel.badge.upload'],
      t,
    ),
    ...patternCopy(['adminPanel.badge.labelSr', 'adminPanel.badge.formats'], t),
  }
}

export function marketplaceFormsCopy(
  t: Translator = untranslated(),
): Readonly<Record<string, string>> {
  return copyFor(['adminPanel.marketplace.refresh', 'adminPanel.marketplace.refreshed'], t)
}
