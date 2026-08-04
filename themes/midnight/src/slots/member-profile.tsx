import type { MemberProfileModel } from '@meith/theme-kit'

/**
 * A profile, as a data sheet.
 *
 * Every field the model carries is rendered — including `fields`,
 * `signatureHtml` and `actions`, whose absence from the *default* theme was what
 * F77's rendering-contract suite found on its first run. A theme that ignores a
 * prop looks exactly like one that never received it, which is why the suite
 * asks rather than assumes.
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
    <article className="flex flex-col gap-3 p-3">
      <header className="flex items-start gap-3 border border-border bg-secondary p-3">
        {avatarUrl !== null && (
          <img
            src={avatarUrl}
            alt=""
            width={72}
            height={72}
            className="size-18 border border-border object-cover"
          />
        )}
        <div>
          <h1 className="font-mono text-2xl font-semibold">{user.username}</h1>
          {title !== null && <p className="font-mono text-xs text-muted-foreground">{title}</p>}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border border-border p-3 font-mono text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">joined</dt>
          <dd>
            <time dateTime={joinedAt.iso}>{joinedAt.label}</time>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">last visit</dt>
          <dd>
            {lastVisitAt === null ? (
              'never'
            ) : (
              <time dateTime={lastVisitAt.iso}>{lastVisitAt.label}</time>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">posts</dt>
          <dd>{postCount}</dd>
        </div>
        {/* F59's custom fields. Text, never markup. */}
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>

      {signatureHtml !== null && (
        <section aria-label="Signature" className="border border-border p-3 text-sm">
          {/* Pre-rendered by the sanitising renderer (F36), like a post body. */}
          <div className="prose-bb" dangerouslySetInnerHTML={{ __html: signatureHtml }} />
        </section>
      )}

      {/* F80's `profile.panel` region. */}
      {regions?.plugins}

      {actions.length > 0 && (
        <nav aria-label="Member actions" className="flex flex-wrap gap-2 font-mono text-xs">
          {actions.map((action) => (
            <a
              key={action.href}
              href={action.href}
              className="border border-border px-2 py-1 hover:bg-muted"
            >
              {action.label}
            </a>
          ))}
        </nav>
      )}
    </article>
  )
}
