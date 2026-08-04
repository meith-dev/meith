import type { Metadata } from 'next'

import {
  CustomTagRowForm,
  DeletePrefixForm,
  NewCustomTagForm,
  NewPrefixForm,
  NewSmileyForm,
  NewWordFilterForm,
  SmileyRowForm,
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

  const [filters, prefixes, smilies, customTags] = await Promise.all([
    repository.listWordFilters(),
    repository.listPrefixes(),
    repository.listSmilies(),
    repository.listCustomTags(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Content</h1>
        <p className="text-sm text-muted-foreground">
          The board-wide vocabularies: what a post may contain, what gets
          filtered out of it, and what members can label a thread with.
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

      <section className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
        <h2 className="font-serif text-lg font-semibold">Announcements</h2>
        <p className="text-muted-foreground">
          A dated notice above the forums, board-wide or attached to one. Not a
          pinned thread: nobody can reply to it, it expires on its own date, and
          removing it removes nothing anybody wrote.
        </p>
        <a href="/admin/content/announcements" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          Announcements →
        </a>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
        <h2 className="font-serif text-lg font-semibold">Attachments</h2>
        <p className="text-muted-foreground">
          What members have uploaded, what it is costing in storage, and what has
          failed to process. Its own screen, because it is a listing that pages
          rather than a vocabulary that fits on one.
        </p>
        <a href="/admin/content/attachments" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
          Attachments →
        </a>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Smilies</h2>
        <p className="text-sm text-muted-foreground">
          A literal code and an image. The code is matched as text, never as a
          pattern, and the longest one wins where two overlap — so{' '}
          <code className="text-xs">:-)</code> beats{' '}
          <code className="text-xs">:)</code> at the same position. Smilies are
          never expanded inside a <code className="text-xs">[code]</code> block.
        </p>
        <p className="text-xs text-muted-foreground">
          Unlike a word filter, this changes what a post <em>renders to</em>, so
          editing it marks every stored render on the board out of date. They are
          rewritten in the background and read correctly in the meantime —
          nothing breaks, and a busy board simply does more rendering for a
          while. Removing a smiley puts the code back as the characters its
          author typed.
        </p>

        {smilies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None configured, so codes like <code className="text-xs">:)</code> show as typed.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {smilies.map((smiley) => (
              <SmileyRowForm key={smiley.id} smiley={smiley} />
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <NewSmileyForm />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Custom BBCode</h2>
        <p className="text-sm text-muted-foreground">
          A tag chooses a <strong>name</strong> and whether it is inline or block.
          That is the whole form, and the omissions are the point: there is no
          replacement template, no pattern and no HTML field, because a box that
          chose output markup would be a second markup language administered
          through a web form — which is how boards with &ldquo;custom
          MyCode&rdquo; acquire a permanent security hole.
        </p>
        <p className="text-xs text-muted-foreground">
          Your tag renders as a{' '}
          <code className="text-xs">span</code> (or{' '}
          <code className="text-xs">div</code> for a block one) carrying a class
          your theme can style. A name that already exists is refused: changing
          what <code className="text-xs">[url]</code> does has to be a code
          change, not a setting. Removing a tag makes posts using it show the
          markup as written, which is what an unknown tag has always done.
        </p>

        {customTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None configured. Posts use the renderer&rsquo;s built-in tags only.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {customTags.map((tag) => (
              <CustomTagRowForm key={tag.id} tag={tag} />
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <NewCustomTagForm />
        </div>
      </section>
    </div>
  )
}
