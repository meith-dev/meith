# Vocabulary audit — the "forum" → "community" rename

**8 August 2026.** An audit of the bulk rename landed in `45cc0dd` (product
rebrand) and `b468568` (entity rename), and a recommendation for what the
renamed entity should actually be called.

The short version: the rebrand in `45cc0dd` was right and should stand. The
entity rename in `b468568` gave one word two jobs at two different scales, and
the symptom the rename is being judged by — a nav item reading **Communities**
that goes to the board index — is only the loudest instance of it.

There are two independent problems here, and they want separate fixes:

1. **The entity is misnamed.** A section of a board is not a community; the
   board is the community. Fixing this is a second bulk rename.
2. **The index link is misnamed.** It is named after a collection rather than a
   destination. This is wrong regardless of what the entity ends up being
   called, and it is a three-line fix.

---

## The vocabulary as it stands

| Level | Word today | Verdict |
|---|---|---|
| Product category | community software | **Keep.** This is what `45cc0dd` set out to do and it works. |
| A running installation | board | **Keep.** Established and unambiguous — `BOARD_TITLE`, board settings, board statistics, the `(board)` route group. |
| A container that holds no threads | category | **Keep.** |
| A row that holds threads | **community** | **The problem.** |
| A discussion | thread | **Keep.** |
| A message | post | **Keep.** |

`b468568` took the word the product uses for the whole board and reassigned it
to a section of one. Everything below follows from that.

---

## Findings

### V1 — The product uses "community" for the board and for a section of it, in the same file

`apps/web/src/content/site.ts` is where this is most visible, because both
meanings appear within one object:

- `:199` — `blurb: "community board"` — the whole board is the community.
- `:200` — `communities: [ "Announcements", "Build logs", "Help & support" ]` —
  and its rows are communities too.
- `:197` — `"A board, in outline — its communities, what is in them…"`
- `:288` — `"A board that looks like your community"` — back to the board scale.
- `:131` / `:142` — `"Open-source community software where your people gather"`,
  `"built for communities that have work to do together"` — the marketing
  meaning, which is a whole board per community.

A reader who arrives from the marketing page having learned that *their board is
their community* then signs in and finds their community contains a list of
communities. Note that `45cc0dd` had originally made these preview rows
**spaces** for exactly this reason; `b468568` overwrote them.

### V2 — The board-index nav item is named after a collection, not a destination

`apps/community/src/view/shell.ts:136`

```ts
{ label: 'Communities', href: '/' },
```

Three things are wrong with it, and none of them depend on the entity's name:

- Every other item in that row names a **view** — *New posts*, *Unanswered*,
  *My posts*, *Search*, *Who's online*. This one names a collection, so it reads
  as a directory of communities you can browse between rather than "go home".
- Both shipped themes label that row `aria-label="Board sections"`
  (`themes/default/src/slots/header.tsx:112`,
  `themes/midnight/src/slots/header.tsx:54`). The row is *sections of the board*.
  "Communities" is not one of them; it is the board.
- It is the home link. `buildHeaderModel` already sets `homeHref: '/'` and the
  board mark links there too — so this item's job is to *name home*, and the
  plural of the entity noun is the one thing it should not be.

### V3 — The breadcrumb root has the same label, and collides with the seeded data

`apps/community/src/view/breadcrumb.ts:87` defaults `homeLabel = 'Communities'`.
The seeded board (`apps/community/src/server/seed-board.ts:229`) opens with a
category whose title is literally `'Community'`. So a fresh install renders:

> **Communities / Community / General Discussion / this thread**

That is not a hypothetical — it is written out verbatim as the worked example in
`themes/default/src/slots/thread-view.tsx:57`. Two different levels of the tree,
one word, adjacent, on the most-visited page type on the board.

`buildBreadcrumb` already accepts `homeLabel` as a parameter, and its own test
(`breadcrumb.test.ts:93`) passes `'Board'` — the seam for the fix is already
there and simply is not used.

### V4 — "Subcommunity" describes a thing that cannot exist

A community nested inside a community is a contradiction at the level of the
word; "subforum" and "subspace" are not.

- `themes/default/src/slots/community-row.tsx:81` — `Subcommunities`
- `themes/default/src/slots/subcommunity-list.tsx:25` — the card heading
- `apps/community/app/admin/communities/[id]/permissions/page.tsx:71` —
  *"Copy to subcommunities"*
- `packages/theme-kit` — the `SubcommunityList` slot and `SubcommunityListModel`

### V5 — Member-facing copy reads as cross-site rather than in-board

Each of these is grammatical and each points at the wrong scale — they describe
moving between communities, which is a thing this software does not do:

