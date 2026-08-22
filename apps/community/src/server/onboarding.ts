import 'server-only'

import { cookies } from 'next/headers'

import type { Actor } from '@meith/authorization'

import {
  hasCompleteProfile,
  isNewMember,
  type OnboardingPanel,
  onboardingCookieName,
} from '@/view/onboarding'

import { avatarsFor } from './avatars'
import { getContainer } from './container'
import { getTranslator } from './i18n'
import { legalDocument } from './legal'

export interface OnboardingNoticeModel {
  readonly panel: OnboardingPanel
  readonly message: string
  readonly ctaHref: string | null
  readonly ctaLabel: string | null
  readonly dismissLabel: string
}

async function dismissed(panel: OnboardingPanel): Promise<boolean> {
  return (await cookies()).get(onboardingCookieName(panel))?.value === '1'
}

/**
 * At most one of the welcome banner or the profile-completion nudge, never
 * both — stacking unrelated notices in the same board-wide slot is the
 * "heavy multi-step tour" the feature is meant to avoid.
 */
export async function onboardingBanner(actor: Actor): Promise<OnboardingNoticeModel | null> {
  if (actor.userId === null) return null

  const profile = await getContainer()
    .memberProfiles.findPublicById(actor.userId)
    .catch(() => null)
  if (profile === null || !isNewMember(profile.postCount)) return null

  const t = await getTranslator()
  const dismissLabel = t.t('onboarding.dismiss')

  if (!(await dismissed('welcome'))) {
    return {
      panel: 'welcome',
      message: t.t('onboarding.welcome.message'),
      ctaHref: null,
      ctaLabel: null,
      dismissLabel,
    }
  }

  const avatarUrl = (await avatarsFor([actor.userId])).get(actor.userId) ?? null
  if (!hasCompleteProfile({ avatarUrl, bio: profile.bio }) && !(await dismissed('profile'))) {
    return {
      panel: 'profile',
      message: t.t('onboarding.profile.message'),
      ctaHref: '/usercp/profile',
      ctaLabel: t.t('onboarding.profile.cta'),
      dismissLabel,
    }
  }

  return null
}

export async function firstPostGuidance(actor: Actor): Promise<OnboardingNoticeModel | null> {
  if (actor.userId === null || (await dismissed('first-post'))) return null

  const profile = await getContainer()
    .memberProfiles.findPublicById(actor.userId)
    .catch(() => null)
  if (profile === null || !isNewMember(profile.postCount)) return null

  const rules = await legalDocument('rules')
  const t = await getTranslator()

  return {
    panel: 'first-post',
    message: t.t('onboarding.firstPost.message'),
    ctaHref: rules?.href ?? null,
    ctaLabel: rules === null ? null : t.t('onboarding.firstPost.cta'),
    dismissLabel: t.t('onboarding.dismiss'),
  }
}
