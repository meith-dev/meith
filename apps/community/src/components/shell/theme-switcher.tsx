import { PendingButton } from '@/components/auth/form-controls'
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/shell/appearance-icons'
import { SchemeToggle } from '@/components/shell/scheme-toggle'
import { setAppearanceAction } from '@/server/appearance-actions'
import { getTranslator } from '@/server/i18n'
import { currentColourScheme, currentThemeKey } from '@/server/theme'
import { getBoardThemeStyle } from '@/server/theme-runtime'
import { COLOUR_SCHEMES, type ColourSchemePreference } from '@/view/theme-preference'

const SCHEME_LABEL_KEY: Record<ColourSchemePreference, string> = {
  system: 'appearance.scheme.system',
  light: 'appearance.scheme.light',
  dark: 'appearance.scheme.dark',
}

const CONTROL =
  'h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export async function ThemeSwitcher() {
  const [{ choices }, theme, scheme, t] = await Promise.all([
    getBoardThemeStyle(),
    currentThemeKey(),
    currentColourScheme(),
    getTranslator(),
  ])

  const icons: Record<ColourSchemePreference, React.ReactNode> = {
    light: <SunIcon />,
    system: <MonitorIcon />,
    dark: <MoonIcon />,
  }
  const labels = Object.fromEntries(
    COLOUR_SCHEMES.map((option) => [option, t.t(SCHEME_LABEL_KEY[option])]),
  ) as Record<ColourSchemePreference, string>

  return (
    <section
      aria-label={t.t('appearance.section')}
      className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2"
    >
      {choices.length > 1 && (
        <form action={setAppearanceAction} className="flex items-center gap-2">
          <label htmlFor="appearance-theme" className="text-xs text-muted-foreground">
            {t.t('appearance.theme')}
          </label>
          <select id="appearance-theme" name="theme" defaultValue={theme} className={CONTROL}>
            {choices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.title}
              </option>
            ))}
          </select>
          <PendingButton
            showWorking
            className="h-8 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t.t('appearance.apply')}
          </PendingButton>
        </form>
      )}

      <SchemeToggle
        scheme={scheme}
        groupLabel={t.t('appearance.schemeGroup')}
        labels={labels}
        icons={icons}
      />
    </section>
  )
}
