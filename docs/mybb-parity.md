# MyBB parity decisions

R4.2 closes with: *"MyBB's real resolution has twenty years of special cases.
Implement the rules above. Where an imported board diverges, record it in
`docs/mybb-parity.md` with a decision — do not guess silently."*

This file is that record. Every entry states what MyBB does, what we do, and
why. An entry is added when a divergence is **chosen**, not when one is
discovered by accident — a surprise is a bug, not a parity decision.

---

## flood-intervals

**MyBB** stores `searchfloodtime` (and `floodtime`) as a per-usergroup numeric
column, combined like any other numeric limit.

**We** do not model flood intervals as a permission field at all. The board
setting `search.flood_seconds` holds the interval, and the existing
`canBypassFloodCheck` boolean permission exempts a group from it.

**Why.** R4.2 mandates one combination rule for all numerics: take the maximum,
with `0` meaning unlimited and therefore beating every other value. That rule is
correct for *allowances* — attachment size, posts per day — because a larger
number is more permissive. It is exactly backwards for an *interval*, where the
most permissive value is the smallest non-zero one. A user in a 30-second group
and a 5-second group should get 5 seconds; MAX would give them 30.

Keeping the field would have required a fourth combination kind used by two
fields, and a permanent footnote on the F22 matrix. Modelling it as a setting
plus a boolean keeps R4.2 literally true for every field in the registry — the
boolean combines by OR, which gives the right answer with no special case.

**Cost.** An imported board loses per-group flood granularity: everyone is
either subject to the board interval or exempt from it. Reintroducing
granularity later means adding a `numeric-min` kind to
`packages/core/src/permissions.ts` and one row per actor to the F22 fixture.

**Live since F39/F40.** `posting.flood_seconds` is read by the posting path and
the exemption is asked for as the global action `flood.bypass`, so no permission
field escapes `@forum/authorization` (R4). Administrators bypass it like any
other action; the F22 forum matrix does not carry a column for it, because the
interval is a board setting rather than a per-forum grant.

---

## Permission field naming

**MyBB** uses lowercase, unpunctuated column names (`canpostthreads`,
`canviewthreads`, `cansearch`).

**We** use camelCase keys (`canPostThreads`) mapped to snake_case columns
(`can_post_threads`).

**Why.** The keys are consumed as TypeScript property names across three
packages, and `canviewothersthreads` is genuinely ambiguous to read. The mapping
is mechanical and lives in `packages/db/src/schema/permission-columns.ts`, so
importer code can translate a legacy column name in one place.

---

## Separate `canAccessAdminCp` and `isAdministrator`

**MyBB** treats admin status and admin CP access as effectively the same thing
(`cp_access` gates panel modules for an already-admin user).

**We** keep them as two fields: `isAdministrator` grants the permission bypass,
`canAccessAdminCp` grants the panel.

**Why.** R4.2 requires the bypass be explicit and logged. Splitting the fields
makes it possible to grant a trusted role read access to the panel without also
handing it the ability to bypass every forum permission on the board — and makes
the audit log meaningful, because a bypass entry now implies a specific field.

---

## BBCode coverage

**MyBB** ships `b i u s color size font align url email img quote code php list
hr video` plus smilies, admin-defined custom tags, and automatic linkification
of bare URLs in post text.

**We** ship, at F36: `b i u s color size url email img quote code list *`.
Absent for now: `font`, `align`, `hr`, `video`, `php`, and auto-linking.

**Why.** Each absentee is either owned by a later feature or is a decision:

- `font` and `align` are presentation an author dictates over the theme's
  typography and layout. They are cheap to add and belong with F37's per-forum
  capability toggles, where a board can decide whether members may override the
  theme at all.
- `video` embeds third-party markup, which is the one thing this renderer's
  construction argument does not cover. It needs a provider allowlist and a
  privacy decision (an embed is a request to another host from every reader's
  browser), so it waits for F37 rather than arriving as an exception.
- `php` is `code` with a syntax highlighter. Two tags that differ only in
  highlighting is a parity artefact, not a feature; when highlighting exists it
  will be an attribute on `code`.
- **Auto-linking is the real divergence.** MyBB turns a bare `http://…` in post
  text into a link. We do not: every link on the board is one an author asked
  for with `[url]`. Linkifying text means the renderer decides where a run of
  text ends, which is the ambiguity behind "the trailing full stop is part of my
  link" — and it makes every pasted string a live link, which is a spam
  affordance rather than a feature. An imported MyBB post keeps its bare URL as
  text.

**Cost.** An imported board's posts render slightly plainer: bare URLs are not
clickable, and `[font]`/`[align]`/`[video]` show as literal text until F37.
F87's corpus pass is where every remaining difference becomes an entry here.

---

## Unclosed and mismatched BBCode

**MyBB**'s regex passes leave an unmatched `[b]` as literal text, and can emit
unbalanced HTML for crossed tags such as `[b][i]x[/b]`.

**We** demote an unclosed tag to literal text — matching MyBB's visible result —
but close crossed tags implicitly, so `[b][i]x[/b]y` renders as
`<strong><em>x</em></strong>y` rather than unbalanced markup.

**Why.** The visible outcome for the common mistake is the same, and the
divergence only appears in the case where MyBB's output is invalid HTML whose
rendering is browser-dependent. Unbalanced output from a post body is also the
shape that lets formatting escape a post and affect the rest of the page, so
this one is not negotiable regardless of parity.
