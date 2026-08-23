export type OnboardingPanel = 'welcome' | 'profile' | 'first-post'

const ONBOARDING_COOKIE_PREFIX = 'meith_onboarding_'

export const ONBOARDING_PANELS: readonly OnboardingPanel[] = ['welcome', 'profile', 'first-post']

export const ONBOARDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function onboardingCookieName(panel: OnboardingPanel): string {
  return `${ONBOARDING_COOKIE_PREFIX}${panel.replace('-', '_')}`
}

export function isOnboardingPanel(value: unknown): value is OnboardingPanel {
  return (ONBOARDING_PANELS as readonly unknown[]).includes(value)
}

export function isNewMember(postCount: number): boolean {
  return postCount === 0
}

export function hasCompleteProfile(profile: {
  avatarUrl: string | null
  bio: string | null
}): boolean {
  return profile.avatarUrl !== null && profile.bio !== null && profile.bio.trim() !== ''
}
