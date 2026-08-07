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
 * The question, and not an inventory. The headline says the site needs some
 * cookies to work and asks whether it may also set optional ones; *which*
 * cookies, in either category, is behind the disclosure for anybody who wants
 * it. A banner whose first sentence enumerates storage is a banner people learn
 * to dismiss without reading, and the enumeration is the part that ages worst.
 *
 * The specifics stay available rather than being deleted. Consent has to be
 * informed to be consent at all, so "what is stored" is one click away and still
 * reads its two lists out of `@/view/consent` — a hand-written copy would be
 * wrong the first time something was added or renamed, and wrong in the
 * direction that matters, describing less than the board does.
 *
 * The two categories stay distinguished there too. Claiming consent for the
 * session cookie would be asking permission the board does not need and cannot
 * act on: refusing would have to mean "you may not sign in", which is not a
 * choice anybody is offering.
 *
 * ## `sticky`, which is not the same as `fixed`
 *
 * Last in `<body>` so it comes after the page in reading order for a screen
 * reader and for a browser with no CSS — an interstitial a keyboard user has to
 * tab through before reaching the board is the accessible-in-theory version of a
 * modal nobody can close.
 *
 * It **was** `fixed inset-x-0 bottom-0` once, and that was wrong here in a way
 * worth recording: a bar taken out of flow sits on top of whatever the page has
 * at the bottom of the viewport. On this board that is the appearance strip on
 * every page and — the one that mattered — the "Post reply" button at the foot
 * of a reply form. The e2e suite caught it by failing to click a button a member
 * could not have clicked either. Padding the body does not fix that: it reserves
 * space at the *end* of the document, while a fixed bar covers the bottom of the
 * *viewport*, which on a long page is the middle of the thread.
 *
 * `sticky` is the shape that gets the prominence without the bug, because a
 * sticky element **stays in flow**. It occupies its own space at the end of the
 * document, so nothing is ever underneath it and no padding, scroll-margin or
 * compensating rule is needed anywhere; and because it is pinned to `bottom-0`
 * it rides the foot of the viewport for the whole scroll instead of waiting to
 * be found. The one requirement is that no ancestor clips or scrolls
 * independently — `<body>` is the containing block here, and it does neither.
 */
export async function CookieNotice() {
  const { required, choice } = await getConsentState()
  if (!required || choice !== null) return null

  return (
    <aside
      aria-label="Cookies"
      /*
       * `z-40` sits above page content and below anything genuinely modal. The
       * shadow is what separates it from whatever it is currently in front of —
       * a border alone reads as part of the page on a light background.
       */
      className="sticky bottom-0 z-40 border-t border-border bg-card text-card-foreground shadow-[0_-4px_16px_-8px_rgb(0_0_0/0.25)]"
    >
      {/* On the board's measure, so the notice lines up with the page under it. */}
      <div
        className={`${BOARD_MEASURE} flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8`}
      >
        <div className="flex min-w-0 flex-col gap-2">
          {/*
            Generic on purpose. It used to name the optional processing in the
            first sentence, which is the half of a cookie banner people have
            trained themselves to skip — and the half that goes stale. What is
            actually stored is in the disclosure below, where somebody who wants
            it will find it and nobody else has to read it.
          */}
          <p className="text-sm">
            This site uses cookies so that it works correctly. May we also use
            optional ones?
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
