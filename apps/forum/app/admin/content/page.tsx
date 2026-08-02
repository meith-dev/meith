import type { Metadata } from 'next'

import {
  DeletePrefixForm,
  NewPrefixForm,
  NewWordFilterForm,
  WordFilterRowForm,
} from '@/components/admin/content-forms'
import { requireAdmin } from '@/server/admin'
import { contentAdminRepository } from '@/server/content-admin'

export const metadata: Metadata = { title: 'Content' }

/**
 * F71 — content administration.
 *
 * The word filter is the part worth reading about. It is applied when a post is
 * **rendered**, never when it is saved, and that single choice is the feature:
 * turning a filter off restores the word everywhere on the next page load, a
 * badly chosen pattern can be corrected with no lasting damage, and a filter
 * added today applies to everything ever written. Boards that rewrite the
 * stored text have none of that, because the original is gone.
 *
 * Thread prefixes get their first writer here: `thread_prefixes` has been read
 * by the thread composer since F33 and could only be populated with SQL.
 */
export default async function AdminContentPage() {
  await requireAdmin()

  const repository = contentAdminRepository()
  if (repository === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">Content</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This board is running on in-memory sample data, so its content
          settings are not stored.
        </p>
      </div>
    )
  }

  const [filters, prefixes] = await Promise.all([
    repository.listWordFilters(),
    repository.listPrefixes(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Content</h1>
        <p className="text-sm text-muted-foreground">
          The board-wide vocabularies: what gets filtered out of posts, and what
          members can label a thread with.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Word filters</h2>
        <p className="text-sm text-muted-foreground">
          Applied when a post is shown, never to what is stored — so removing a
          filter brings the word back everywhere, immediately, and a pattern you
          regret does no lasting damage. A filter added now also applies to every
          post ever written, not just to new ones.
        </p>
        <p className="text-xs text-muted-foreground">
          Matching is case-insensitive and always literal text — never a pattern
          language — because this runs on every post the board renders.{' '}
          <strong>Whole words</strong> is on by default: a filter on a fragment
          silently mangles place names and surnames, and the member it happens to
          has no idea why their post looks wrong.
        </p>

        {filters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No filters. Posts show as written.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {filters.map((filter) => (
              <WordFilterRowForm key={filter.id} filter={filter} />
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <NewWordFilterForm />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Thread prefixes</h2>
        <p className="text-sm text-muted-foreground">
          Labels a member can put in front of a thread title. Removing one takes
          it off the threads that used it and leaves them otherwise untouched —
          which is why a prefix you mistyped is not permanent.
        </p>

        {prefixes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None configured, so the composer offers no prefixes.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {prefixes.map((prefix) => (
              <li key={prefix.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{prefix.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    order {prefix.displayOrder}
                    {prefix.token !== null && ` · ${prefix.token}`}
                    {prefix.forumPathPrefix !== null && ` · only under ${prefix.forumPathPrefix}`}
                  </span>
                </span>
                <DeletePrefixForm prefix={prefix} />
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border pt-3">
          <NewPrefixForm />
        </div>
      </section>

      {/*
        Named rather than half-built, on the same rule the rest of this panel
        follows. Each of these needs a subsystem that does not exist yet, and a
        screen over nothing would be worse than an honest note.
      */}
      <section className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
        <h2 className="font-serif text-lg font-semibold">Not here yet</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          <li>
            <strong>Smilies and custom BBCode.</strong> Both are additions to the
            renderer&rsquo;s vocabulary rather than rows an operator edits — the
            renderer has a fixed, sanitised tag set on purpose, and letting the
            panel extend it is a change to what a post can contain.
          </li>
          <li>
            <strong>Attachment administration.</strong> Attachments have a
            lifecycle, an orphan ledger and a sweep already; what is missing is a
            listing an operator can act on, which needs decisions about what
            deleting somebody else&rsquo;s upload does to the post that shows it.
          </li>
          <li>
            <strong>Announcements.</strong> There is no announcement model on
            this board at all. A screen for editing something that does not
            exist would be the emptiest kind of stub.
          </li>
        </ul>
      </section>
    </div>
  )
}
