import type { MemberProfileModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Avatar, buttonVariants, Card, CardContent, CardHeader, CardTitle, cn } from '@meith/ui'

import { groupTags, NUMERIC, PAGE_BODY, Stamp } from '../shared'

export function MemberProfile({
  user,
  avatarUrl,
  title,
  groups,
  joinedAt,
  lastVisitAt,
  postCount,
  signatureHtml,
  fields,
  actions,
  regions,
  copy,
}: MemberProfileModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.memberProfile.${key}`)

  return (
    <div className={PAGE_BODY}>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar src={avatarUrl} name={user.username} size={72} />

            <div className="min-w-0">
              <h1
                className={cn('text-2xl font-semibold tracking-tight break-words', user.nameClass)}
              >
                {user.username}
              </h1>
              {groupTags(groups, title).map((group) => (
                <p key={group.title} className="mt-0.5 text-sm text-muted-foreground">
                  <span className={group.nameClass ?? undefined}>{group.title}</span>
                </p>
              ))}
            </div>
          </div>

          {actions.length > 0 && (
            <nav
              aria-label={c('memberActions')}
              className="flex shrink-0 flex-wrap items-center gap-2"
            >
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
            <dd className={`text-lg font-semibold text-primary ${NUMERIC}`}>{postCount.label}</dd>
            <dt className="text-xs text-muted-foreground">{c('postsLabel')}</dt>
          </div>
          <div>
            <dd className="text-sm font-medium text-foreground">
              <Stamp at={joinedAt} />
            </dd>
            <dt className="text-xs text-muted-foreground">{c('joinedLabel')}</dt>
          </div>
          <div>
            <dd className="text-sm font-medium text-foreground">
              {lastVisitAt === null ? c('never') : <Stamp at={lastVisitAt} />}
            </dd>
            <dt className="text-xs text-muted-foreground">{c('lastVisitLabel')}</dt>
          </div>
        </dl>
      </Card>

      {fields.length > 0 && (
        <Card aria-labelledby="profile-fields-heading">
          <CardHeader>
            <CardTitle id="profile-fields-heading" className="text-sm">
              {c('about')}
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
              {c('signature')}
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
