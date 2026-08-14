import type { Metadata } from 'next'

import { LegalDocument } from '@/components/legal/legal-document'

export const metadata: Metadata = { title: 'Terms of service' }

export default async function TermsPage() {
  return <LegalDocument slug="terms" />
}
