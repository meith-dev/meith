import { Alert, AlertDescription, AlertTitle, Card } from '@meith/ui'
import type { PostFormModel } from '@meith/theme-kit'

import { MUTED_LINK, pageAt } from '../shared'

/**
 * The composer page frame (F39).
 *
 * The theme owns the page; the app owns the `<form>` in `regions.form`, because
 * that element carries a Server Action reference and those never cross the theme
 * contract (D38/D42). Everything visible here — heading, cancel, where the
 * toolbar island sits — is still the theme's to change.
 *
 * ## Narrower than the rest of the board, on purpose — and now actually narrower
 *
 * Every other page here is `max-w-6xl`, because a listing is a table and tables
 * want width. A composer is a single column of text that somebody is going to
 * *write* in, and a textarea eleven hundred pixels wide produces lines nobody
 * can track back to the start of — the same reason `.prose-md` caps a rendered
 * post at 72ch. The two measures agree, which means what an author types is
 * shaped roughly like what a reader will get.
 *
 * That paragraph was here already and the page was full width anyway: it read
 * `${PAGE} max-w-3xl`, and two `max-w-*` utilities on one element do not
 * compose — Tailwind emits both at equal specificity and the later one wins.
 * `pageAt` takes the width instead, so the collision cannot be written.
 *
 * The cancel control is a link and stays a link: it navigates, it does not
 * submit, and making it look like a button beside the form's own submit is how
 * somebody loses a paragraph they meant to keep.
 */
export function PostForm({
  heading,
  cancelHref,
  cancelLabel,
  errorMessage,
  regions,
}: PostFormModel) {
  return (
    <div className={`${pageAt('max-w-3xl')} flex w-full flex-col gap-5 py-6 sm:py-8`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{heading}</h1>
        <a href={cancelHref} className={`text-sm ${MUTED_LINK}`}>
          {cancelLabel}
        </a>
      </div>

      {/*
        The route's own error — "this forum is closed", say. Errors raised by a
        submit come back through the form itself, which is why both exist and
        why this one is above the card rather than inside it: it is a statement
        about whether the form should be used at all.
      */}
      {errorMessage !== null && (
        <Alert tone="error">
          <AlertDescription>
            <AlertTitle>Cannot post.</AlertTitle> {errorMessage}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        {/*
          The toolbar island, when there is one. `null` here must leave a
          working plain-textarea form: the island enhances, it never enables.
        */}
        {regions.toolbar}
        <div className="p-4 sm:p-5">{regions.form}</div>
      </Card>
    </div>
  )
}
