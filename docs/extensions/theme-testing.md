# Test a theme

## Run contract tests

From the theme package, run its tests and typecheck. The generated contract test renders each registered stable slot and rejects invalid output, unexpected scripts and missing required content.

Keep fixture definitions in `preview.fixture.ts` and gallery rendering in `gallery.fixture.tsx`. Use the sample English copy supplied by the fixtures.

## Preview the slots

From the Meith source checkout:

```sh
pnpm dev
```

Open `/fixtures` on port 3000. Set `SHOWCASE_THEMES=1` to include the showcase theme. Use the fixture links to inspect each slot and variant. Fixtures are read-only and do not require a database.

## Inspect states

Check light/dark schemes, phone/desktop widths and JavaScript disabled. Cover empty lists, long labels, permission-dependent actions, notices, validation errors, pagination and plugin regions.

Confirm keyboard focus, native form controls, readable contrast, touch targets and overflow. A static render test does not verify interactions.

Use a [PostgreSQL-backed board](../operations/local-board.md) for posting, editing, login and panel actions. See [Contributor testing](../contributing/testing.md) for browser tests and screenshots.
