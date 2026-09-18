# Build your first theme

Create a theme that inherits the default board, changes its palette and overrides the footer. You need Node.js 22 or newer, npm and a scaffolded board beside the theme directory.

## 1. Create and test the theme

```sh
npx create-meith --theme first-light
cd first-light
npm install
npm test
npm run typecheck
```

The scaffold comes from the tested Iris example. `src/theme.ts` declares the theme, `src/tokens.ts` holds light and dark palettes, and `src/slots/` holds the footer override.

## 2. Customize the presentation

Change a token in `src/tokens.ts` and edit the footer slot. Keep both color schemes readable. Use the [token and shared-control guide](theme-design.md) for the supported values.

Run the tests and typecheck again. Prefer inheriting a slot over copying it unchanged; the parent theme continues to supply the rest of the board.

## 3. Register the theme

From your board directory:

```sh
cd ../my-board
npm install ../first-light
```

Add these imports to `meith.config.ts`:

```ts
import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS, firstLightTheme } from 'first-light'
```

The default scaffold already imports `defaultMessages` from `@meith/theme-default`. Add this entry to the existing `themes` map:

```ts
'first-light': {
  key: 'first-light',
  title: 'First Light',
  tokens: { light: LIGHT_TOKENS, dark: DARK_TOKENS },
  browserThemeColor: BROWSER_THEME_COLOR,
  theme: firstLightTheme,
  messages: defaultMessages,
},
```

Set `defaultTheme` to `first-light` if it should be the default. Preserve other configured themes and plugins.

## 4. Build and inspect

```sh
npm run build
npm run start
```

Select the theme from the board's appearance control, or open **Admin → Themes** on an installed board. Check the footer, a thread, a form and a panel in light and dark mode and at phone width.

A fixture board is sufficient for presentation checks. Use a PostgreSQL-backed board for interactions that save data. Follow [Test a theme](theme-testing.md) for empty and permission-related states, and [Theme contracts](theme-contract.md) before replacing more slots.
