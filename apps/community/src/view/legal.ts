import type { LinkModel } from '@meith/theme-kit'

export type LegalSlug = 'terms' | 'privacy'

export interface LegalPage {
  readonly slug: LegalSlug
  readonly settingKey: 'legal.terms' | 'legal.privacy'
  readonly title: string
  readonly href: string
  readonly footerLabel: string
}

export const LEGAL_PAGES: readonly LegalPage[] = [
  {
    slug: 'terms',
    settingKey: 'legal.terms',
    title: 'Terms of service',
    href: '/terms',
    footerLabel: 'Terms',
  },
  {
    slug: 'privacy',
    settingKey: 'legal.privacy',
    title: 'Privacy policy',
    href: '/privacy',
    footerLabel: 'Privacy',
  },
]

export const TERMS_PAGE: LegalPage = LEGAL_PAGES[0]!

export function legalPage(slug: string): LegalPage | null {
  return LEGAL_PAGES.find((page) => page.slug === slug) ?? null
}

export function isPublished(body: string): boolean {
  return body.trim() !== ''
}

export function buildLegalLinks(
  bodyOf: (page: LegalPage) => string,
): readonly LinkModel[] {
  return LEGAL_PAGES.filter((page) => isPublished(bodyOf(page))).map((page) => ({
    label: page.footerLabel,
    href: page.href,
  }))
}
