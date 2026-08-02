import { requireAdmin } from '@/server/admin'
import { getContainer } from '@/server/container'
import { formatTime } from '@/view/time'

/**
 * F63 — the panel's index.
 *
 * Deliberately thin. It lists the sections that **exist**, which today is the
 * admin log and nothing else: F64–F71 each add their own, and a panel that
 * advertised nine links to nine 404s would be worse than one that admits it is
 * new. Same rule the CLI follows about never advertising a capability that is
 * not there (D32).
 */
export default async function AdminHomePage() {
  /* Re-run, because a layout is not a security boundary (see the layout). */
  const context = await requireAdmin()
  const { adminLog } = getContainer()

  const recent = adminLog === null ? [] : await adminLog.list({ limit: 5 })
  const now = new Date()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
      <section className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Your control panel session started{' '}
          <time dateTime={context.session.createdAt.toISOString()}>
            {formatTime(context.session.createdAt, now).label}
          </time>
          {context.session.ipPrefix === null
            ? null
            : ` from ${context.session.ipPrefix}`}
          .
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold">Sections</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <a href="/admin/settings" className="text-primary hover:underline">
              Board settings
            </a>{' '}
            <span className="text-muted-foreground">
              — every setting this build has, grouped and searchable.
            </span>
          </li>
          <li>
            <a href="/admin/forums" className="text-primary hover:underline">
              Forums
            </a>{' '}
            <span className="text-muted-foreground">
              — the tree, each forum&rsquo;s options, and the permission matrix.
            </span>
          </li>
          <li>
            <a href="/admin/log" className="text-primary hover:underline">
              Admin log
            </a>{' '}
            <span className="text-muted-foreground">
              — every administrative and moderation action, with who and from where.
            </span>
          </li>
        </ul>
        {/*
          Named rather than linked. The remaining panels are F64–F71, and a link
          to a page that does not exist is worse than an honest note.
        */}
        <p className="text-xs text-muted-foreground">
          Groups, users, themes, plugins, maintenance and content administration
          each arrive with their own feature.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold">Latest activity</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-2">
                <code className="text-xs">{row.action}</code>
                <span className="text-muted-foreground">
                  {row.username ?? 'the system'} ·{' '}
                  <time dateTime={row.createdAt.toISOString()}>
                    {formatTime(row.createdAt, now).label}
                  </time>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
