import { Avatar, Card, CardContent, CardHeader, CardTitle, buttonVariants, cn } from '@meith/ui'
import type { MemberProfileModel } from '@meith/theme-kit'

import { NUMERIC, PAGE_BODY, Stamp } from '../shared'

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
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar src={avatarUrl} name={user.username} size={72} />

            <div className="min-w-0">
              <h1
                className={cn(
                  'text-2xl font-semibold tracking-tight break-words',
                  user.nameClass,
                )}
              >
                {user.username}
              </h1>
              {title !== null && <p className="mt-0.5 text-sm text-muted-foreground">{title}</p>}
            </div>
          </div>

          {actions.length > 0 && (
            <nav aria-label="Member actions" className="flex shrink-0 flex-wrap items-center gap-2">
              {actions.map((action, index) => (
                <a
                  key={action.href}
                  href={action.href}
                  className={buttonVariants({
                    variant: index === 0 ? 'primary' : 'outline',
                    size: 'sm',
                  })}
                >
                  {action.label}
                </a>
              ))}
            </nav>
          )}
        </CardContent>

        <dl className="grid grid-cols-3 gap-3 border-t border-border px-5 py-4">
          <div>
            <dd className={`text-lg font-semibold text-foreground ${NUMERIC}`}>
              {postCount.toLocaleString('en')}
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
      </Card>

      {fields.length > 0 && (
        <Card aria-labelledby="profile-fields-heading">
          <CardHeader>
            <CardTitle id="profile-fields-heading" className="text-sm">
              About
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label}>
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="text-sm break-words">{field.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {signatureHtml !== null && (
        <Card aria-labelledby="profile-signature-heading">
          <CardHeader>
            <CardTitle id="profile-signature-heading" className="text-sm">
              Signature
            </CardTitle>
          </CardHeader>
          <CardContent>
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
