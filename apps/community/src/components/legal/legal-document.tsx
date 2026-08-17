import { notFound } from 'next/navigation'

import { Card, CardContent } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { legalDocument } from '@/server/legal'
import type { LegalSlug } from '@/view/legal'

export async function LegalDocument({ slug }: { slug: LegalSlug }) {
  const document = await legalDocument(slug)
  if (document === null) notFound()

  return (
    <PanelPage frame="standalone" title={document.title}>
      <Card>
        <CardContent className="p-4">
          <div className="prose-md" dangerouslySetInnerHTML={{ __html: document.bodyHtml }} />
        </CardContent>
      </Card>
    </PanelPage>
  )
}
