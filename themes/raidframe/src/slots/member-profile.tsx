import type { ReactNode } from 'react'

import type { MemberProfileModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import {
  BUTTON,
  Frame,
  groupTags,
  HEADING,
  MICRO,
  NUMERIC,
  PanelHead,
  RULE,
  Stamp,
} from '../shared'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border border-border bg-surface px-2.5 py-2">
      <dt className={MICRO}>{label}</dt>
      <dd className={`${NUMERIC} mt-0.5 text-sm text-foreground`}>{children}</dd>
    </div>
  )
}

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
  const c = (key: string) => fromSlotCopy(copy, `raidframe.memberProfile.${key}`)

  return (
    <article className="flex flex-col gap-4 p-4">
      <div className="border border-border bg-card shadow-elevation">
        <div className="flex flex-wrap items-center gap-4 px-4 py-4">
          {avatarUrl !== null && (
            <span className="relative inline-block border border-primary/50 p-1">
              <img src={avatarUrl} alt="" width={72} height={72} className="size-18 object-cover" />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-px -left-px size-2 border-t-2 border-l-2 border-primary"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-px -bottom-px size-2 border-r-2 border-b-2 border-primary"
              />
            </span>
          )}

          <div className="min-w-0">
            <p className={MICRO}>{c('kicker')}</p>
            <h1
              className={[`${HEADING} text-2xl text-foreground`, user.nameClass]
                .filter(Boolean)
                .join(' ')}
            >
              {user.username}
            </h1>
            {groupTags(groups, title).map((group) => (
              <p key={group.title} className={`${MICRO} mt-0.5 text-primary/90`}>
                <span className={group.nameClass ?? undefined}>{group.title}</span>
              </p>
            ))}
          </div>
        </div>
        <div className={RULE} aria-hidden="true" />
      </div>

      <Frame aria-labelledby="member-stats-heading">
        <PanelHead id="member-stats-heading" title={c('statsHeading')} />
        <dl className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-3">
          <Field label={c('posts')}>{postCount.label}</Field>
          <Field label={c('joined')}>
            <Stamp at={joinedAt} />
          </Field>
          <Field label={c('lastVisit')}>
            {lastVisitAt === null ? c('never') : <Stamp at={lastVisitAt} />}
          </Field>
          {fields.map((field) => (
            <Field key={field.label} label={field.label}>
              {field.value}
            </Field>
          ))}
        </dl>
      </Frame>

      {signatureHtml !== null && (
        <Frame aria-labelledby="member-signature-heading">
          <PanelHead id="member-signature-heading" title={c('signatureHeading')} />
          <div
            className="prose-md p-3 text-sm"
            dangerouslySetInnerHTML={{ __html: signatureHtml }}
          />
        </Frame>
      )}

      {regions?.plugins}

      {actions.length > 0 && (
        <nav aria-label={c('actionsAriaLabel')} className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <a key={action.href} href={action.href} className={BUTTON}>
              {action.label}
            </a>
          ))}
        </nav>
      )}
    </article>
  )
}
