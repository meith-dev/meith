import { ConsentToggle } from '@/components/shell/cookie-notice'
import { setAppearanceAction } from '@/server/appearance-actions'
import { currentColourScheme, currentThemeKey } from '@/server/theme'
import { getBoardThemeStyle } from '@/server/theme-runtime'
import { COLOUR_SCHEMES, COLOUR_SCHEME_LABEL } from '@/view/theme-preference'

/**
 * The member's appearance control.
 *
 * ## It ships no JavaScript
 *
 * Ordinary forms and submit buttons. React makes them partial updates when
 * scripting is on and changes nothing about the behaviour when it is off (D06).
 *
 * ## Two forms, and the bug that says why
 *
 * The theme menu and the colour-scheme buttons are **separate forms**. The
 * first draft had them in one, on the reasoning that a submit button
 * contributes its own `name=value` and no other button’s — which is true of
 * *buttons* and not of the form. A `<select name="theme">` posts whatever it is
 * showing, from any submit button in the same form. So pressing "Dark" also
 * wrote a theme cookie pinning the member to the theme the menu happened to
 * display, and an administrator changing the board default afterwards would
 * silently not reach them.
 *
 * Nothing failed. The cookie was valid, the value was the one on screen, and
 * every unit test passed; it was found by driving the page in a browser and
 * reading `document.cookie`. Splitting the forms is the fix, and it is the kind
 * of fix that reads as an arbitrary preference unless the reason is written
 * down.
 *
 * The alternative — a client island writing `localStorage` — could only ever
 * repaint, because the theme decides the markup and the markup comes from the
 * server. It would also have to render nothing until it had mounted, to avoid
 * guessing its own selected value.
 *
 * ## Why the app composes it rather than a theme
 *
 * The same reason `PageShell` is not itself a slot, and the same reason F80's
 * `header.notice` region is app-rendered: *whether a board offers a theme
 * switcher* is the application's decision, not one each theme should be able to
 * make — a theme that forgot to render it would strand every member who had
 * chosen a different one, in that theme, with no way back. The v1 slot contract
 * is frozen (F77) and this adds nothing to it.
 */
export async function ThemeSwitcher() {
  const [{ choices }, theme, scheme] = await Promise.all([
    getBoardThemeStyle(),
    currentThemeKey(),
    currentColourScheme(),
  ])

  return (
    <section aria-label="Appearance" className="border-t border-border bg-card text-card-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 text-xs sm:px-6">
        <span className="font-medium text-foreground">Appearance</span>

        {choices.length > 1 && (
          <form action={setAppearanceAction} className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-muted-foreground">
              <span>Theme</span>
              <select
                name="theme"
                defaultValue={theme}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {choices.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.title}
                  </option>
                ))}
              </select>
            </label>
            {/*
              A `<select>` cannot submit itself without scripting, so this is
              the one control on the strip that takes two steps. Everything
              else is one press.
            */}
            <button
              type="submit"
              className="h-8 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Apply
            </button>
          </form>
        )}

        <form action={setAppearanceAction}>
          <fieldset className="flex items-center gap-2 text-muted-foreground">
            <legend className="float-left mr-2">Colours</legend>
            <span className="inline-flex overflow-hidden rounded-md border border-border">
              {COLOUR_SCHEMES.map((option) => (
                /*
                 * `aria-pressed` rather than a radio group, because these *are*
                 * buttons — each one performs the change rather than recording
                 * an intention to.
                 */
                <button
                  key={option}
                  type="submit"
                  name="scheme"
                  value={option}
                  aria-pressed={scheme === option}
                  className={`h-8 px-3 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                    scheme === option
                      ? 'bg-primary font-medium text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {COLOUR_SCHEME_LABEL[option]}
                </button>
              ))}
            </span>
          </fieldset>
        </form>

        {/*
          A sibling, never a child: a `<form>` inside a `<form>` is invalid HTML
          and browsers resolve it by dropping the inner one, which would
          silently turn this button into one that posts an appearance form.

          It renders nothing for a reader who was never asked about cookies.
        */}
        <ConsentToggle />

        <span className="text-muted-foreground">Remembered in this browser.</span>
      </div>
    </section>
  )
}
