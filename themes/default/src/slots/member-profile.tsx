import type { MemberProfileModel } from '@meith/theme-kit'

/**
 * A member's profile (F33).
 *
 * `fields`, `signatureHtml` and `actions` were in the model from F25 and
 * rendered by nothing until F77's rendering-contract suite asked every theme to
 * render what it is handed. They had all three producers — F59 fills the custom
 * fields, F58 the signature, the page the actions — and no consumer, so a board
 * could define a "Location" field, watch members fill it in, and show it only in
 * the postbit. That is the failure mode a contract test exists to find: nothing
 * was broken, a feature was simply invisible.
 */
export function MemberProfile({
  user,
  avatarUrl,
  title,
  joinedAt,
  lastVisitAt,
  postCount,
  signatureHtml,
  fields,
  actions,
  regions,
}: MemberProfileModel) {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8">
      <header className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
        {/*
          F58. Absent rather than a placeholder, as in the postbit: this is a
          profile, and a silhouette says less than the space it takes.
        */}
        {avatarUrl !== null && (
          <img
            src={avatarUrl}
            alt=""
            width={96}
            height={96}
            className="size-24 rounded-lg border border-border object-cover"
          />
        )}
        <div>
          <h1 className="font-serif text-3xl font-semibold">{user.username}</h1>
          {title !== null && <p className="mt-1 text-sm text-muted-foreground">{title}</p>}
        </div>
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

      {/*
        F59's custom fields. Rendered as *text*, never as markup — the same rule
        the postbit follows, and for the same reason: a field a member fills in
        that could carry HTML is stored XSS on a page every member visits.
      */}
      {fields.length > 0 && (
        <dl className="grid gap-4 rounded-lg border border-border bg-card p-5 text-sm sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/*
        The signature is pre-rendered BBCode (F36) — the sanitising renderer's
        own output, which is why it may be inserted as HTML here and nowhere a
        theme composes a string itself.
      */}
      {signatureHtml !== null && (
        <section aria-label="Signature" className="rounded-lg border border-border p-5 text-sm">
          <div
            className="prose-forum"
            dangerouslySetInnerHTML={{ __html: signatureHtml }}
          />
        </section>
      )}

      {/* F80's `profile.panel` region. */}
      {regions?.plugins}

      {actions.length > 0 && (
        <nav aria-label="Member actions" className="flex flex-wrap gap-3">
          {actions.map((action) => (
            <a
              key={action.href}
              href={action.href}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              {action.label}
            </a>
          ))}
        </nav>
      )}
    </article>
  )
}
