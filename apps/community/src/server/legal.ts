import 'server-only'

import { renderMarkdown } from '@meith/markdown'
import type { LinkModel } from '@meith/theme-kit'

import { buildLegalLinks, isPublished, type LegalPage, legalPage, TERMS_PAGE } from '../view/legal'
import { getTranslator } from './i18n'
import { getSettings } from './settings'

export interface LegalDocument {
  readonly title: string
  readonly href: string
  readonly bodyHtml: string
}

async function bodyOf(page: LegalPage): Promise<string> {
  return (await getSettings()).get(page.settingKey)
}

export async function legalDocument(slug: string): Promise<LegalDocument | null> {
  const page = legalPage(slug)
  if (page === null) return null

  const body = await bodyOf(page)
  if (!isPublished(body)) return null

  return {
    title: (await getTranslator()).t(page.titleKey),
    href: page.href,
    bodyHtml: renderMarkdown(body, { headingOffset: 0 }).html,
  }
}

export async function legalFooterLinks(): Promise<readonly LinkModel[]> {
  const settings = await getSettings()
  return buildLegalLinks((page) => settings.get(page.settingKey), await getTranslator())
}

export async function termsAcceptance(): Promise<LinkModel | null> {
  return isPublished(await bodyOf(TERMS_PAGE))
    ? { label: (await getTranslator()).t(TERMS_PAGE.titleKey), href: TERMS_PAGE.href }
    : null
}
