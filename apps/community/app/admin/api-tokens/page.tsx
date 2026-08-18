import type { Metadata } from 'next'

import { IssueTokenForm, RevokeTokenForm } from '@/components/admin/api-token-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { buildApiTokenView } from '@/server/api-tokens-admin'
import { getTranslator, tr } from '@/server/i18n'
import { apiTokenFormsCopy } from '@/view/admin-panel-copy'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.api-tokens') }
}

export default async function AdminApiTokensPage() {
  if ((await adminPageContext()) === null) return null

  const now = new Date()
  const translator = await getTranslator()
  const copy = apiTokenFormsCopy(translator)
  const view = await buildApiTokenView(now)
  const stateLabels = {
    expired: translator.t('adminApiTokens.state.expired'),
    live: translator.t('adminApiTokens.state.live'),
    revoked: translator.t('adminApiTokens.state.revoked'),
  }

  if (view === null) {
    return (
      <PanelPage title={await tr('page.api-tokens')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {await tr('page.this-board-running-in-memory-sample-b')}
        </p>
      </PanelPage>
    )
  }

  return (
    <PanelPage
      title={await tr('page.api-tokens')}
      lede={
        <>
          {translator.t('adminApiTokens.ledeBefore')}{' '}
          <code className="font-mono text-xs">/api/v1</code>
          {translator.t('adminApiTokens.ledeAfter')}
        </>
      }
      gap="loose"
    >
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">{await tr('page.issue-token')}</h2>
        <IssueTokenForm scopes={view.scopes} copy={copy} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">{await tr('page.existing-tokens')}</h2>

        {view.tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {await tr('page.no-tokens-have-been-issued')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {translator.t('adminApiTokens.name')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {translator.t('adminApiTokens.owner')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {translator.t('adminApiTokens.prefix')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {translator.t('adminApiTokens.scopes')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {await tr('page.last-used')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {translator.t('adminApiTokens.state')}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">{translator.t('adminApiTokens.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.tokens.map((token) => (
                  <tr key={token.id} className="border-b border-border align-top">
                    <td className="py-2 pr-3">{token.name}</td>
                    <td className="py-2 pr-3">{token.username}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{token.lookup}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{token.scopes.join(' ')}</td>
                    <td className="py-2 pr-3">
                      {token.lastUsedAt === null
                        ? translator.t('adminApiTokens.never')
                        : formatTime(token.lastUsedAt, now, translator).label}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          token.state === 'live'
                            ? 'text-moderation-approved'
                            : token.state === 'expired'
                              ? 'text-thread-unapproved'
                              : 'text-muted-foreground'
                        }
                      >
                        {stateLabels[token.state]}
                      </span>
                    </td>
                    <td className="py-2">
                      {token.state === 'revoked' ? null : (
                        <RevokeTokenForm tokenId={token.id} copy={copy} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PanelPage>
  )
}