| File | String |
|---|---|
| `apps/community/app/(board)/search/page.tsx:143` | "Every community I can see" |
| `apps/community/src/view/community-jump.ts:104` | "Jump to community" |
| `apps/community/app/(board)/modcp/communities/page.tsx:9` | "My communities" |
| `apps/community/src/view/modcp-nav.ts:95` | "My communities" |
| `apps/community/src/view/theme-tokens.ts:101` | "Communities and threads" |
| `themes/midnight/src/slots/category-block.tsx:29` | `<th scope="col">Community</th>` |
| `apps/community/app/(board)/[slug]/page.tsx:52,58,65` | `{ title: 'Community' }` |

"My communities" is the sharpest of them: to a moderator it should mean *the
sections I moderate*, and it currently reads as *the boards I belong to*.

### V6 — The codebase's own prose has gone wrong in the same way

The rename rewrote explanatory comments literally, and they now describe
something else:

- `apps/community/src/view/breadcrumb.ts:9` — *"a member three communities deep"*
- `apps/community/src/view/shell.ts:145` — *"a member two communities deep should
  not have to go home"*

Depth is a property of a tree of sections. Communities are not nested, so a
reader who takes the word at face value is misled about the data model.

### V7 — Non-blocking, but worth listing

These are internally consistent and only odd once V1 is understood. They do not
need separate decisions; they come along with whatever the entity is renamed to.

- CSS tokens `--community-unread`, `--community-read`, `--community-locked`
  (`apps/community/src/view/contrast.ts:99–101`) — "a community with new posts".
- Permission keys `community.view`, `community.can`, `community.search`,
  `community.subscribe`.
- `packages/settings/src/definitions.ts:327` — "the community-display query budget".

---

## What is *not* wrong

Worth stating plainly so the second rename does not overshoot:

- **The product rebrand.** "Open-source community software" is a good
  positioning claim and nothing below contradicts it. `45cc0dd` should stand.
- **"Board" for the installation.** It is the load-bearing word and it works.
- **The public URLs for the entity.** `5884a26` moved the listing to root-level
  `/2-general`, so the entity noun is no longer in the member-facing URL at all.
  A second rename touches `/admin/communities`, `/modcp/communities` and
  `/api/read/community/[id]` — and nothing a member has ever seen or bookmarked.
- **MyBB's own artifacts.** The importer reading MyBB's `forums` table, the
  `/forumdisplay.php` compat route and the SEO-link parser are correctly
  untouched and should stay untouched under any rename.

---

## Recommendation

### The entity: rename `community` → **`space`**

A *community* is a group of people, and a board has one. A *space* is a place,
and a board can obviously have many, arranged in a tree. That is the whole
argument, and it resolves every finding above without touching the rebrand:
the product stays community software, "your community" keeps meaning the whole
board, and the thing that holds threads gets a word that was never claimed.

Supporting reasons:

- **Nothing collides.** `board`, `category`, `thread`, `post`, `group`, `member`
  all stay distinct. The 93 existing hits for "space" in the tree are
  `white-space`, a markdown lexer token, and DigitalOcean Spaces in an ops doc —
  no domain nouns, so the rename stays greppable.
- **It has already been tried here and it read well.** `45cc0dd` deliberately
  made the marketing preview rows "spaces"; `b468568` overwrote them. Reverting
  that specific choice is going back to something the project had already judged
  to be right.
- **The compounds get better, not worse.** "Subcommunity" becomes unnecessary
  rather than merely shorter: on a space's own page, a card listing the spaces
  inside it can simply be headed **Spaces**. The `Sub…` prefix only existed to
  disambiguate a word that could not nest.
- **The copy fixes itself.** "Every space I can see", "Jump to space", "Spaces
  I moderate", "Nothing has been posted in this space."

### The runner-up, honestly: revert the entity to `forum`

This is defensible and it is the option to pick if reach into the MyBB audience
matters more than the brand reading cleanly. "Forum" is the precise, universally
understood word for a section of a board; `docs/mybb-parity.md` is an explicit
project goal; and the importer and compat routes already speak it.

Note that this is **not** undoing the rebrand. `45cc0dd` drew exactly this line —
the *product* is community software, a *section of a board* is a forum — and
`b468568` erased a distinction that was correct. Reverting the entity name
restores it.

It loses on one point, which is why it is second: the section name is where a
visitor forms their impression of what shape the software is, and putting
"Forum" there is the one place the old category claim survives being told
otherwise everywhere else.

**Cost is not a tiebreaker.** Reverting is not cheaper than renaming — three
commits have landed on top of `b468568` (`144ab9f`, `5884a26`, `93a1361`), so
`git revert` will not do it and either option is a fresh bulk rename of the same
size. Choose on merit.

