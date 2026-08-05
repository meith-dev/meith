import { setConsentAction } from '@/server/consent-actions'
import { getConsentState } from '@/server/consent'

/**
 * The cookie notice, shown only where one is actually needed.
 *
 * Rendered nowhere at all when consent is not required for this request — not
 * hidden with CSS, not rendered and dismissed by a script. A notice a reader
 * outside the EEA never receives is a notice that costs them nothing, and a
 * notice hidden client-side is one that has already been sent.
 *
 * ## What it says, and what it does not
 *
 * It names the one thing being asked about — analytics — and says plainly that
 * the cookies which make signing in and choosing a theme work are not part of
 * the question, because they are not. See `@/view/consent` for the reasoning.
 *
 * A notice that claimed consent for the session cookie would be asking for
 * permission it does not need and cannot act on: refusing would have to mean
 * "you may not sign in", which is not a choice anybody is offering.
 *
 * ## Its position in the document
 *
 * Last in `<body>` and fixed to the bottom of the viewport. Last so that it
 * comes after the page in reading order for a screen reader and for a browser
 * with no CSS — an interstitial that a keyboard user has to tab through before
 * reaching the board is the accessible-in-theory version of a modal nobody can
 * close.
 */
export async function CookieNotice() {
  const { required, choice } = await getConsentState()
  if (!required || choice !== null) return null

  return (
    <aside
      aria-label="Cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card text-card-foreground shadow-lg"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-muted-foreground">
          May we collect anonymous usage statistics? Signing in and choosing a
          theme set cookies that make those features work, and are not part of
          this question — nothing is sent anywhere until you say yes.
        </p>

        <form
          action={setConsentAction}
          className="flex shrink-0 flex-wrap items-center gap-2"
        >
          {/*
            Refusing first, and identical in weight to accepting. Consent is not
            freely given if saying no is the harder of the two, and reading
            order is part of how hard something is.
          */}
          <button
            type="submit"
            name="consent"
            value="denied"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            No thanks
          </button>
          <button
            type="submit"
            name="consent"
            value="granted"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Allow
          </button>
        </form>
      </div>
    </aside>
  )
}

/**
 * The same two buttons, in the appearance strip, once an answer exists.
 *
 * Withdrawing consent has to be as easy as giving it, and a banner that is gone
 * the moment it is answered leaves nowhere to change your mind. This is that
 * somewhere: it sits beside the theme and colour controls, which is where a
 * reader already goes to change how the board treats them, and it appears only
 * for readers who were asked in the first place.
 */
export async function ConsentToggle() {
  const { required, choice } = await getConsentState()
  if (!required || choice === null) return null

  return (
    <form action={setConsentAction} className="flex items-center gap-2 text-muted-foreground">
      <span>
        Usage statistics: {choice === 'granted' ? 'allowed' : 'off'}
      </span>
      <button
        type="submit"
        name="consent"
        value={choice === 'granted' ? 'denied' : 'granted'}
        className="h-8 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {choice === 'granted' ? 'Turn off' : 'Allow'}
      </button>
    </form>
  )
}
