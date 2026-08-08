import Link from 'next/link'
import type { Metadata } from 'next'

import { ResendVerificationForm } from '@/components/auth/resend-verification-form'

export const metadata: Metadata = { title: 'Confirm your account' }

/**
 * F18 — where an unconfirmed account lands, and how it gets unstuck.
 *
 * Registration redirects here whenever the board asked for the address to be
 * proven, **including when the send failed**. That is deliberate: the account
 * exists either way, the person cannot sign in either way, and the only useful
 * screen is the one that can send another link. Making the two cases look
 * different would also tell whoever registered whether the board's mail is
 * working, which is not their business and is a useful thing for somebody
 * probing it to learn.
 *
 * The address is named because it is the commonest failure on this screen: a
 * typo in the address means the link went somewhere real and unreachable, and
 * seeing it written back is what makes that obvious.
 */
export default async function ResendVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; sent?: string }>
}) {
  const params = await searchParams
  const email = params.email ?? ''

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Confirm your account
        </h1>
        {params.sent === '1' ? (
          <p className="text-sm text-muted-foreground">
            {email === '' ? (
              <>We have sent a confirmation link. Follow it to finish setting up your account.</>
            ) : (
              <>
                We have sent a confirmation link to{' '}
                <strong className="font-medium text-foreground">{email}</strong>. Follow it
                to finish setting up your account — until then you will not be able to sign
                in.
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Enter the address you registered with and we will send the confirmation link
            again.
          </p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Nothing arrived? Check the spam folder first, then send another link. Each new link
        replaces the last one.
      </p>

      <ResendVerificationForm email={email === '' ? undefined : email} />

      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
