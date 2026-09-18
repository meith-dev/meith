# Translate Meith and extensions

Use language catalogs to translate the board, themes and plugins. Members choose their language at `/usercp/options`; search stemming is a separate [search setting](../administration/search.md).

## Understand language selection

The first supported match wins: the member's explicit choice, then the browser's language preferences, then the board default. Unsupported message keys fall back through the language tag to English; a key missing everywhere is displayed as the key.

Language and timezone are separate preferences. The selected language also sets the page's language and direction.

## Write messages

Messages use dotted keys and the supported ICU MessageFormat syntax:

```json
{
  "nav.home": "Home",
  "stats.posts": "{count, plural, one {# post} other {# posts}}",
  "time.today": "Today, {time}"
}
```

Preserve argument names when translating. Plural/select messages require an `other` branch; use the target language's valid categories. Message formatting supports substitutions, localized numbers, dates/times, plural and select branches. Validate patterns through the catalog tests rather than assuming every ICU extension is implemented.

## Add a board language

1. Copy `packages/i18n/src/catalogs/en.json` to the language tag's filename, such as `de.json`.
2. Translate values while retaining keys and argument names. Missing translations can fall back to English.
3. Register the catalog with a static import in `packages/i18n/src/catalogs/index.ts`.
4. Select the language in a test account and inspect pages, dates, plural forms and direction.
5. Run `pnpm i18n:check` and relevant tests.

`time.hourCycle` is configuration: use `h23`, `h12` or `auto`. Month/day order and plural categories should match the language; do not force English order into translated strings.

## Register extension messages

A message bundle has the shape `{ locale: { key: pattern } }`. Register it with the theme or plugin in `meith.config.ts`. Catalog precedence is board catalog, themes, plugins, then the board configuration's top-level message overrides; later registrations win.

Namespace extension keys, such as `calendar.reminder`, to avoid accidental collisions. Override a core key only when changing its wording intentionally.

Plugins render translated copy through `context.t`. Themes receive already prepared view models, including formatted count/time labels, and their own registered messages. They do not fetch a request-scoped translator.

## Add application copy

In a server component, use `getTranslator()` from `@/server/i18n`. Pass the translator into view builders and use the shared number/time helpers. Do not hard-code a locale at formatting call sites.

Client components receive serializable copy records resolved on the server. Use the existing `src/view/*-copy.ts` pattern for static strings and the established parameterized-message helpers for values only known in the browser.

Settings, error messages and notification definitions retain certain English metadata mirrored in the catalog. Keep both copies in sync; `i18n:check` enforces the relationship. Do not remove a mirror merely because it resembles duplicate prose.

## Verify the reader experience

Check long labels, narrow screens, right-to-left layout where relevant, empty states and forms. Catalog validation catches mismatched keys and arguments, but a browser check catches clipped or confusing text.
