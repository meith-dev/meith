# Create a theme

Requires Node.js 22+, npm and a scaffolded board.

## 1. Create the package

Run beside your board directory:

```sh
npx create-meith --theme first-light
cd first-light
npm install
npm test
npm run typecheck
```

The theme inherits the default theme. `src/theme.ts` defines it, `src/tokens.ts` defines its palettes, and `src/slots/` contains a footer override.

## 2. Change the theme

Edit the footer and light/dark tokens. Inherit unchanged slots. Rerun tests and typecheck. See [Tokens and controls](theme-design.md) for supported values.

## 3. Register the theme

From your board directory:

```sh
cd ../my-board
npm install ../first-light
```

Add to `meith.config.ts`:

```ts
import { BROWSER_THEME_COLOR, DARK_TOKENS, LIGHT_TOKENS, firstLightTheme } from 'first-light'
```

Add this entry to the existing `themes` map. The board scaffold already imports `defaultMessages` from `@meith/theme-default`.

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

Set `defaultTheme` to `first-light` to make it the default. Preserve existing themes and plugins.

## 4. Check the result

```sh
npm run build
npm run start
```

Select the theme in the appearance control or **Admin → Themes**. Check a thread, form, panel and footer in both schemes and at phone width. Fixtures cover presentation; saving data requires PostgreSQL. See [Theme testing](theme-testing.md).
