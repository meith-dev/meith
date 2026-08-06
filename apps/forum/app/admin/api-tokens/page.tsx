import type { Metadata } from 'next'

import { PanelPage } from '@/components/shell/panel-page'
import { IssueTokenForm, RevokeTokenForm } from '@/components/admin/api-token-forms'
import { requireAdmin } from '@/server/admin'
import { buildApiTokenView } from '@/server/api-tokens-admin'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'API tokens' }

/**
 * F81 — the token screen.
 *
 * The gap this closes is small and embarrassing: the board shipped a documented
 * REST API whose tokens could only be created by hand-writing SQL, so the
 * published quick-start began with a database prompt.
 *
 * **Revoked tokens stay on the list.** A revoked row still carries its name and
 * its last-used time, and those are the first two questions asked after a token
 * leaks — deleting the row would answer neither. It is also why revoking is a
 * status change rather than a delete.
 */
export default async function AdminApiTokensPage() {
  await requireAdmin()

  const now = new Date()
  const view = await buildApiTokenView(now)

  if (view === null) {
    return (
      <PanelPage title="API tokens">
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so it has no API.
        </p>
      </PanelPage>
    )
  }

  return (
    <PanelPage
      title="API tokens"
      lede={
        <>
          Bearer tokens for <code className="font-mono text-xs">/api/v1</code>. Every
          request is still checked against its owner’s permissions — a scope narrows a
          token, it never widens the account.
        </>
      }
      gap="loose"
    >
      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold">Issue a token</h2>
        <IssueTokenForm scopes={view.scopes} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold">Existing tokens</h2>

        {view.tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens have been issued.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Name
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Owner
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Prefix
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Scopes
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Last used
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    State
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.tokens.map((token) => (
                  <tr key={token.id} className="border-b border-border align-top">
                    <td className="py-2 pr-3">{token.name}</td>
                    <td className="py-2 pr-3">{token.username}</td>
                    {/* The clear half only. It is how somebody matches a token
                        they hold against this list; the secret half is a hash. */}
                    <td className="py-2 pr-3 font-mono text-xs">{token.lookup}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {token.scopes.join(' ')}
                    </td>
                    <td className="py-2 pr-3">
                      {token.lastUsedAt === null
                        ? 'never'
                        : formatTime(token.lastUsedAt, now).label}
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
                        {token.state}
                      </span>
                    </td>
                    <td className="py-2">
                      {token.state === 'revoked' ? null : (
                        <RevokeTokenForm tokenId={token.id} />
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