### Rejected candidates

| Candidate | Why not |
|---|---|
| **board** | Correct in the "message board" sense, but `board` already means the whole installation throughout the codebase. This trades the current collision for a worse one. |
| **channel** | Chat-shaped: flat, real-time, ephemeral. This entity is threaded, nested under categories, and has last-post counters. Wrong mental model at a glance. |
| **section** | Accurate and collision-free in meaning, but 562 existing prose/CSS hits make it un-greppable for a bulk rename, and it is a structural word rather than a place — "post in a section" is duller than it needs to be. Second-choice neutral option. |
| **topic** | Collides with `thread`; half of forum software uses "topic" to mean exactly what this codebase calls a thread. |
| **group** | Taken by usergroups. |
| **room** | Chat-flavoured, same problem as channel. |
| **hub** | No established meaning; reads as marketing. |

### The index link: fix this regardless of the above

Independent of the entity decision, and worth landing first because it is small:

1. **Nav item** — `apps/community/src/view/shell.ts:136`:
   `{ label: 'Communities', href: '/' }` → `{ label: 'Home', href: '/' }`.
   It names a destination, matching every other item in that row, and it stays
   correct forever because it never mentions the entity.
2. **Breadcrumb root** — `apps/community/src/view/breadcrumb.ts:87`: change the
   `homeLabel` default from `'Communities'` to the board's own name, and pass
   `settings.get('board.name')` at the two call sites
   (`app/(board)/[slug]/page.tsx:418`, `app/(board)/thread/[slug]/page.tsx:838`).
   It is already resolved one layer up in
   `src/components/shell/page-shell.tsx:78`. The trail then reads
   **Workshop / Main / General Discussion / this thread**, which is what MyBB
   does and what reads correctly on every board.
3. **Seed data** — `apps/community/src/server/seed-board.ts:230`: rename the
   default category from `'Community'` to `'Main'`, so a fresh install stops
   shipping the collision in its own example content.

---

## Scope, if the entity rename goes ahead

| Surface | Extent |
|---|---|
| Occurrences of `communit*` | **10,378** across **645** files |
| Paths named for it | **34**, including `apps/community/`, `packages/communities/` (`@meith/communities`) |
| Database | `communities` table; `community_id` (34 references); `community_subscriptions`, `community_moderators`, `community_permissions`, `community_password_grants`; associated indexes and FK constraint names |
| Theme slots | `CommunityRow`, `CommunityDisplay`, `SubcommunityList`, `CommunityJump` and their view models — **all four are `stable` in `SLOT_STABILITY`** |
| Permission keys | `community.view`, `community.can`, `community.search`, `community.subscribe` |
| CSS tokens | `--community-unread`, `--community-read`, `--community-locked` |
| Routes | `/admin/communities`, `/modcp/communities`, `/api/read/community/[id]` — no member-facing URLs (see `5884a26`) |
| Ops | `COMMUNITY_ROLE`, the community Postgres user/database, the `community` CLI binary and pnpm script, `community.config.ts` in `create-meith` |
| Generated docs | `theme-slots`, `plugin-hooks`, `rest-api`, `performance` — all regenerate from source |

### Why the timing argument matters more than the size

`THEME_API_VERSION` is **0.9** and the product is **0.1.0**. Renaming four
`stable` slots is a breaking theme-API change, and right now that costs nothing
because no third-party theme exists to break. After 1.0 the same rename is a
deprecation cycle with both names alive across a release.

There are no live boards, so — exactly as `b468568` argued for itself — this is
fresh-installs-only with no rename migration. Both facts stop being true on the
first release.

**So: decide now, or decide never.** Doing this twice was already one time more
than ideal; doing it a third time after 1.0 is a migration rather than an edit.

## Suggested order

1. **Land the index-link fix** (V2, V3) on its own — three files, no rename,
   removes the symptom that prompted this audit.
2. **Pick the entity name.** `space` recommended; `forum` if MyBB reach wins.
3. **Bulk-rename in one commit**, as `b468568` did: paths, packages, database,
   slots, permission keys, tokens, ops identifiers, copy — with generated docs
   regenerated in the same commit so `pnpm verify` gates it.
4. **Re-read the prose separately.** V6 is the part a mechanical rename gets
   wrong in both directions; the comments explaining the tree need a human pass.
5. **Re-check the marketing site by hand** (V1). It is the one surface where the
   *board*-scale meaning of "community" is correct and must survive the rename
   untouched — a blind find-and-replace there would undo `45cc0dd`.
