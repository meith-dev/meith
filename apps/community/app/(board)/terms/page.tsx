import type { Metadata } from 'next'

import { LegalDocument } from '@/components/legal/legal-document'
import { tr } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.terms-service') }
}

export default async function TermsPage() {
  return <LegalDocument slug="terms" />
}
