# Languages

Meith renders in the reader's language when it has a catalog for it, and in
English when it does not. This document is how a board picks its language, how
you add a new one, and how a theme or a plugin ships its own words.

Everything here is served by one package, `@meith/i18n`. It has no dependencies
and no network calls: messages are ordinary JSON compiled into the build, and
the formatting comes from `Intl`, which every runtime Meith supports already
carries.

## How a page picks its language

Three things are asked, in this order, and the first that names a language the
board can serve wins:

1. **The member's own choice**, set in *Your control panel → Options*. Left at
   *Automatic*, it names nothing and the next question is asked.
2. **The browser's `Accept-Language` header**, in the order of preference the
   browser sent. `pt-PT` is served by a `pt-BR` catalog if that is the only
   Portuguese the board has — a near miss beats English.
3. **The board default**, set in *Admin CP → Settings → Display → Default
   language*. It is `en` on a fresh board.

The answer sets `<html lang>` and `<html dir>`, so screen readers, spell
checkers and hyphenation follow the same decision the text did, and a
right-to-left language lays the page out right-to-left.

Language and timezone are separate preferences and always have been: a Berliner
reading in English still wants their timestamps in `Europe/Berlin`. Setting one
never moves the other.

## Messages

A message is an ICU MessageFormat pattern under a dotted key:

```json
{
  "nav.home": "Home",
  "stats.posts": "{count, plural, one {# post} other {# posts}}",
  "time.today": "Today, {time}"
}
```

The parts of ICU that Meith implements:

| Written | Does |
|---|---|
| `{name}` | Substitutes a value. A missing one renders as nothing, never as `undefined`. |
| `{n, number}` | Formats by the locale — `1,234` in English, `1.234` in German. |
| `{n, number, percent}`, `{n, number, integer}`, `{n, number, ::group-off .0}` | Number styles, and the skeleton subset for grouping and fraction digits. |
| `{at, date, short}`, `{at, time, medium}` | Dates and times, in the viewer's timezone. |
| `{n, plural, one {…} other {…}}` | Picks the plural category **the reader's language actually has** — Russian has `one/few/many/other`, Arabic adds `zero` and `two`, Japanese has only `other`. `#` is the number, formatted. |
| `{n, plural, =0 {…} …}` | An exact match, preferred over any category. |
| `{n, plural, offset:1 …}` | Subtracts from `#` without changing which category is chosen. |
| `{n, selectordinal, one {#st} …}` | Ordinals. |
| `{g, select, female {…} male {…} other {…}}` | Branches on a value. |
| `'{'`, `''` | An escaped brace, and a literal apostrophe. |

Every plural and select must carry an `other` branch, and a plural may only name
a real CLDR category. Both are refused when the catalog is parsed, which happens
in the test suite, so a typo is a failing build rather than a branch that
silently never matches.

A key nothing translates falls back through the language tag — `pt-BR`, then
`pt`, then English — and a key nothing carries at all renders as itself, which
is ugly on purpose: a missing message should be visible, not invisible.

## Adding a language

1. Copy `packages/i18n/src/catalogs/en.json` to a new file named for the
   language tag — `de.json`, `pt-BR.json`. Keep the keys; translate the values.
   You do not have to translate all of them. Anything you leave out falls back
   to English, so a half-finished catalog is a useful catalog.

2. Register it in `packages/i18n/src/catalogs/index.ts`:

   ```ts
   import de from './de.json'
   import en from './en.json'

   export const BOARD_CATALOG: CatalogSource = {
     id: BOARD_CATALOG_ID,
     messages: { en, de },
   }
   ```

   Registration is a static import because nothing is discovered by scanning a
   directory at runtime — a bundle contains only what the bundler could see.

3. Set the board default, or pick the language in your control panel, and read a
   page.

Three things are worth knowing while you translate:

- **`time.hourCycle`** is not prose. It is `h23` for a 24-hour clock, `h12` for
  a 12-hour one, or `auto` to take whatever the language conventionally uses.
