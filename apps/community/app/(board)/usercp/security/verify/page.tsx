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

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getTranslator()
  return { title: tr.t('credentialProof.title') }
}

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
  const tr = await getTranslator()
  const { accountStore } = getContainer()
  const [account, factor, identities, providers, passkeys] = await Promise.all([
    accountStore.accounts.findById(actor.userId),
    twoFactorState(actor.userId),
    accountStore.identities.listForUser(actor.userId),
    signInProviders(),
    accountStore.passkeys.listForUser(actor.userId),
  ])

  return (
    <PanelPage title={tr.t('credentialProof.title')} lede={tr.t('credentialProof.lede')}>
      <CredentialProofForm
        copy={{
          codeConsumed: tr.t('credentialProof.codeConsumed'),
          codeLabel: tr.t('credentialProof.codeLabel'),
          codeSubmit: tr.t('credentialProof.codeSubmit'),
          passwordLabel: tr.t('credentialProof.passwordLabel'),
          passwordSubmit: tr.t('credentialProof.passwordSubmit'),
          recoveryLabel: tr.t('otp.recoveryLabel'),
          useRecovery: tr.t('otp.useRecovery'),
          useApp: tr.t('otp.useApp'),
        }}
        hasPassword={account?.passwordHash !== null && account !== null}
        hasSecondFactor={factor.enrolled}
        next={next}
      />

      {passkeys.length > 0 ? (
        <PasskeyProofButton
          next={next}
          copy={passkeyEnrolCopy(1, tr)}
          waitingLabel={tr.t('credentialProof.passkeyWaiting')}
          verifyLabel={tr.t('credentialProof.passkeySubmit')}
        />
      ) : null}

      {identities.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-tight">
            {tr.t('credentialProof.linkedTitle')}
          </h2>
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
                    {tr.t('credentialProof.ssoSubmit', { provider: provider.label })}
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
