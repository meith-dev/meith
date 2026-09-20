# Translations

## Locale selection

The board uses the member's language preference, then browser language, then the configured default. Missing messages fall back to English.

Core catalogues live in `packages/i18n`. Copy the English catalogue, translate its values and register the locale in the catalogue index. Keep message keys unchanged. ICU plural/select messages require an `other` branch.

`time.hourCycle` accepts `h23`, `h12` or `auto`.

## Extension messages

Export locale-keyed message catalogues from a theme or plugin. Namespace keys to avoid collisions. The board merges core, theme, plugin and top-level override messages in that order; later values win.

Plugins use the supplied `t` and locale. Themes receive copy prepared by the app. Server code resolves translators; client components receive the required copy as serialisable values. Do not send the whole catalogue to the browser.

Pass the selected locale to `Intl` formatting. Preserve placeholders and avoid joining translated fragments into sentences.

## Check translations

From the Meith source checkout:

```sh
pnpm i18n:check
```

Test missing-key fallback, plural values, long labels and both hour cycles. Verify the rendered page as well as the catalogue check.
