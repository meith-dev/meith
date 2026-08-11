import { cn } from '@meith/ui'
import type { MemberProfileModel } from '@meith/theme-kit'

import {
  BTN,
  BTN_PRIMARY,
  CATEGORY_HEADING,
  Circle,
  NUMERIC,
  PAGE,
  PANEL,
  Stamp,
  count,
} from '../shared'

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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <section className={`${PANEL} overflow-hidden`}>
          <div className="h-24 bg-primary" />

          <div className="px-4 pb-4">
            <div className="-mt-10 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 items-end gap-3">
                <Circle
                  src={avatarUrl}
                  name={user.username}
                  size={80}
                  className="ring-6 ring-card"
                />

                <div className="min-w-0 pb-1">
                  <h1
                    className={cn(
                      'text-xl leading-tight font-bold tracking-tight break-words',
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
                  className="flex shrink-0 flex-wrap items-center gap-2"
                >
                  {actions.map((action, index) => (
                    <a
                      key={action.href}
                      href={action.href}
                      className={index === 0 ? BTN_PRIMARY : BTN}
                    >
                      {action.label}
                    </a>
                  ))}
                </nav>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 rounded-sm bg-surface px-3 py-3 text-center">
              <div>
                <dd className={`text-base font-bold text-foreground ${NUMERIC}`}>
                  {count(postCount)}
                </dd>
                <dt className="text-xs text-muted-foreground">Posts</dt>
              </div>
              <div>
                <dd className="text-sm font-medium text-foreground">
                  <Stamp at={joinedAt} />
                </dd>
                <dt className="text-xs text-muted-foreground">Joined</dt>
              </div>
              <div>
                <dd className="text-sm font-medium text-foreground">
                  {lastVisitAt === null ? 'Never' : <Stamp at={lastVisitAt} />}
                </dd>
                <dt className="text-xs text-muted-foreground">Last visit</dt>
              </div>
            </dl>
          </div>
        </section>

        {fields.length > 0 && (
          <section aria-labelledby="profile-fields-heading" className={PANEL}>
            <h2 id="profile-fields-heading" className={`${CATEGORY_HEADING} px-4 pt-3 pb-1`}>
              About
            </h2>
            <dl className="grid gap-x-6 gap-y-3 px-4 pt-1 pb-4 sm:grid-cols-2">
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
          <section aria-labelledby="profile-signature-heading" className={PANEL}>
            <h2 id="profile-signature-heading" className={`${CATEGORY_HEADING} px-4 pt-3 pb-1`}>
              Signature
            </h2>
            <div
              className="prose-md px-4 pt-1 pb-4 text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: signatureHtml }}
            />
          </section>
        )}

        {regions?.plugins}
      </div>
    </div>
  )
}
