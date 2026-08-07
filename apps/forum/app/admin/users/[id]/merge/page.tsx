import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PanelPage } from '@/components/shell/panel-page'
import { MergeForm } from '@/components/admin/user-forms'
import { requireAdmin } from '@/server/admin'
import { userAdminRepository } from '@/server/user-admin'
import { PostgresUserMergeRepository, getDb } from '@meith/db'

export const metadata: Metadata = { title: 'Merge account' }

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * F67 — merging one account into another.
 *
 * Its own page rather than a section on the member screen, because a merge is
 * the one operation here that names *two* accounts and has to show what it
 * would do to both before it does anything.
 *
 * The account being merged is the one in the URL, and it is the one that
 * **disappears**. That direction is stated everywhere on this page in those
 * words: "merge A into B" is ambiguous in ordinary speech, and getting it
 * backwards destroys the account somebody meant to keep, with no undo.
 *
 * Finding the destination is a GET form on a username, so the choice is in the
 * address bar and survives a reload — the same reason the search is a GET form.
 */
export default async function AdminMergePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()

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
      : (
          await repository.search({ username: into, afterUserId: 0, limit: 10 })
        ).rows.filter((row) => row.id !== member.id)

  const merge = new PostgresUserMergeRepository(getDb())
  const previews = await Promise.all(
    candidates.map(async (row) => ({
      row,
      preview: await merge.preview(member.id, row.id),
    })),
  )

  return (
    <PanelPage
      back={{ href: `/admin/users/${member.id}`, label: member.username }}
      title={`Merge ${member.username}`}
      lede={
        <>
          <strong>{member.username}</strong> is the account that disappears. Everything it
          ever posted becomes the other account&rsquo;s, and this one is closed. Check the
          direction before you press anything — there is no undo.
        </>
      }
    >
      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Keep which account?</span>
          <input
            name="into"
            defaultValue={into}
            className={INPUT}
            placeholder="Username"
          />
        </label>
        <div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Find
          </button>
        </div>
      </form>

      {into !== '' && previews.length === 0 && (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No other account matches “{into}”.
        </p>
      )}

      {previews.map(({ row, preview }) =>
        preview === null ? null : (
          <section
            key={row.id}
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <h2 className="font-serif text-lg font-semibold">Keep {row.username}</h2>
            <p className="text-sm text-muted-foreground">
              {preview.posts} post{preview.posts === 1 ? '' : 's'}, {preview.threads}{' '}
              thread{preview.threads === 1 ? '' : 's'}, {preview.privateMessages} private
              message
              {preview.privateMessages === 1 ? '' : 's'} and {preview.attachments}{' '}
              attachment
              {preview.attachments === 1 ? '' : 's'} would move from {member.username} to{' '}
              {row.username}.
            </p>

            {preview.blockedByBan ? (
              <p className="text-sm text-muted-foreground">
                One of these accounts is banned. A merge carries the ban record across,
                which would lock out an account nobody decided to ban — lift it first.
              </p>
            ) : (
              <MergeForm
                fromUserId={member.id}
                toUserId={row.id}
                toUsername={row.username}
                posts={preview.posts}
              />
            )}
          </section>
        ),
      )}

      {/*
        Named rather than silently done. Every one of these is a real
        consequence somebody will ask about afterwards.
      */}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 text-xs text-muted-foreground">
        <p>What a merge does, in full:</p>
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>
            Every post, thread, message, attachment, warning and report moves, including
            the names shown beside them.
          </li>
          <li>
            The losing account&rsquo;s sessions and login tokens are{' '}
            <strong>destroyed</strong>, not moved — a merge is not a way to hand somebody
            a login.
          </li>
          <li>
            Where both accounts had the same subscription, group or preference, the kept
            account&rsquo;s wins.
          </li>
          <li>
            Ratings and relations between the two accounts are removed, because after a
            merge they would say somebody rated or ignored themselves.
          </li>
          <li>The losing account is closed, not deleted. Its username stays taken.</li>
        </ul>
      </div>
    </PanelPage>
  )
}
