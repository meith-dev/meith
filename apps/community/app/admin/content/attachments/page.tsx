import type { Metadata } from 'next'

import { PanelPage } from '@/components/shell/panel-page'
import { DeleteAttachmentForm } from '@/components/admin/content-forms'
import { adminPageContext } from '@/server/admin'
import { attachmentAdminRepository } from '@/server/content-admin'
import { formatBytes } from '@/view/attachments'
import { postLink } from '@/view/post-link'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Attachments' }

const PAGE_SIZE = 50

export default async function AdminAttachmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if ((await adminPageContext()) === null) return null

  const repository = attachmentAdminRepository()
  if (repository === null) {
    return (
      <PanelPage title="Attachments" width="wide">
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so it stores no files.
        </p>
      </PanelPage>
    )
  }

  const params = await searchParams
  const one = (name: string): string | undefined => {
    const value = params[name]
    const text = Array.isArray(value) ? value[0] : value
    return text === undefined || text.trim() === '' ? undefined : text.trim()
  }

  const filename = one('filename')
  const status = one('status')
  const beforeText = one('before')
  const beforeId =
    beforeText !== undefined && /^\d+$/.test(beforeText) ? Number(beforeText) : undefined

  const [page, totals] = await Promise.all([
    repository.list({
      ...(filename === undefined ? {} : { filename }),
      ...(status === undefined ? {} : { status }),
      ...(beforeId === undefined ? {} : { beforeId }),
      limit: PAGE_SIZE,
    }),
    repository.totals(),
  ])

  const now = new Date()
  const nextHref = (): string => {
    const next = new URLSearchParams()
    if (filename !== undefined) next.set('filename', filename)
    if (status !== undefined) next.set('status', status)
    next.set('before', String(page.nextBeforeId))
    return `/admin/content/attachments?${next.toString()}`
  }

  return (
    <PanelPage
      back={{ href: '/admin/content', label: 'Content' }}
      title="Attachments"
      lede={
        <>
          Every file members have uploaded. Deleting one removes it from the list under
          its post and hands the stored bytes to the hourly sweep —{' '}
          <strong>the post itself is untouched</strong>, because an attachment is shown
          beside a post rather than written into it.
        </>
      }
      width="wide"
    >
      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Files</dt>
          <dd className="text-lg">{totals.count}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Stored</dt>
          <dd className="text-lg">{formatBytes(totals.bytes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Awaiting processing</dt>
          <dd className={totals.pending > 0 ? 'text-lg text-destructive' : 'text-lg'}>
            {totals.pending}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Failed</dt>
          <dd className={totals.failed > 0 ? 'text-lg text-destructive' : 'text-lg'}>
            {totals.failed}
          </dd>
        </div>
      </dl>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Filename contains</span>
          <input
            name="filename"
            defaultValue={filename ?? ''}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select
            name="status"
            defaultValue={status ?? ''}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Any</option>
            <option value="ready">Ready</option>
            <option value="pending">Awaiting processing</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm"
        >
          Filter
        </button>
      </form>

      {page.rows.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Nothing matches.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {page.rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{row.filename}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {formatBytes(row.sizeBytes)} · {row.contentType} · {row.downloadCount}{' '}
                  download
                  {row.downloadCount === 1 ? '' : 's'} ·{' '}
                  <time dateTime={row.createdAt.toISOString()}>
                    {formatTime(row.createdAt, now).label}
                  </time>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {row.uploaderUsername ?? 'a deleted account'}
                  {row.threadSlug !== null && (
                    <>
                      {' · '}
                      <a
                        href={postLink(`/thread/${row.threadSlug}`, row.postId)}
                        className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                      >
                        the post
                      </a>
                    </>
                  )}
                </span>
                {row.status !== 'ready' && (
                  <span className="text-xs text-destructive">
                    {row.status === 'pending'
                      ? 'Awaiting processing — not downloadable yet.'
                      : `Failed: ${row.failureReason ?? 'no reason recorded'}`}
                  </span>
                )}
              </span>

              <DeleteAttachmentForm attachmentId={row.id} />
            </li>
          ))}
        </ul>
      )}

      {page.nextBeforeId !== null && (
        <a
          href={nextHref()}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          Older →
        </a>
      )}
    </PanelPage>
  )
}