- **Word order is yours.** `time.thisYear` is `{day} {month}, {time}` in
  English; write `{month} {day}, {time}` if that is how your language dates
  things. The month name itself comes from `Intl`, in your language, whatever
  the pattern says.
- **Plural categories are yours too.** English needs `one` and `other`. Write
  the categories your language has; nothing in the board assumes two.

`pnpm i18n:check` and `pnpm test` between them prove that every message in every
catalog parses, that a translation names no key English does not have, and that
a translated message reads the same arguments as the English one — so a `{count}`
that became `{anzahl}` fails rather than rendering blank.

## Catalogs from a theme or a plugin

Both contribute through `community.config.ts`, next to where they are installed:

```ts
import { defineForumConfig } from '@meith/core'
import { clubhouseMessages } from '@meith/theme-clubhouse'

export default defineForumConfig({
  themes: {
    clubhouse: { key: 'clubhouse', title: 'Clubhouse', tokens, theme, messages: clubhouseMessages },
  },
  defaultTheme: 'clubhouse',
  plugins: [{ key: 'dues', plugin: dues, messages: duesMessages }],
  messages: { en: { 'nav.home': 'The Lobby' } },
})
```

A `messages` bundle is `{ [locale]: { [key]: pattern } }` — the same shape as a
catalog file, one per language.

Later registrations win, and the order is board catalog, then themes, then
plugins, then the `messages` at the top of the config. So a theme may reword the
board, a plugin may reword a theme, and the board's own `messages` block has the
last word on all of them. That is how you rename *Threads* to *Missions* without
forking anything.

Namespace your own keys — `dues.expired`, not `expired` — and use the board's
keys only when you mean to override them.

## Working on the board itself

New user-facing copy goes in the catalog. Two mechanical checks hold the line,
both run by `pnpm verify`:

- **`no-fixed-locale-format`**, one of the textual guards in
  `scripts/guards.config.mjs`, refuses a locale named at a formatting call site
  — `toLocaleString('en')` and its bare no-argument form alike. Format through
  the viewer's `Translator`, and hand a theme a `CountModel` rather than a
  number.
- **`pnpm i18n:check`** proves the catalog and the code agree: that every key a
  call site names exists, that no message has outlived the call site that read
  it, that the mirrored definitions still match, and that no view builder gained
  a new English string.

### Getting a translator

In a server component, `getTranslator()` from `@/server/i18n` returns one bound
to the viewer's language *and* timezone. It is request-scoped, so awaiting it
repeatedly costs nothing.

```ts
const t = await getTranslator()

t.t('stats.posts', { count: forum.postCount }) // '1,204 posts'
t.number(1204) // '1,204'
t.list(['a', 'b', 'c']) // 'a, b, and c'
```

View builders take it as `t` in their input object and pass it to
`formatTime()`, which is why timestamps carry a language as well as a zone. A
builder called without one falls back to `untranslated()`, an English translator
in UTC — which is what tests and the fixture board use.

Themes are never handed a translator, or a locale: a slot receives a view model
and nothing else, by design. Numbers reach a theme already formatted, as a
`CountModel` carrying both the string and the number — the same bargain
`TimeModel` has always made for timestamps. So a view builder that puts a
counter in a model wraps it with `count()` from `@/view/count`, and the theme
renders `postCount.label`. Anything a theme needs to *say* rather than count
belongs in its own catalog. [The theme API](./theme-api.md) has the theme side.

A plugin is different: it renders arbitrary UI rather than filling a slot, so
its page context carries the board `Translator` as `t` as well as its `locale`.
Its catalog is registered from the plugin entry in `community.config.ts`; pages
read `context.t.t('plugin.key')`, which lets the board override a plugin's words
without the plugin needing to know how catalogs are assembled.

Plugin manifests retain English fallbacks for the operator CLI and generated
reference, and carry `nameKey`, `descriptionKey`, `labelKey` or `titleKey` for
board-rendered metadata. A title or description that interpolates data also
carries its `*Args`; the board resolves the key when it builds the page or panel.

