import type { CommunityRowSlotModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

/**
 * One community, as a table row.
 *
 * Three decisions carried over from the default theme because they are correct
 * rather than because they are its:
 *
 * **Unread is never colour alone** — the dot has text beside it for screen
 * readers, since "this community has new posts" is information.
 *
 * **The last-post author is a link only when there is somewhere to link to**;
 * `profileHref` is null for a deleted account and the name still renders.
 *
 * **The timestamp is `<time>` with the machine value in `datetime`**, so the
 * exact instant survives the preformatted label.
 */
export function CommunityRow({ community }: CommunityRowSlotModel) {
  const isLink = community.type === 'link'

  return (
    <tr className="border-t border-border align-top odd:bg-card even:bg-muted/40">
      <td className="px-3 py-2">
        <div className="flex items-baseline gap-2">
          {community.isUnread && (
            <span className="size-1.5 shrink-0 bg-community-unread" aria-hidden="true" />
          )}
          <a href={community.href} className="font-medium hover:text-primary">
            {community.title}
          </a>
          {community.isUnread && <span className="sr-only">(new posts)</span>}
        </div>
        {community.description !== null && (
          <p className="mt-0.5 text-xs text-muted-foreground">{community.description}</p>
        )}
        {community.subcommunities.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-2 font-mono text-xs text-muted-foreground">
            {community.subcommunities.map((sub) => (
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
        {isLink ? '' : community.threadCount}
      </td>
      <td className="w-16 px-2 py-2 text-right font-mono text-xs text-muted-foreground">
        {isLink ? '' : community.postCount}
      </td>
      <td className="w-64 px-3 py-2 text-xs text-muted-foreground">
        {isLink || community.lastPost === null ? (
          <span className="text-community-read">{isLink ? '' : 'no posts yet'}</span>
        ) : (
          <>
            <a href={community.lastPost.href} className="block truncate hover:text-primary">
              {community.lastPost.threadTitle}
            </a>
            <span>
              <UserRef user={community.lastPost.author} className="hover:text-foreground" />
              {' · '}
              <time dateTime={community.lastPost.at.iso}>{community.lastPost.at.label}</time>
            </span>
          </>
        )}
      </td>
    </tr>
  )
}
