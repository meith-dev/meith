# Testing

Run commands from the repository root. Start with the tests affected by the change.

## Unit and database tests

```sh
pnpm test
pnpm test:coverage
```

Most database suites create isolated PGlite databases and run real migration SQL. `*.pg.test.ts` suites need `TEST_DATABASE_URL`; without it they are skipped. Use PostgreSQL for driver, session-lock and pooled-queue behaviour.

Coverage uses V8 and configured floors. Do not lower a floor to accommodate an untested change.

## Browser tests

```sh
pnpm test:e2e
```

This builds the standalone test app, then starts the suite's database and server. The main board and installer use separate schemas. Running `pnpm exec playwright test` directly reuses the existing build and can test stale code.

Most tests run without JavaScript. Test enhancements separately. Use the fixture helpers for admin/member sessions; the test moderator is not an administrator.

The suite shares state and runs serially. Restore global settings changed by a test. Use fixed clocks where appropriate and allow for task scheduling and the single-connection pool. Do not hide intermittent failures with retries.

Use the fake mailbox to retrieve mail tokens. Request-level tests should use the signed-header helper where HTTP/Secure-cookie behaviour differs from Chromium. Clear the intended cookie by name. Local passkey tests deliberately omit the board URL setting.

## Website tests

```sh
pnpm exec playwright test --config apps/web/e2e/playwright.config.ts
```

The website suite is separate from the board suite. Use `pnpm site:build` to check static docs rendering.

## Screenshots

```sh
pnpm site:shots
```

The screenshot server uses port 3003. Marketing images go in `apps/web/public/shots`; database-only surfaces retain their existing captures until captured against a writable board.

For marketplace captures, use `pnpm site:shots --grep marketplace`, then `pnpm marketplace:gen`. Capture Awards with its browser spec against a built board before copying the resulting images and regenerating the feed.

Inspect screenshots manually. They are not a substitute for interaction, accessibility or no-JavaScript tests.
