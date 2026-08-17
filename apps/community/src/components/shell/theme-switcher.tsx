import { MonitorIcon, MoonIcon, SunIcon } from '@/components/shell/appearance-icons'
import { BOARD_MEASURE } from '@/components/shell/measure'
import { setAppearanceAction } from '@/server/appearance-actions'
import { currentColourScheme, currentThemeKey } from '@/server/theme'
import { getBoardThemeStyle } from '@/server/theme-runtime'
import {
  COLOUR_SCHEME_LABEL,
  COLOUR_SCHEMES,
  type ColourSchemePreference,
} from '@/view/theme-preference'

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
      <div
        className={`${BOARD_MEASURE} flex flex-wrap items-center justify-end gap-x-4 gap-y-2 py-2`}
      >
        <section
          aria-label="Appearance"
          className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2"
        >
          {choices.length > 1 && (
            <form action={setAppearanceAction} className="flex items-center gap-2">
              <label htmlFor="appearance-theme" className="text-xs text-muted-foreground">
                Theme
              </label>
              <select id="appearance-theme" name="theme" defaultValue={theme} className={CONTROL}>
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
