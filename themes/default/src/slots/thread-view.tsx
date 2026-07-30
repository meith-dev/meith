import type { ThreadViewModel } from '@forum/theme-kit'

export function ThreadView({ thread, forum, replyHref, regions }: ThreadViewModel) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href={forum.href} className="text-sm text-muted-foreground hover:text-foreground">{forum.label}</a>
          <h1 className="mt-1 font-serif text-2xl font-semibold">{thread.title}</h1>
        </div>
        {replyHref !== null && <a href={replyHref} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Reply</a>}
      </div>
      <div className="flex flex-col gap-4">{regions.posts}</div>
      {regions.pagination}
    </div>
  )
}
