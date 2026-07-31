import type { ThreadRowSlotModel } from "@forum/theme-kit";

export function ThreadRow({ thread, select }: ThreadRowSlotModel) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      {/*
        F52's checkbox. `form` points at the moderation bar the page renders
        below the listing, so this control belongs to that form without this
        row being inside it — which it cannot be, because the listing already
        contains a mark-read form.
      */}
      {select !== null && (
        <label className="flex shrink-0 items-center">
          <span className="sr-only">{select.label}</span>
          <input
            type="checkbox"
            name={select.name}
            value={select.value}
            form={select.formId}
            className="size-4"
          />
        </label>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {thread.prefix !== null && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
              {thread.prefix.label}
            </span>
          )}
          {thread.isSticky && (
            <span className="text-xs font-medium text-primary">Pinned</span>
          )}
          {thread.isLocked && (
            <span className="text-xs text-muted-foreground">Locked</span>
          )}
          <a
            href={thread.href}
            className="font-medium text-foreground hover:text-primary"
          >
            {thread.title}
          </a>
          {thread.isUnread && <span className="sr-only">(new posts)</span>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Started by {thread.author.profileHref === null ? thread.author.username : <a href={thread.author.profileHref} className="hover:text-foreground">{thread.author.username}</a>}
        </p>
      </div>
      <dl className="flex shrink-0 gap-4 text-xs whitespace-nowrap text-muted-foreground sm:w-32">
        <div>
          <dt className="sr-only">Replies</dt>
          <dd>{thread.replyCount} replies</dd>
        </div>
        <div>
          <dt className="sr-only">Views</dt>
          <dd>{thread.viewCount} views</dd>
        </div>
      </dl>
      <div className="shrink-0 text-xs text-muted-foreground sm:w-52">
        {thread.lastPost === null ? (
          "No replies yet"
        ) : (
          <>
            <a
              href={thread.lastPost.href}
              className="block truncate font-medium text-foreground hover:text-primary"
            >
              Last post
            </a>
            <span>
              by {thread.lastPost.author.profileHref === null ? thread.lastPost.author.username : <a href={thread.lastPost.author.profileHref} className="hover:text-foreground">{thread.lastPost.author.username}</a>},{" "}
              <time dateTime={thread.lastPost.at.iso}>
                {thread.lastPost.at.label}
              </time>
            </span>
          </>
        )}
      </div>
    </li>
  );
}
