# Test a theme

Check a theme against populated, empty and permission-dependent models, then verify it in a browser. Fixture screens provide repeatable presentation states without modifying real community data.

## Testing a theme

### Browser fixtures

Run `pnpm dev` without a database and open `/fixtures` (the **Theme fixtures**
link in the board navigation). Select any of the 36 slots and its sample state.
The gallery uses the active registered theme and the normal appearance controls,
so theme and light/dark choices persist while moving between samples. For all
five bundled themes and the Meith theme, start with `SHOWCASE_THEMES=1 pnpm dev`.

The gallery reuses the contract models below and composes their regions with
real slots and UI controls. Forum and thread rows sit inside their theme's own
category and listing containers, including themes that use tables. Preview:

- Populated and empty lists, pagination, long titles, link forums, unread,
  pinned, locked, moved, unapproved and deleted threads.
- Guest, member and staff controls; member profiles with and without optional
  fields; posts with avatars, signatures, reputation, badges, image and file
  attachments, rich formatting, edited notes and ignored placeholders.
- Search results and refinements, empty searches, discovery refusals, presence,
  statistics, announcements, every notice tone, and error/redirect screens.
- New-thread, reply and edit composers with the real formatting toolbar,
  attachment picker and editable fields; login, registration and reset forms;
  user, moderator and administrator panel frames and standalone panel pages.
- Poll results and thread ratings in `ThreadView`'s `poll` state, plus sample
  plugin content in the extension regions.

Direct links keep the slot and state, for example
`/fixtures?slot=PostBit&variant=rich&theme=midnight` or
`/fixtures?slot=PanelShell&variant=admincp`. Invalid slots or states return 404.
The gallery is available only with `DATA_SOURCE=fixture`, including a hosted
fixture board, and is excluded from search indexing. It never changes the
request's actor or grants access to protected routes. Submissions are previews;
JavaScript shows a read-only notice; native submissions redisplay the gallery
and its read-only notice without storing the submitted fields.
Sample prose is fixed English; the theme's own copy uses the normal translator.

This covers visual development without accounts or a database. Use the
[PostgreSQL development setup](../contributing/development.md)
for persistence, permission workflows and plugin integrations. The gallery does
not simulate those services. Add missing presentation states to
`apps/community/src/theme/preview.fixture.ts`; contract tests render them across
every registered theme. `gallery.fixture.tsx` supplies app-rendered regions.


`apps/community/src/theme/contract.test.ts` renders every theme registered
in `meith.config.ts` through every stable slot with the same fixture
models, and asserts the properties that are true of any theme:

- Required slots are filled.
- Each one renders.
- The values a reader is owed appear in the output.
- Nothing renders `[object Object]`, `undefined`, or an empty `href`.
- No server slot emits a script.

Registering a theme enrols it — there is no list to add yourself to.

The suite deliberately does not assert appearance. A theme is free to be a
table, a card grid or a wall of text; a suite that required matching the
default theme's markup would make the second theme's job "look like the
first", which is the opposite of the point.
