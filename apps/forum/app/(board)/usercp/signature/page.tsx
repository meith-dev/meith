import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { signatureHtml, signatureLimit } from '@meith/signatures'
import { requireSlot } from '@meith/theme-kit'

import { SignatureForm } from '@/components/account/usercp-forms'
import { getActor } from '@/server/context'
import { signatureStore, viewerSignatureLimits } from '@/server/signatures'
import { activeTheme } from '@/server/theme'
import { userCpNotice } from '@/view/usercp'

export const metadata: Metadata = { title: 'Your signature' }

/**
 * F58 — the signature screen.
 *
 * Absent entirely for a group without `canUseSignature`, rather than shown and
 * then refused: a form whose Save button always fails is worse than no form.
 *
 * The preview is rendered by the same function the postbit uses, so what a
 * member sees here is what everybody else sees — including the tags that came
 * out as literal text because signatures use a narrower registry.
 */
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

  const Notice = requireSlot(activeTheme, 'Notice')
  const notice = userCpNotice(query)
  const preview = signatureHtml(stored)

  return (
    <div className="flex flex-col gap-6">
      {notice !== null && (
        <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/signature" />
      )}

      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Your signature</h1>
        <p className="text-sm text-muted-foreground">
          Shown under every post you have made, past and future.
        </p>
      </div>

      <SignatureForm
        signature={stored.signature}
        maxLength={signatureLimit(limits)}
        locked={stored.locked}
        lockedReason={stored.lockedReason}
      />

      {preview !== null && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">How it looks</h2>
          {/*
            Trusted HTML from `@meith/bbcode`, exactly as a post body is — and
            produced by the same call the postbit makes, so this preview cannot
            disagree with what other people see.
          */}
          <div
            className="rounded-lg border border-border bg-card p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </section>
      )}
    </div>
  )
}
