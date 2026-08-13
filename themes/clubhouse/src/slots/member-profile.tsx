import { Avatar, Card, CardContent, cn } from '@meith/ui'
import type { MemberProfileModel } from '@meith/theme-kit'

import { BUTTON, ClubBar, HEADING, MICRO, NUMERIC, PAGE_BODY, PanelHead, Stamp } from '../shared'

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
    <div className={PAGE_BODY}>
      <Card className="flex items-stretch">
        <ClubBar />

        <div className="min-w-0 flex-1">
          <CardContent className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                src={avatarUrl}
                name={user.username}
                size={56}
                className="rounded-sm border-border"
              />

              <div className="min-w-0">
                <h1 className={cn(HEADING, 'text-xl break-words', user.nameClass)}>
                  {user.username}
                </h1>
                {title !== null && <p className={`${MICRO} mt-0.5`}>{title}</p>}
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
                    className={cn(
                      BUTTON,
                      index === 0
                        ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
                        : 'border border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {action.label}
                  </a>
                ))}
              </nav>
            )}
          </CardContent>

          <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t-2 border-t-secondary bg-surface px-4 py-2.5 text-xs">
            <div className="flex items-baseline gap-1.5">
              <dt className={MICRO}>Posts</dt>
              <dd className={`${NUMERIC} font-semibold text-foreground`}>
                {postCount.toLocaleString('en')}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className={MICRO}>Joined</dt>
              <dd className="font-semibold text-foreground">
                <Stamp at={joinedAt} />
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className={MICRO}>Last visit</dt>
              <dd className="font-semibold text-foreground">
                {lastVisitAt === null ? 'Never' : <Stamp at={lastVisitAt} />}
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      {fields.length > 0 && (
        <Card aria-labelledby="profile-fields-heading">
          <PanelHead id="profile-fields-heading" title="About" />
          <CardContent className="px-4 py-3">
            <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label}>
                  <dt className={MICRO}>{field.label}</dt>
                  <dd className="text-sm break-words">{field.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {signatureHtml !== null && (
        <Card aria-labelledby="profile-signature-heading">
          <PanelHead id="profile-signature-heading" title="Signature" />
          <CardContent className="px-4 py-3">
            <div
              className="prose-md text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: signatureHtml }}
            />
          </CardContent>
        </Card>
      )}

      {regions?.plugins}
    </div>
  )
}
