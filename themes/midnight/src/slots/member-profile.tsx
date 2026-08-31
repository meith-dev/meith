import type { MemberProfileModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { groupTags } from '../shared'

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
  const c = (key: string) => fromSlotCopy(copy, `midnight.memberProfile.${key}`)

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
          <h1
            className={['font-mono text-2xl font-semibold', user.nameClass]
              .filter(Boolean)
              .join(' ')}
          >
            {user.username}
          </h1>
          {groupTags(groups, title).map((group) => (
            <p key={group.title} className="font-mono text-xs text-muted-foreground">
              <span className={group.nameClass ?? undefined}>{group.title}</span>
            </p>
          ))}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border border-border p-3 font-mono text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{c('joined')}</dt>
          <dd>
            <time dateTime={joinedAt.iso}>{joinedAt.label}</time>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{c('lastVisit')}</dt>
          <dd>
            {lastVisitAt === null ? (
              c('never')
            ) : (
              <time dateTime={lastVisitAt.iso}>{lastVisitAt.label}</time>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{c('posts')}</dt>
          <dd>{postCount.label}</dd>
        </div>
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>

      {signatureHtml !== null && (
        <section aria-label={c('signatureLabel')} className="border border-border p-3 text-sm">
          <div className="prose-md" dangerouslySetInnerHTML={{ __html: signatureHtml }} />
        </section>
      )}

      {regions?.plugins}

      {actions.length > 0 && (
        <nav aria-label={c('actionsLabel')} className="flex flex-wrap gap-2 font-mono text-xs">
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
