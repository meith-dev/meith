import type { MemberProfileModel } from '@forum/theme-kit'

export function MemberProfile({
  user,
  title,
  joinedAt,
  lastVisitAt,
  postCount,
}: MemberProfileModel) {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8">
      <header className="rounded-lg border border-border bg-card p-5">
        <h1 className="font-serif text-3xl font-semibold">{user.username}</h1>
        {title !== null && <p className="mt-1 text-sm text-muted-foreground">{title}</p>}
      </header>
      <dl className="grid gap-4 rounded-lg border border-border bg-card p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>
            <time dateTime={joinedAt.iso}>{joinedAt.label}</time>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last visit</dt>
          <dd>
            {lastVisitAt === null ? 'Never' : <time dateTime={lastVisitAt.iso}>{lastVisitAt.label}</time>}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Posts</dt>
          <dd>{postCount}</dd>
        </div>
      </dl>
    </article>
  )
}
