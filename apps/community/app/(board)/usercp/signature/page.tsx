import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { signatureLimit } from '@meith/signatures'

import { SignatureForm } from '@/components/account/usercp-forms'
import { BoardNotice } from '@/components/shell/board-notice'
import { PanelPage } from '@/components/shell/panel-page'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { renderSignature, signatureStore, viewerSignatureLimits } from '@/server/signatures'
import { signatureFormCopy } from '@/view/account-copy'
import { userCpNotice } from '@/view/usercp'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.signature') }
}

export default async function SignaturePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const store = signatureStore()

  if (actor.userId === null || store === null) notFound()

  const limits = await viewerSignatureLimits()
  if (!limits.canUse) notFound()

  const stored = await store.read(actor.userId)
  if (stored === null) notFound()

  const notice = userCpNotice(query, await getTranslator())
  const preview = await renderSignature(actor.userId, stored)

  return (
    <PanelPage
      title={await tr('page.signature')}
      lede={await tr('page.shown-under-every-post-have')}
    >
      {notice !== null && (
        <BoardNotice kind={notice.kind} message={notice.message} dismissHref="/usercp/signature" />
      )}

      <SignatureForm
        signature={stored.signature}
        maxLength={signatureLimit(limits)}
        locked={stored.locked}
        lockedReason={stored.lockedReason}
        copy={signatureFormCopy(signatureLimit(limits), await getTranslator())}
      />

      {preview !== null && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{await tr('page.how-it-looks')}</h2>
          <div
            className="rounded-lg border border-border bg-card p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </section>
      )}
    </PanelPage>
  )
}