### The three mirrored surfaces

Setting labels in `packages/settings/src/definitions.ts`, error messages in
`packages/core/src/errors.ts` and notification kinds in
`packages/notifications/src/kinds.ts` keep their English text in place *and*
carry it in the catalog. They are the exception, and the reasons differ:

- **Errors have no choice.** `@meith/core` is the bottom of the stack and
  dependency-cruiser's `core-depends-on-nothing` forbids it a sibling import,
  so `errors.ts` has no catalog to read. An error raised in the worker or the
  CLI carries English of its own, and the key is what lets a render boundary
  upgrade it.
- **Notification kinds are half-forced.** A plugin registers a kind with plain
  `title` and `description` strings through `@meith/plugin-kit`, so the field
  stays a string; the nine built-in kinds are mirrored to match.
- **Settings are a readability choice.** Nothing outside the admin panel reads
  a setting's label, so they could have moved wholesale. A definition that says
  `label: 'Board name'` tells you what a setting is where you are editing it,
  and one that says `labelKey: 'setting.board.name.label'` sends you to another
  file to find out.

`pnpm i18n:check` compares the two copies character for character and fails on
any difference, so they cannot drift: adding a setting fails the build until its
`setting.<key>.label` and `setting.<key>.description` exist and match.

### Copy in a client component

A client component cannot ask for a translator — a `'use client'` boundary
only passes JSON — so its words arrive as a **copy record**: a plain
`Readonly<Record<string, string>>` of catalog keys to resolved strings, built
by the rendering page with a helper from `src/view/*-copy.ts` and passed as a
`copy` prop. `fromCopy(copy, key)` reads one, and a missing key renders as
itself, same as everywhere else. A sentence the server can finish — arguments
known at render time — is resolved in the helper with `t.t(key, args)`; a
sentence wrapped around a link or a `<code>` element is split by
`splitAround()` into `…Lead`/`…Tail` entries so the translator still writes
one sentence with one placeholder.

A sentence only the browser can finish — a live count, a per-row value —
travels as its **raw ICU pattern** (`patternCopy()` on the server,
`formatFromCopy()` in the component). `@meith/i18n` has no dependencies and
formats with `Intl`, so the same `formatMessage` runs client-side and a
client-side count still picks the right plural category in every language.

Two things skip the prop entirely. Form chrome that every form shares —
“Working…”, “Not saved.”, the markdown editor's toolbar and help, the
attachment field, multi-quote — comes from a `CopyProvider` context the root
layout fills once, read with `useCopy()`. And a component rendered only on the
server just calls `getTranslator()` itself.

### The rest of the copy, and the ratchet

The view builders under `apps/community/src/view/` are done, and so are the
error, page and component surfaces: domain packages raise their validation
errors through `msg()` — a catalog key, its ICU arguments, and the English the
key renders to, so logs and tests read the same sentence they always did while
a reader gets it translated with the limit interpolated — the server pages'
browser-tab titles, frame titles and whole-text headings resolve through the
request's translator, and every client component under `src/components/`
(member forms, the composer, moderation tools, the installer, the whole admin
panel) reads from a copy record. The built-in themes and the complete Dues UI
are extracted too. What still holds English is the shrinking long tail of
server-side fragments and packages — where most of the count is the demo
board's fixture posts and the deliberately mirrored setting definitions, which
are staying English on purpose.

They cannot grow. `scripts/i18n-baseline.json` records how much English each
file holds — string literals and JSX text alike — and `pnpm i18n:check` fails
any file that gains one. A file not listed must hold none at all, so new code
starts translated. When you finish extracting a file, run `pnpm i18n:baseline`
to bank it; the numbers only ever go down.

