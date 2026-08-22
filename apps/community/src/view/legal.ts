import type { Translator } from '@meith/i18n'
import type { LinkModel } from '@meith/theme-kit'

import { untranslated } from './time'

export type LegalSlug = 'terms' | 'privacy' | 'rules'

export interface LegalPage {
  readonly slug: LegalSlug
  readonly settingKey: 'legal.terms' | 'legal.privacy' | 'legal.rules'
  readonly titleKey: string
  readonly href: string
  readonly footerLabelKey: string
}

export const LEGAL_PAGES: readonly LegalPage[] = [
  {
    slug: 'terms',
    settingKey: 'legal.terms',
    titleKey: 'legal.page.terms.title',
    href: '/terms',
    footerLabelKey: 'legal.page.terms.footer',
  },
  {
    slug: 'privacy',
    settingKey: 'legal.privacy',
    titleKey: 'legal.page.privacy.title',
    href: '/privacy',
    footerLabelKey: 'legal.page.privacy.footer',
  },
  {
    slug: 'rules',
    settingKey: 'legal.rules',
    titleKey: 'legal.page.rules.title',
    href: '/rules',
    footerLabelKey: 'legal.page.rules.footer',
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
  t: Translator = untranslated(),
): readonly LinkModel[] {
  return LEGAL_PAGES.filter((page) => isPublished(bodyOf(page))).map((page) => ({
    label: t.t(page.footerLabelKey),
    href: page.href,
  }))
}
