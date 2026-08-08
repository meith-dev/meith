import { BOARD_MEASURE } from '@/components/shell/measure'
import {
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from '@/components/shell/appearance-icons'
import { setAppearanceAction } from '@/server/appearance-actions'
import { currentColourScheme, currentThemeKey } from '@/server/theme'
import { getBoardThemeStyle } from '@/server/theme-runtime'
import {
  COLOUR_SCHEMES,
  COLOUR_SCHEME_LABEL,
  type ColourSchemePreference,
} from '@/view/theme-preference'

/**
 * The member's appearance controls.
 *
 * ## It ships no JavaScript
 *
 * Ordinary forms and submit buttons. React makes them partial updates when
 * scripting is on and changes nothing about the behaviour when it is off (D06).
 *
 * ## Why the theme is a menu and the colour scheme is not
 *
 * Because they are different sizes of question. A board has two or three themes
 * and could have eleven, so the theme control has to be one that does not grow
 * — a `<select>` is the same width whatever is in it. The colour scheme has
 * exactly three answers, for ever, and three icons are smaller than a menu as
 * well as being one press instead of two.
 *
 * The menu is deliberately the same shape as the community jump box directly above
 * it: a label, a `<select>`, a small submit. That is not imitation for its own
 * sake — the two sit in the same block of chrome, and a reader who has used one
 * should not have to work out that the other behaves the same way. It is also
 * why the theme control keeps its "Apply": a `<select>` cannot submit itself
 * without scripting, and the jump box has always been honest about that.
 *
 * **With one theme there is no control at all.** Not a disabled menu, not a
 * menu with one option — nothing. A board that installs one theme should not
 * carry a control for choosing between it and itself, and the colour scheme
 * still works on its own.
 *
 * ## Why the colour scheme has no visible label
 *
 * This strip is on every page and most readers set these once, so it has to
 * earn its width. The word "Colours" cost more room than the three buttons it
 * introduced and told nobody anything the sun, the monitor and the moon do not.
 *
 * It is still there as a *name*, on the group rather than on the page:
 * `aria-label` on the `role="group"`, `sr-only` text inside every button, and
 * `title` for a pointer. A screen reader announces "Colour scheme, Dark,
 * pressed"; a sighted reader sees a moon. Nothing was removed except the pixels
 * — which is the distinction between compacting a control and hiding one.
 *
 * ## Two forms, and the bug that says why
 *
 * The theme menu and the colour-scheme buttons are **separate forms**. The
 * first draft had them in one, on the reasoning that a submit button
 * contributes its own `name=value` and no other button's — which is true of
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
 * ## Why the app composes this rather than a theme
 *
 * The same reason `PageShell` is not itself a slot, and the same reason F80's
 * `header.notice` region is app-rendered: *whether a board offers a theme
 * switcher* is the application's decision, not one each theme should be able to
 * make — a theme that forgot to render it would strand every member who had
 * chosen a different one, in that theme, with no way back. The slot contract
 * is frozen (F77) and this adds nothing to it.
 */

const SCHEME_ICON: Record<ColourSchemePreference, () => React.ReactNode> = {
  light: SunIcon,
  system: MonitorIcon,
  dark: MoonIcon,
}

const CONTROL =
  'h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export async function ThemeSwitcher() {
  const [{ choices }, theme, scheme] = await Promise.all([
    getBoardThemeStyle(),
    currentThemeKey(),
    currentColourScheme(),
  ])

  return (
    <div className="border-t border-border bg-card text-card-foreground">
      {/*
        `BOARD_MEASURE`, not a width of its own. This strip sits directly under
        the community jump box, which is a *theme* slot on the theme's measure — so a
        strip on any other width is one whose controls stop short of the page
        they belong to, which is exactly what a hand-written `max-w-5xl` here
        did. The constant is the app's half of that agreement and it already
        existed; see `measure.ts` for why it is a convention rather than a
        guarantee.
      */}
      <div className={`${BOARD_MEASURE} flex flex-wrap items-center justify-end gap-x-4 gap-y-2 py-2`}>
        {/*
          A landmark, not decoration. This strip is the last thing on every page
          and holds the only controls outside the board's own navigation, so it
          is worth being able to jump to.
        */}
        <section
          aria-label="Appearance"
          className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2"
        >
          {choices.length > 1 && (
            <form
              action={setAppearanceAction}
              className="flex items-center gap-2"
            >
              <label
                htmlFor="appearance-theme"
                className="text-xs text-muted-foreground"
              >
                Theme
              </label>
              <select
                id="appearance-theme"
                name="theme"
                defaultValue={theme}
                className={CONTROL}
              >
                {choices.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.title}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-8 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Apply
              </button>
            </form>
          )}

          <form action={setAppearanceAction}>
            <span
              role="group"
              aria-label="Colour scheme"
              className="inline-flex items-center overflow-hidden rounded-md border border-border text-muted-foreground"
            >
              {COLOUR_SCHEMES.map((option) => {
                const Icon = SCHEME_ICON[option]
                const label = COLOUR_SCHEME_LABEL[option]
                const selected = scheme === option
                return (
                  /*
                   * `aria-pressed` rather than a radio group, because these *are*
                   * buttons — each one performs the change rather than recording
                   * an intention to. The selected cell is filled with `primary`,
                   * the one token every board brands, so the control picks up a
                   * board's own colour rather than inventing one.
                   */
                  <button
                    key={option}
                    type="submit"
                    name="scheme"
                    value={option}
                    title={label}
                    aria-pressed={selected}
                    className={`inline-flex h-8 items-center justify-center border-border px-2.5 transition-colors [&:not(:first-child)]:border-l focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <Icon />
                    {/*
                    The word is the accessible name and stays in the document —
                    hidden visually rather than removed, so the control is never
                    three unlabelled glyphs to a screen reader.
                  */}
                    <span className="sr-only">{label}</span>
                  </button>
                )
              })}
            </span>
          </form>
        </section>
      </div>
    </div>
  )
}