The ratchet only measures surfaces that render to a board member: the board
app, the built-in themes, plugins, and the `src/` of every other package
except `@meith/i18n` and `@meith/testkit` themselves. It does not measure a
program that talks to a terminal instead of a browser. The operator CLI under
`apps/cli/` was never on that list, and `packages/create-meith/` is the same
kind of program: `npx create-meith` runs on a developer's machine before a
board, a database, or a member's language preference exist, and it ships as a
standalone `npx` package with no dependency on `@meith/i18n` — pulling one in
just to translate `--help` text would mean publishing the whole catalog
alongside it for a tool that has no reader to serve it to. Terminal copy in
both places stays English on purpose, the same way a stack trace does.

A handful of the counts are noise rather than copy: `view/feed.ts` and
`view/sso-hand-off.ts` build XML and HTML documents whose fragments read like
prose to the counter, and `view/setting-groups.ts` holds the group labels the
catalog mirrors. They sit in the baseline at a fixed number and stay there.

`packages/core/src/env.ts`, `packages/drivers/src/files/blob-file-store.ts`
and `packages/drivers/src/files/keys.ts` are noise of the same sort. `env.ts`
is the only entry here that has gone up.
Environment parsing runs once, at boot, before there is a request, a board or
a member — so there is no locale to pick and no `Translator` to take one. A
configuration that would fail silently says so there or nowhere: refusing
`FILESTORE_DRIVER=local` on a platform with an ephemeral disk, or SMTP on port
25 where the egress is blocked and every message would hang until the function
timed out.

That entry went from 27 to 55 when the Vercel template stopped asking an
operator for values its linked integrations already publish. `env.ts` now
derives `CACHE_DRIVER`, `FILESTORE_DRIVER`, `REDIS_URL` and
`DIRECT_DATABASE_URL` from those, and refuses to boot when it cannot — naming
every variable it searched, because that name is the only clue an operator has
when their store publishes something this board has never heard of. Five
refusals and one malformed-credential message account for the whole raise: the
counter charges per quoted fragment, so a message wrapped over eight lines is
eight strings and not eight messages. Each one is read in a deploy log, by the
person who started the deploy, in the same language as the log around it. See
[Running on Vercel](./vercel.md#when-a-derivation-cannot-resolve) for what each
refusal means.

`packages/drivers/src/files/blob-file-store.ts` went from 5 to 13 for the
same reason, one layer down. A Vercel Blob store attached to a project
publishes a store id and no token, so the driver has two credential shapes to
tell apart and a first-upload failure to explain when the platform supplies
neither — all of it thrown as `ConfigurationError` from a driver constructed
at boot, and read by whoever ran the deploy or the backup.

One of that file's counted strings is not copy in any sense and must not be
edited as though it were: `BLOB_NO_CREDENTIALS` is the literal sentence
`@vercel/blob` throws when it can find no credential, and the driver matches
on it to replace that error with one that names the store and the cause. It
is a sentinel for somebody else's string, and translating or rephrasing it
would silently stop the match. A test asserts the same literal is still
present in the installed SDK, so a reword upstream fails the build rather
than passing quietly.

The file store's count is not copy at all — `url()` builds an object
URL per storage shape, and the counter reads the template's fragments as prose.
Neither surface has ever rendered to a member.

The four largest entries in `packages/api/` are the same kind of thing. The
route registry, the schema components, the OpenAPI builder and the reference
renderer between them hold the text of one document — the OpenAPI 3 spec at
`/api/v1/openapi.json` and the `docs/rest-api.md` generated from it. That
document describes the board to a person writing a client against it, in the
same language the rest of `docs/` is written in, and it is never rendered to a
member in any language. Translating it would mean translating the
documentation, which is a different decision from translating the board. They
sit in the baseline for the same reason `view/feed.ts` does.

Extracting a file is the same four steps every time: give each string a key in
`en.json`, replace the literal with `t.t(key)` — or `msg(key, args)` where an
error is thrown, or `await tr(key)` in a page or action — take a `Translator`
where the code does not already have one, and hand it in. Code without one
falls back to English, so nothing breaks half-way through.
