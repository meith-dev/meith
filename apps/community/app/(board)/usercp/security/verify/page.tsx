import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CredentialProofForm } from '@/components/account/credential-proof-form'
import { PasskeyProofButton } from '@/components/account/passkey-proof-button'
import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { signInProviders } from '@/server/federation'
import { getTranslator } from '@/server/i18n'
import { isSafeLocalPath } from '@/server/safe-path'
import { twoFactorState } from '@/server/two-factor'
import { passkeyEnrolCopy } from '@/view/auth-copy'

export const metadata: Metadata = { title: 'Verify your identity' }

export default async function VerifySecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const actor = await getActor()
  if (actor.userId === null) notFound()

  const query = await searchParams
  const next =
    query.next !== undefined && isSafeLocalPath(query.next) ? query.next : '/usercp/security'
  const { accountStore } = getContainer()
  const [account, factor, identities, providers, passkeys] = await Promise.all([
    accountStore.accounts.findById(actor.userId),
    twoFactorState(actor.userId),
    accountStore.identities.listForUser(actor.userId),
    signInProviders(),
    accountStore.passkeys.listForUser(actor.userId),
  ])

  return (
    <PanelPage
      title="Verify your identity"
      lede="Before adding a permanent sign-in method, prove one credential you already control. Verification lasts for 10 minutes in this session."
    >
      <CredentialProofForm
        hasPassword={account?.passwordHash !== null && account !== null}
        hasSecondFactor={factor.enrolled}
        next={next}
      />

      {passkeys.length > 0 ? (
        <PasskeyProofButton next={next} copy={passkeyEnrolCopy(1, await getTranslator())} />
      ) : null}

      {identities.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-tight">Linked sign-in</h2>
          <div className="flex flex-wrap gap-2">
            {identities.map((identity) => {
              const provider = providers.find((candidate) => candidate.id === identity.provider)
              if (provider === undefined) return null
              return (
                <form key={identity.id} method="post" action={`/auth/sso/${identity.provider}`}>
                  <input type="hidden" name="mode" value="credential-proof" />
                  <input type="hidden" name="next" value={next} />
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
                  >
                    Verify with {provider.label}
                  </button>
                </form>
              )
            })}
          </div>
        </section>
      ) : null}
    </PanelPage>
  )
}
