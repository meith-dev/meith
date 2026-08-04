import { Avatar, Card, CardContent, CardHeader, CardTitle, buttonVariants } from '@meith/ui'
import type { MemberProfileModel } from '@meith/theme-kit'

import { NUMERIC, Stamp, pageAt } from '../shared'

/**
 * A member's profile (F33).
 *
 * `fields`, `signatureHtml` and `actions` were in the model from F25 and
 * rendered by nothing until F77's rendering-contract suite asked every theme to
 * render what it is handed. They had all three producers — F59 fills the custom
 * fields, F58 the signature, the page the actions — and no consumer, so a board
 * could define a "Location" field, watch members fill it in, and show it only in
 * the postbit. That is the failure mode a contract test exists to find: nothing
 * was broken, a feature was simply invisible.
 *
 * ## The actions are at the top now
 *
 * "Send a message", "Add as a friend", "Report this member" were a row of
 * outlined links at the bottom of the page, under the signature. Somebody
 * arrives on a profile from a post because they want to *do* something with the
 * person — and on a member with three custom fields and a long signature, every
 * one of those controls was below the fold. They sit beside the name, which is
 * both where they are looked for and where they are meaningful.
 *
 * The three headline figures are `<dl>` and lead with the number for the same
 * reason `BoardStats` does: this is a comparison, not a sentence.
 */
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
    <div className={`${pageAt('max-w-4xl')} flex w-full flex-col gap-4 py-6 sm:py-8`}>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {/*
              F58. Absent avatars render as the member's initial rather than as
              a silhouette — see `@meith/ui`'s Avatar for why a board where
              nobody has uploaded one should not be a column of identical
              shapes.
            */}
            <Avatar src={avatarUrl} name={user.username} size={72} />

            <div className="min-w-0">
              <h1 className="font-serif text-2xl font-semibold tracking-tight break-words">
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

      {/*
        F59's custom fields. Rendered as *text*, never as markup — the same rule
        the postbit follows, and for the same reason: a field a member fills in
        that could carry HTML is stored XSS on a page every member visits.
      */}
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

      {/*
        The signature is pre-rendered BBCode (F36) — the sanitising renderer's
        own output, which is why it may be inserted as HTML here and nowhere a
        theme composes a string itself.
      */}
      {signatureHtml !== null && (
        <Card aria-labelledby="profile-signature-heading">
          <CardHeader>
            <CardTitle id="profile-signature-heading" className="text-sm">
              Signature
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="prose-bb text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: signatureHtml }}
            />
          </CardContent>
        </Card>
      )}

      {/* F80's `profile.panel` region. */}
      {regions?.plugins}
    </div>
  )
}
