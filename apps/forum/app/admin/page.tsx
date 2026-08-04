import { requireAdmin } from '@/server/admin'
import { pendingUpgradeNotice } from '@/server/upgrade-notice'
import { getContainer } from '@/server/container'
import { formatTime } from '@/view/time'

/**
 * F63 — the panel's index.
 *
 * Deliberately thin, and it lists only the sections that **exist** — a panel
 * advertising links to pages that are not there would be worse than one that
 * admits it is new. Same rule the CLI follows about never advertising a
 * capability that is not there (D32).
 *
 * As of F71 every section Phase 6 promised is here. Each screen is honest about
 * its own limits rather than the index being honest on their behalf: the plugin
 * page says what a plugin cannot do yet, the theme page says that switching one
 * is a redeploy, and the content page names what it does not administer.
 */
export default async function AdminHomePage() {
  /* Re-run, because a layout is not a security boundary (see the layout). */
  const context = await requireAdmin()
  const { adminLog } = getContainer()

  const recent = adminLog === null ? [] : await adminLog.list({ limit: 5 })
  const now = new Date()

  /* F84. `null` on a current board — a panel that always says "fine" stops being read. */
  const upgradeNotice = await pendingUpgradeNotice()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
      {upgradeNotice !== null && (
        <p
          role="alert"
          className="rounded-md border border-thread-pinned bg-muted px-3 py-2 text-sm"
        >
          <span className="font-mono text-xs uppercase text-muted-foreground">upgrade · </span>
          {upgradeNotice}
        </p>
      )}

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
            <a href="/admin/settings" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Board settings
            </a>{' '}
            <span className="text-muted-foreground">
              — every setting this build has, grouped and searchable.
            </span>
          </li>
          <li>
            <a href="/admin/forums" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Forums
            </a>{' '}
            <span className="text-muted-foreground">
              — the tree, each forum&rsquo;s options, and the permission matrix.
            </span>
          </li>
          <li>
            <a href="/admin/groups" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Groups
            </a>{' '}
            <span className="text-muted-foreground">
              — what each group allows, promotions, and mass membership changes.
            </span>
          </li>
          <li>
            <a href="/admin/users" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Members
            </a>{' '}
            <span className="text-muted-foreground">
              — search, edit an account, activate, and ban or lift a ban.
            </span>
          </li>
          <li>
            <a href="/admin/themes" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Themes
            </a>{' '}
            <span className="text-muted-foreground">
              — token values, custom CSS, preview, and exact export/import.
            </span>
          </li>
          <li>
            <a href="/admin/plugins" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Plugins
            </a>{' '}
            <span className="text-muted-foreground">
              — what is configured, and what a plugin can do so far.
            </span>
          </li>
          <li>
            <a href="/admin/api-tokens" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              API tokens
            </a>{' '}
            <span className="text-muted-foreground">
              — bearer tokens for the REST API, and which of them are still live.
            </span>
          </li>
          <li>
            <a href="/admin/system" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              System health
            </a>{' '}
            <span className="text-muted-foreground">
              — whether the scheduler is running, and the maintenance sweeps.
            </span>
          </li>
          <li>
            <a href="/admin/content" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Content
            </a>{' '}
            <span className="text-muted-foreground">
              — word filters, smilies, custom BBCode, thread prefixes,
              attachments and announcements.
            </span>
          </li>
          <li>
            <a href="/admin/antispam" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Anti-spam
            </a>{' '}
            <span className="text-muted-foreground">
              — registration questions, and what each control actually stops.
            </span>
          </li>
          <li>
            <a href="/admin/log" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Admin log
            </a>{' '}
            <span className="text-muted-foreground">
              — every administrative and moderation action, with who and from where.
            </span>
          </li>
        </ul>
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
