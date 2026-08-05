import { BOARD_MEASURE } from '@/components/shell/measure'
import { setConsentAction } from '@/server/consent-actions'
import { getConsentState } from '@/server/consent'
import { ESSENTIAL_PROCESSING, OPTIONAL_PROCESSING } from '@/view/consent'

const BUTTON =
  'inline-flex h-9 min-w-28 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * The cookie notice, shown only where one is actually needed.
 *
 * Rendered nowhere at all when consent is not required for this request — not
 * hidden with CSS, not rendered and dismissed by a script. A notice a reader
 * outside the EEA never receives is a notice that costs them nothing, and a
 * notice hidden client-side is one that has already been sent.
 *
 * ## What it says
 *
 * It reads its two lists out of `@/view/consent` rather than describing any
 * particular feature. That is deliberate: a notice that named the things this
 * board happens to store today would be wrong the first time one of them was
 * added, renamed or removed, and wrong in the direction that matters — a banner
 * describing less than the board does.
 *
 * It also distinguishes the two categories out loud. Claiming consent for the
 * session cookie would be asking permission the board does not need and cannot
 * act on: refusing would have to mean "you may not sign in", which is not a
 * choice anybody is offering. Saying so is what makes the question that *is*
 * being asked worth reading.
 *
 * ## Its position in the document, and why it is not fixed to the viewport
 *
 * Last in `<body>`, in the ordinary flow. Last so that it comes after the page
 * in reading order for a screen reader and for a browser with no CSS — an
 * interstitial a keyboard user has to tab through before reaching the board is
 * the accessible-in-theory version of a modal nobody can close.
 *
 * It **was** `fixed inset-x-0 bottom-0`, which is what a cookie banner
 * conventionally is, and it was wrong here in a way worth recording: a bar
 * pinned to the bottom of the viewport sits on top of whatever the page has at
 * the bottom of the viewport. On this board that is the appearance strip on
 * every single page, and — the one that mattered — the "Post reply" button at
 * the foot of a reply form. The board's own e2e suite caught it by failing to
 * click a button a member could not have clicked either.
 *
 * Padding the body to make room does not fix it. It reserves space at the
 * *end* of the document, and a fixed bar covers whatever is at the bottom of
 * the *viewport*, which on a long page is the middle of the thread.
 *
 * In flow it covers nothing, needs no z-index, no scroll padding and no
 * compensating margin anywhere else. What it costs is prominence: on a long
 * page a reader has to reach the foot to see it. That is an acceptable trade
 * and arguably the honest one — nothing optional runs until the answer is
 * *yes*, so a notice nobody scrolls to is a notice whose default answer is the
 * conservative one. A banner that blocks the board to extract that answer
 * faster is the pattern this whole feature was written to avoid.
 */
export async function CookieNotice() {
  const { required, choice } = await getConsentState()
  if (!required || choice !== null) return null

  return (
    <aside
      aria-label="Cookies"
      className="border-t border-border bg-card text-card-foreground"
    >
      {/* On the board's measure, so the notice lines up with the page under it. */}
      <div
        className={`${BOARD_MEASURE} flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8`}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm">
            This site stores what it needs in order to work. May we also collect{' '}
            {/* One optional thing today; the sentence still reads if there are two. */}
            {OPTIONAL_PROCESSING.map((item) => item.label.toLowerCase()).join(', and ')}?
          </p>

          {/*
            A disclosure rather than a link to a page: the whole answer is four
            lines long, and sending somebody elsewhere to read four lines is how
            a notice becomes something nobody reads. `<details>` needs no
            JavaScript, which is the same promise the buttons make.
          */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none underline decoration-border underline-offset-2 hover:decoration-foreground">
              What is stored
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <div>
                <p className="font-medium text-foreground">Always, and not part of this question</p>
                <ul className="mt-1 list-disc pl-4">
                  {ESSENTIAL_PROCESSING.map((item) => (
                    <li key={item.key}>{item.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Only if you allow it</p>
                <ul className="mt-1 list-disc pl-4">
                  {OPTIONAL_PROCESSING.map((item) => (
                    <li key={item.key}>{item.label}</li>
                  ))}
                </ul>
                <p className="mt-1">
                  Nothing in this second list runs until you say yes, and you can
                  change your answer at the foot of any page.
                </p>
              </div>
            </div>
          </details>
        </div>

        <form action={setConsentAction} className="flex shrink-0 flex-wrap items-center gap-2">
          {/*
            Refusing first, and identical in weight to accepting — same size,
            same colours, same number of clicks. Consent is not freely given if
            saying no is the harder of the two, and reading order is part of how
            hard something is.
          */}
          <button type="submit" name="consent" value="denied" className={BUTTON}>
            No thanks
          </button>
          <button type="submit" name="consent" value="granted" className={BUTTON}>
            Allow
          </button>
        </form>
      </div>
    </aside>
  )
}

/**
 * The same question again, in the preferences strip, once an answer exists.
 *
 * Withdrawing consent has to be as easy as giving it, and a notice that is gone
 * the moment it is answered leaves nowhere to change your mind. This is that
 * somewhere: beside the appearance controls, which is where a reader already
 * goes to change how the board treats them. It appears only for readers who
 * were asked in the first place.
 */
export async function ConsentToggle() {
  const { required, choice } = await getConsentState()
  if (!required || choice === null) return null

  const granted = choice === 'granted'

  return (
    <section aria-label="Privacy" className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {/*
          Named from the list rather than hardcoded, so a second optional thing
          does not leave this control quietly describing only the first.
        */}
        {OPTIONAL_PROCESSING.length === 1 ? 'Usage statistics' : 'Optional data'}
      </span>
      <form action={setConsentAction}>
        <button
          type="submit"
          name="consent"
          value={granted ? 'denied' : 'granted'}
          aria-pressed={granted}
          className={`inline-flex h-8 items-center rounded-md border border-border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            granted
              ? 'bg-primary font-medium text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {granted ? 'Allowed' : 'Off'}
        </button>
      </form>
    </section>
  )
}
