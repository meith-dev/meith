import type { MemberProfileModel } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import { Circle, count, FEED, NUMERIC, PAGE, PILL, PILL_PRIMARY, Stamp } from '../shared'

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
    <div className={`${PAGE} py-4 sm:py-6`}>
      <div className={`${FEED} flex flex-col gap-4`}>
        <section className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
          <div className="h-32 bg-primary/12 sm:h-40" />

          <div className="flex flex-col items-center gap-3 px-4 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="-mt-12 flex flex-col items-center gap-3 sm:flex-row sm:items-end">
              <Circle
                src={avatarUrl}
                name={user.username}
                size={112}
                className="ring-4 ring-card"
              />

              <div className="min-w-0 pb-1 text-center sm:text-left">
                <h1
                  className={cn(
                    'text-2xl leading-tight font-bold tracking-tight break-words',
                    user.nameClass,
                  )}
                >
                  {user.username}
                </h1>
                {title !== null && <p className="text-sm text-muted-foreground">{title}</p>}
              </div>
            </div>

            {actions.length > 0 && (
              <nav
                aria-label="Member actions"
                className="flex shrink-0 flex-wrap items-center justify-center gap-2"
              >
                {actions.map((action, index) => (
                  <a
                    key={action.href}
                    href={action.href}
                    className={index === 0 ? PILL_PRIMARY : PILL}
                  >
                    {action.label}
                  </a>
                ))}
              </nav>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-2 border-t border-border px-4 py-3 text-center">
            <div>
              <dd className={`text-lg font-bold text-foreground ${NUMERIC}`}>{count(postCount)}</dd>
              <dt className="text-xs text-muted-foreground">Posts</dt>
            </div>
            <div>
              <dd className="text-sm font-semibold text-foreground">
                <Stamp at={joinedAt} />
              </dd>
              <dt className="text-xs text-muted-foreground">Joined</dt>
            </div>
            <div>
              <dd className="text-sm font-semibold text-foreground">
                {lastVisitAt === null ? 'Never' : <Stamp at={lastVisitAt} />}
              </dd>
              <dt className="text-xs text-muted-foreground">Last visit</dt>
            </div>
          </dl>
        </section>

        {fields.length > 0 && (
          <section
            aria-labelledby="profile-fields-heading"
            className="rounded-lg border border-border bg-card text-card-foreground shadow-elevation"
          >
            <h2
              id="profile-fields-heading"
              className="px-4 pt-3 pb-1 text-[1.0625rem] font-bold tracking-tight"
            >
              About
            </h2>
            <dl className="grid gap-x-6 gap-y-3 px-4 pt-2 pb-4 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label}>
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="text-sm break-words">{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {signatureHtml !== null && (
          <section
            aria-labelledby="profile-signature-heading"
            className="rounded-lg border border-border bg-card text-card-foreground shadow-elevation"
          >
            <h2
              id="profile-signature-heading"
              className="px-4 pt-3 pb-1 text-[1.0625rem] font-bold tracking-tight"
            >
              Signature
            </h2>
            <div
              className="prose-md px-4 pt-2 pb-4 text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: signatureHtml }}
            />
          </section>
        )}

        {regions?.plugins}
      </div>
    </div>
  )
}
