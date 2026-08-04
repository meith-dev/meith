import type { ForumRowSlotModel } from '@meith/theme-kit'

/**
 * One forum, as a table row.
 *
 * Three decisions carried over from the default theme because they are correct
 * rather than because they are its:
 *
 * **Unread is never colour alone** — the dot has text beside it for screen
 * readers, since "this forum has new posts" is information.
 *
 * **The last-post author is a link only when there is somewhere to link to**;
 * `profileHref` is null for a deleted account and the name still renders.
 *
 * **The timestamp is `<time>` with the machine value in `datetime`**, so the
 * exact instant survives the preformatted label.
 */
export function ForumRow({ forum }: ForumRowSlotModel) {
  const isLink = forum.type === 'link'

  return (
    <tr className="border-t border-border align-top odd:bg-card even:bg-muted/40">
      <td className="px-3 py-2">
        <div className="flex items-baseline gap-2">
          {forum.isUnread && (
            <span className="size-1.5 shrink-0 bg-forum-unread" aria-hidden="true" />
          )}
          <a href={forum.href} className="font-medium hover:text-primary">
            {forum.title}
          </a>
          {forum.isUnread && <span className="sr-only">(new posts)</span>}
        </div>
        {forum.description !== null && (
          <p className="mt-0.5 text-xs text-muted-foreground">{forum.description}</p>
        )}
        {forum.subforums.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-2 font-mono text-xs text-muted-foreground">
            {forum.subforums.map((sub) => (
              <a key={sub.href} href={sub.href} className="hover:text-foreground">
                {sub.label}
              </a>
            ))}
          </p>
        )}
      </td>

      {/*
        A link row navigates away and has no threads of its own, so its counter
        cells are empty rather than showing zeroes — but the cells still exist,
        because a row with fewer cells breaks the table's column alignment for
        every row after it.
      */}
      <td className="w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground">
        {isLink ? '' : forum.threadCount}
      </td>
      <td className="w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground">
        {isLink ? '' : forum.postCount}
      </td>
      <td className="w-64 px-3 py-2 text-xs text-muted-foreground">
        {isLink || forum.lastPost === null ? (
          <span className="text-forum-read">{isLink ? '' : 'no posts yet'}</span>
        ) : (
          <>
            <a href={forum.lastPost.href} className="block truncate hover:text-primary">
              {forum.lastPost.threadTitle}
            </a>
            <span>
              {forum.lastPost.author.profileHref === null ? (
                forum.lastPost.author.username
              ) : (
                <a href={forum.lastPost.author.profileHref} className="hover:text-foreground">
                  {forum.lastPost.author.username}
                </a>
              )}
              {' · '}
              <time dateTime={forum.lastPost.at.iso}>{forum.lastPost.at.label}</time>
            </span>
          </>
        )}
      </td>
    </tr>
  )
}
