import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getDb, PostgresUserMergeRepository } from '@meith/db'
import { cn } from '@meith/ui'

import { MergeForm } from '@/components/admin/user-forms'
import { PANEL_CARD, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { userAdminRepository } from '@/server/user-admin'
import { userAdminCopy } from '@/view/admin-user-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.merge-account') }
}

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export default async function AdminMergePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if ((await adminPageContext()) === null) return null

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const repository = userAdminRepository()
  if (repository === null) notFound()

  const member = await repository.readDetail(Number(id))
  if (member === null) notFound()

  const query = await searchParams
  const rawInto = query.into
  const into = (Array.isArray(rawInto) ? rawInto[0] : rawInto)?.trim() ?? ''

  const candidates =
    into === ''
      ? []
      : (await repository.search({ username: into, afterUserId: 0, limit: 10 })).rows.filter(
          (row) => row.id !== member.id,
        )

  const merge = new PostgresUserMergeRepository(getDb())
  const previews = await Promise.all(
    candidates.map(async (row) => ({
      row,
      preview: await merge.preview(member.id, row.id),
    })),
  )

  const t = await getTranslator()
  const copy = userAdminCopy(t)

  return (
    <PanelPage
      back={{ href: `/admin/users/${member.id}`, label: member.username }}
      title={t.t('adminUsers.mergeTitle', { username: member.username })}
      lede={t.t('adminUsers.mergePageLede', { username: member.username })}
    >
      <form method="get" className={PANEL_CARD}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{await tr('page.keep-which-account')}</span>
          <input
            name="into"
            defaultValue={into}
            className={INPUT}
            placeholder={t.t('adminUsers.username')}
          />
        </label>
        <div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t.t('adminUsers.find')}
          </button>
        </div>
      </form>

      {into !== '' && previews.length === 0 && (
        <p className={PANEL_NOTE}>{t.t('adminUsers.noOtherAccountMatches', { username: into })}</p>
      )}

      {previews.map(({ row, preview }) =>
        preview === null ? null : (
          <section key={row.id} className={PANEL_CARD}>
            <h2 className="font-heading text-lg font-semibold">
              {t.t('adminUsers.keep', { username: row.username })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.t('adminUsers.mergePreview', {
                posts: t.t('adminUsers.posts', { count: preview.posts }),
                threads: t.t('adminUsers.threads', { count: preview.threads }),
                messages: t.t('adminUsers.privateMessages', { count: preview.privateMessages }),
                attachments: t.t('adminUsers.attachments', { count: preview.attachments }),
                from: member.username,
                to: row.username,
              })}
            </p>

            {preview.blockedByBan ? (
              <p className="text-sm text-muted-foreground">{t.t('adminUsers.mergeBlockedByBan')}</p>
            ) : (
              <MergeForm
                fromUserId={member.id}
                toUserId={row.id}
                toUsername={row.username}
                posts={preview.posts}
                copy={copy}
              />
            )}
          </section>
        ),
      )}

      <div className={cn(PANEL_CARD, 'gap-2 text-xs text-muted-foreground')}>
        <p>{await tr('page.what-merge-does-full')}</p>
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>{t.t('adminUsers.mergeDetailContent')}</li>
          <li>{t.t('adminUsers.mergeDetailSessions')}</li>
          <li>{t.t('adminUsers.mergeDetailConflict')}</li>
          <li>{t.t('adminUsers.mergeDetailRelations')}</li>
          <li>{await tr('page.losing-account-closed-not-deleted')}</li>
        </ul>
      </div>
    </PanelPage>
  )
}
