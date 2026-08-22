import type { Metadata } from 'next'

import { LegalDocument } from '@/components/legal/legal-document'
import { tr } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.rules-faq') }
}

export default async function RulesPage() {
  return <LegalDocument slug="rules" />
}
