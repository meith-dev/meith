import type { MemberProfileModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Avatar, cn } from '@meith/ui'

import {
  Action,
  BODY_MEASURE,
  CARD,
  groupTags,
  LABEL,
  Label,
  Mark,
  META,
  NUMERIC,
  PAGE_BODY,
  PAGE_TITLE,
  Stamp,
  TOUCH,
} from '../shared'

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
  const c = (key: string) => fromSlotCopy(copy, `vershell.memberProfile.${key}`)

  return (
    <div className={PAGE_BODY}>
      <header className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end">
        <div className="flex min-w-0 flex-col gap-4">
          <Label>{c('label')}</Label>
          <div className="flex min-w-0 items-center gap-5">
            <Avatar src={avatarUrl} name={user.username} size={72} className="rounded-full" />
            <div className="min-w-0">
              <h1
                className={cn(
                  PAGE_TITLE,
                  'text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)]',
                  user.nameClass,
                )}
              >
                {user.username}
              </h1>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {groupTags(groups, title).map((group) => (
                  <Mark key={group.title} className={group.nameClass ?? undefined}>
                    {group.title}
                  </Mark>
                ))}
              </p>
            </div>
          </div>
        </div>

        {actions.length > 0 && (
          <nav
            aria-label={c('memberActions')}
            className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:justify-end"
          >
            {actions.map((action, index) =>
              index === 0 ? (
                <Action key={action.href} href={action.href}>
                  {action.label}
                </Action>
              ) : (
                <a
                  key={action.href}
                  href={action.href}
                  className={`${LABEL} inline-flex items-center py-2 transition-colors hover:text-foreground ${TOUCH}`}
                >
                  {action.label}
                </a>
              ),
            )}
          </nav>
        )}
      </header>

      <dl className={`${CARD} grid grid-cols-3 gap-x-6 p-5`}>
        <div className="min-w-0">
          <dd
            className={`${NUMERIC} truncate text-[1.625rem] leading-none font-semibold tracking-[-0.04em] text-foreground`}
          >
            {postCount.label}
          </dd>
          <Label as="dt" className="mt-2">
            {c('postsLabel')}
          </Label>
        </div>
        <div className="min-w-0">
          <dd className="truncate text-[0.95rem] leading-none font-medium text-foreground sm:text-lg">
            <Stamp at={joinedAt} />
          </dd>
          <Label as="dt" className="mt-2">
            {c('joinedLabel')}
          </Label>
        </div>
        <div className="min-w-0">
          <dd className="truncate text-[0.95rem] leading-none font-medium text-foreground sm:text-lg">
            {lastVisitAt === null ? c('never') : <Stamp at={lastVisitAt} />}
          </dd>
          <Label as="dt" className="mt-2">
            {c('lastVisitLabel')}
          </Label>
        </div>
      </dl>

      {fields.length > 0 && (
        <section aria-labelledby="profile-fields-heading" className={`${CARD} px-5 py-4`}>
          <Label as="h2" id="profile-fields-heading">
            {c('about')}
          </Label>
          <dl className="mt-2 grid sm:grid-cols-2 sm:gap-x-8">
            {fields.map((field) => (
              <div key={field.label} className="border-t border-border py-3">
                <dt className={`${META} text-xs`}>{field.label}</dt>
                <dd className="mt-0.5 text-[0.9375rem] break-words">{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {signatureHtml !== null && (
        <section aria-labelledby="profile-signature-heading" className={`${CARD} px-5 py-4`}>
          <Label as="h2" id="profile-signature-heading">
            {c('signature')}
          </Label>
          <div
            className={`prose-md mt-3 ${BODY_MEASURE} text-sm text-muted-foreground`}
            dangerouslySetInnerHTML={{ __html: signatureHtml }}
          />
        </section>
      )}

      {regions?.plugins}
    </div>
  )
}
