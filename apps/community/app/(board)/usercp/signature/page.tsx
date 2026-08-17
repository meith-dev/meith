import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { signatureHtml, signatureLimit } from '@meith/signatures'
import { requireSlot } from '@meith/theme-kit'

import { SignatureForm } from '@/components/account/usercp-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { getActor } from '@/server/context'
import { signatureStore, viewerSignatureLimits } from '@/server/signatures'
import { currentTheme } from '@/server/theme'
import { userCpNotice } from '@/view/usercp'

export const metadata: Metadata = { title: 'Your signature' }

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

  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = userCpNotice(query)
  const preview = signatureHtml(stored)

  return (
    <PanelPage title="Your signature" lede="Shown under every post you have made, past and future.">
      {notice !== null && (
        <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/signature" />
      )}

      <SignatureForm
        signature={stored.signature}
        maxLength={signatureLimit(limits)}
        locked={stored.locked}
        lockedReason={stored.lockedReason}
      />

      {preview !== null && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">How it looks</h2>
          <div
            className="rounded-lg border border-border bg-card p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </section>
      )}
    </PanelPage>
  )
}
