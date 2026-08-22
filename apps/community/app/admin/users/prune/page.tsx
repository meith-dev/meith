import type { Metadata } from 'next'

import { PruneForm, SelectedPruneForm } from '@/components/admin/user-forms'
import { PANEL_CARD, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { readAdminUndo } from '@/server/admin-undo'
import { getTranslator, tr } from '@/server/i18n'
import { parsePruneCriteria, userBulkRepository } from '@/server/user-admin'
import { userPruneCopy } from '@/view/admin-user-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.prune-members') }
}

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export default async function AdminPrunePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await adminPageContext()
  if (context === null) return null

  const repository = userBulkRepository()
  if (repository === null) {
    return (
      <PanelPage title={await tr('page.prune-members')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {await tr('page.this-board-running-in-memory-sample-2')}
        </p>
      </PanelPage>
    )
  }

  const params = await searchParams
  const selection = Array.isArray(params.selection) ? params.selection[0] : params.selection
  const selectedOperation =
    selection === undefined
      ? null
      : await readAdminUndo({ token: selection, actorUserId: context.session.userId })
  const selectedIds =
    selectedOperation?.operation === 'user.prune_selection' &&
    Array.isArray(selectedOperation.snapshot.userIds)
      ? selectedOperation.snapshot.userIds.map(Number).filter(Number.isSafeInteger)
      : []
  const selectedPreview =
    selectedIds.length === 0 ? null : await repository.selectedPrunePreview(selectedIds)
  const criteria = selection === undefined ? parsePruneCriteria(params) : null
  const preview = criteria === null ? null : await repository.prunePreview(criteria)
  const translator = await getTranslator()

  const value = (key: string): string => {
    const raw = params[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text ?? ''
  }

  return (
    <PanelPage
      back={{ href: '/admin/users', label: translator.t('adminUsers.allMembers') }}
      title={await tr('page.prune-members')}
      lede={translator.t('adminUsers.pruneLede')}
    >
      {selection !== undefined && selectedPreview !== null ? (
        <section className={PANEL_CARD}>
          <h2 className="font-heading text-lg font-semibold">
            {translator.t('adminUsers.accountsWouldClose', { count: selectedPreview.total })}
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {selectedPreview.sample.map((row) => (
              <li key={row.id}>
                <a
                  href={`/admin/users/${row.id}`}
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {row.username}
                </a>{' '}
                {translator.t('adminUsers.pruneMemberMeta', {
                  email: row.email,
                  date: row.createdAt.toISOString().slice(0, 10),
                })}
              </li>
            ))}
          </ul>
          <SelectedPruneForm
            selection={selection}
            copy={userPruneCopy(selectedPreview.total, translator)}
          />
        </section>
      ) : selection !== undefined ? (
        <p className={PANEL_NOTE}>{translator.t('admin.undoExpired')}</p>
      ) : (
        <>
          <form method="get" className={PANEL_CARD}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{await tr('page.registered-before')}</span>
              <input type="date" name="before" defaultValue={value('before')} className={INPUT} />
              <span className="text-xs text-muted-foreground">
                {await tr('page.required-without-it-prune-matches')}
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{await tr('page.not-seen-since')}</span>
              <input
                type="date"
                name="inactive"
                defaultValue={value('inactive')}
                className={INPUT}
              />
              <span className="text-xs text-muted-foreground">
                {await tr('page.members-who-have-never-been')}
              </span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="awaiting"
                value="1"
                defaultChecked={value('awaiting') !== ''}
                className="size-4"
              />
              <span>{await tr('page.only-accounts-still-awaiting-activation')}</span>
            </label>

            <div>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {await tr('page.show-me')}
              </button>
            </div>
          </form>

          {criteria === null ? (
            <p className={PANEL_NOTE}>{await tr('page.choose-registration-date-see-what')}</p>
          ) : preview !== null && preview.total === 0 ? (
            <p className={PANEL_NOTE}>{translator.t('adminUsers.pruneNoMatches')}</p>
          ) : preview !== null ? (
            <section className={PANEL_CARD}>
              <h2 className="font-heading text-lg font-semibold">
                {translator.t('adminUsers.accountsWouldClose', { count: preview.total })}
              </h2>

              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {preview.sample.map((row) => (
                  <li key={row.id}>
                    <a
                      href={`/admin/users/${row.id}`}
                      className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                    >
                      {row.username}
                    </a>{' '}
                    {translator.t('adminUsers.pruneMemberMeta', {
                      email: row.email,
                      date: row.createdAt.toISOString().slice(0, 10),
                    })}
                  </li>
                ))}
                {preview.total > preview.sample.length && (
                  <li>
                    {translator.t('adminUsers.andMore', {
                      count: preview.total - preview.sample.length,
                    })}
                  </li>
                )}
              </ul>

              <PruneForm
                before={value('before')}
                inactive={value('inactive')}
                awaiting={value('awaiting') !== ''}
                copy={userPruneCopy(preview.total, translator)}
              />
            </section>
          ) : null}
        </>
      )}
    </PanelPage>
  )
}
