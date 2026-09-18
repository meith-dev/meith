# MyBB migration: posts and uploads

Check which formatting, editing, poll and upload behavior changes when importing from MyBB. Preserve an untouched export so you can inspect content conversion before cutover.

## Posting and Markdown

### The markup language is Markdown, not BBCode

**MyBB:** posts are BBCode: `b i u s color size font align url email img
quote code php list hr video`, plus smilies, admin-defined custom MyCode,
and auto-linking of bare URLs.

**Meith:** posts are Markdown. A board that upgrades or imports has its
content **converted once**: posts are rewritten in the background by the
render backfill, and private messages, signatures, announcements and
drafts are converted when they are next read. There is no BBCode renderer
left in the tree, and no board runs two markup languages at once.

This is the largest single divergence in this document, so what survives
is worth stating precisely:

- **Converted with no loss:** `b i s url email img quote code php list`
  all have a Markdown spelling, and the converter produces it. A quote
  keeps its attribution — `[quote='Bob']` becomes
  `> **[Bob](../../../../../../member/by-name/Bob) wrote:**` above the quoted lines — and
  `[code]` and `[php]` bodies are fenced with a rail long enough that
  their own backticks cannot close it.
- **Converted with the styling dropped, the words kept:** `u`, `color`
  and `size` have no Markdown spelling. `[color=red]stop[/color]` becomes
  `stop`. **This is a real, permanent loss of presentation on an imported
  board** — the one place in the migration where something a member wrote
  does not come back. Nothing they *said* is lost, only how it was
  coloured.
- **Left as the text it was:** `font`, `align`, `hr`, `video`, `[table]`,
  and any custom MyCode the old board defined. An unrecognised tag is
  escaped and shown as the characters its author typed, so an imported
  post reads as slightly plainer prose rather than as a hole.
- **Gained:** headings, tables, task lists, thematic rules, fenced code
  with a language, and auto-linking — which MyBB had and this board's
  earlier BBCode renderer refused. Markdown resolves the ambiguity that
  made it refusable: a bare URL ends at whitespace and gives back the
  trailing punctuation that belongs to the sentence.

**Meith does not accept raw HTML**, which CommonMark says should pass
through. Accepting it would need a sanitiser, and a sanitiser is a
blocklist; this renderer constructs its output instead, which is why it
has never had one. `<script>` in a post is seven escaped characters and a
word. Two smaller deviations from CommonMark: a single newline is a line
break, and there are no indented code blocks.

**A directive is not MyBB's custom MyCode.** MyBB's takes a *replacement
pattern* — a regular expression and the HTML to put in its place — so an
administrator can produce any markup from a form. Meith's chooses a
**name** and whether it is inline or block; members write `:::note` …
`:::` or `:note[…]`, and the element is constructed by
`@meith/markdown`. That is a real capability difference and a deliberate
one: a field that chooses output markup is a second markup language
administered through a web form, which is how boards with custom MyCode
acquire a permanent XSS surface. Anything needing bespoke markup is a
plugin, where the code is reviewed rather than typed into a text box.

**`spoiler` is not a directive an administrator defines — it is built
into the renderer**, on every board, and reveals with a native
`<details>`/`<summary>` element that needs no JavaScript. MyBB's
`[spoiler]` MyCode (never core, always a plugin) still falls into "left
as the text it was" on import, same as any other custom MyCode; a member
who wants a hidden section after the move writes `:::spoiler` … `:::`.

**Cost.** An operator promising a like-for-like move should promise it
about the *text*, not the colours. Members who knew BBCode have to learn
a different syntax — the composer's toolbar, shortcuts and formatting
help exist for exactly that week.

### Quoting fills the box you are looking at

**MyBB:** quotes by navigating to the reply page, with multiquote for
collecting several posts first.

**Meith:** does both and, with JavaScript on, neither navigates: clicking
**Quote** puts the quote into the quick reply already on the page, opens
it, and puts the caret under the quote.

**Multiquote is a selection you can see.** **Multi-quote** is a toggle: it
reports whether this post is in the selection, and a second click takes it
out again. Above the reply box a strip names the count — "3 posts selected
to quote" — and carries the two things you can do with it: **Add to reply**,
which fetches the quotes and drops them in the box in the order they were
selected, and **Clear**, which throws the selection away. Every change is
announced to a screen reader as it happens, so the count is conveyed the
same way it is shown. The selection lives in `sessionStorage`, so it
survives turning the page and collects posts from more than one page of a
thread; arriving at the full reply page spends it, exactly as clicking
**Quote** does. Spending it and clearing it are the only two things that
empty it.

The strip is a client island, so it appears only where scripting does. With
scripting off the **Multi-quote** button is not rendered at all and the
**Quote** link is the whole feature, as below.

**The quote comes from the server, by post id** — not read out of the page
and turned back into markup in the browser. The server fetches the post
through the same visibility lookup the reply page uses, so a reader
cannot quote something they were never shown, and a moderator cannot
republish a deleted post by quoting it.

**A quote names its source twice.** The attribution links the member, and
carries a link back to the post it was taken from. Both are written into
the Markdown rather than held as attributes, so they survive the reply
being edited, and the link back uses the post's durable id-based form
rather than its position in the thread, which moves.

**Cost.** One request per quote, where a board doing it in the browser
makes none. With scripting off, the Quote link is a link to the reply
page, exactly as it always was.

---

## Announcements

### Announcements are not sticky threads

**MyBB:** has announcements, and boards frequently use a pinned thread for
the same job anyway.

**Meith:** has announcements that are deliberately *not* threads: nobody
can reply to one, it has a start and an end date, and it lives above the
forums rather than in the listing.

**Why.** A sticky thread is a conversation — it belongs to its author,
members reply to it, and taking it down deletes what they said. That is
what leaves a three-year-old rules post pinned at the top of a forum. An
announcement expires on its own, and removing it removes nothing anybody
wrote.

Two smaller differences follow. There is no per-group visibility on an
announcement: a forum's announcement is shown to whoever can see that
forum, resolved through the same filter as everything else, and a
board-wide one to everybody. And the dates are entered in **UTC**, because
the control submits wall-clock text with no zone and the alternative is an
announcement appearing at a different hour depending on the container's
`TZ`.

---

## Editing and deleting

### Markup that does not close

**MyBB:** its regex passes leave an unmatched `[b]` as literal text, and can
emit unbalanced HTML for crossed tags.

**Meith:** cannot emit unbalanced markup at all: the renderer builds a tree
and writes elements out of it, so no opening tag reaches the page without
its closing one. An unmatched `**` is two asterisks, an unterminated
`` ` `` is a backtick, and an unclosed fence ends at the end of the post
rather than swallowing the thread.

**Why.** Unbalanced output from a post body is the shape that lets
formatting escape a post and affect the rest of the page, so this one is
not negotiable regardless of parity. The visible outcome for the common
mistake is the same as MyBB's: you see what you typed.

### Deleting the first post of a thread

**MyBB:** lets a member with `candeleteposts` delete any of their own
posts, including the opening one — leaving the remaining replies under a
first post that no longer exists.

**Meith:** refuses it, with a message pointing at thread deletion instead.

**Why.** The opening post *is* the thread as far as every listing is
concerned — it supplies the title, the author, and the counters. The two
ways to allow the click both lose: deleting only the post leaves a thread
with a title and nothing to read; quietly deleting the whole thread means
"delete my post" removes other people's replies without saying so.
Refusing and naming the alternative is the only option that does what it
says.

**Cost.** A member who wants their thread gone needs `canDeleteOwnThreads`
granted, or a moderator. An imported MyBB thread whose first post was
deleted arrives with that post soft-deleted rather than missing — the
moderator view shows it, the member view skips it.

### Editing a post after the window closes

**MyBB:** hides the edit control once `edittimelimit` has passed and
refuses the submission server-side.

**Meith:** does the same, with one difference: the window is a **numeric
permission**, so the usual combination applies — `0` means unlimited and
beats every other value across a member's groups. A member in a 30-minute
group and an unlimited group gets unlimited.

**Why.** It is the same rule every other numeric on the board follows. An
edit window is an *allowance*, so MAX is the right rule and no special
case is needed — unlike the flood interval above, where minimum-wins
genuinely is correct and the field was therefore modelled as a setting.

---

## Polls

### Making a poll's voters public after voting has started

**MyBB:** stores `public` on the poll and an administrator may switch it on
at any point, including on a poll that has been running for a month. Every
vote already cast becomes attributable.

**Meith:** carries the same flag, and the same import, but refuses to turn
it on once the first vote is in. It may be switched **off** at any time,
and a poll created with public votes says so above the options before
anybody picks one.

**Why.** A public voter list is a disclosure a member consents to when
they vote, and consent given to a secret ballot cannot be reinterpreted
afterwards. Making the flag one-way in the risky direction is the only
version of the feature that does not turn a past vote into something the
voter did not agree to.

**Cost.** A board that meant to run a public poll and forgot to tick the
box cannot fix it in place once voting starts. The poll has to be closed
and re-run.

### A multiple-choice poll carries a maximum, not a flag

**MyBB:** models multiple choice as the boolean `multiple`: a member either
picks one option or picks as many as they like.

**Meith:** stores a number — 1 for a single choice, N for up to N, and 0
for no limit — so "pick your top three" is expressible. A MyBB poll with
`multiple` set imports as 0, which is exactly what it meant.

**Why.** The two useful polls MyBB cannot express are both caps, and the
boolean is the degenerate case of the number rather than a separate idea.
phpBB already stores `poll_max_options`, so the number is also what the
other importer needs.

**Cost.** None on import in either direction.

### Who may edit a poll, and what they may change

**MyBB:** has a `canmanagepolls` moderator right and lets the poll's author
edit it inside the forum's edit window.

**Meith:** drops the separate right — it granted nothing, as
[Upgrading](upgrading.md) records — and authorises a poll edit exactly
as it authorises editing the thread's opening post: the author inside the
forum's edit window, and anybody who may edit others' posts at any time.
Options may be added while a poll is running, and an option that already
has votes cannot be removed.

**Why.** A poll is part of the post it was attached to, so a second
permission for it is a second thing to get wrong. Refusing to remove a
voted-for option keeps the running totals meaning what they said they
meant; adding options is safe because it cannot change a vote already
cast.

**Cost.** A board that gave a moderator poll rights without post-editing
rights has to grant the post-editing right instead.

---

## Attachments and avatars

### An attachment is re-encoded, and until it is, it does not exist

**MyBB:** an upload is checked against allowed extensions and MIME
types, stored, and served as uploaded.

**Meith:** PNG and JPEG are decoded to raw pixels and written back out
by an encoder; the stored object is the encoder's output. The uploaded
bytes are held in a separate, unservable object until that succeeds, and
then deleted. A row is `pending` until the re-encode finishes, and
nothing serves a `pending` row.

**Why.** Validation cannot make a file safe. A valid PNG with a ZIP
appended after its `IEND` chunk passes every check anyone could make,
because the file genuinely *is* a valid PNG; so does one with a payload
in an EXIF block aimed at whichever decoder opens it next. None of that
survives a decode and re-encode, because the output is written from
pixels and has never seen the original bytes.

**Cost.** An image is not visible for as long as the queue takes —
usually seconds, up to a minute on a board whose tick is the only
worker. EXIF is gone, including the orientation tag and colour profile —
a real loss for photographers, and a real gain for everybody who did not
mean to publish where they took the picture. Animated GIF is not
accepted at all rather than silently flattened to one frame.

### Four file types, not an operator-configurable list

**MyBB:** an attachment-types screen; an operator adds any extension and
MIME type they like.

**Meith:** PNG, JPEG, PDF and ZIP, as a constant. The images are
re-encoded; PDF and ZIP are served as opaque downloads and never
rendered.

**Why.** A format is on the list only if the board can make a claim
about the bytes it serves — "this was re-encoded", or "this is an
opaque download". A configurable list is a way to accept a format
nothing can process. `text/plain` is the instructive omission: it has
no signature, so "is this a text file" can only ever be a guess.

**Cost.** No `.docx`, no `.mp3`, no `.7z`, and no way to add one without
a release. The admin screen configures *limits*, not *formats*.

### The download is served by the board, not the object store

**MyBB:** `attachment.php` streams the file through PHP after a
permission check.

**Meith:** the same — a route handler that re-checks
`attachment.download` in the attachment's forum, checks the post and
thread are visible to this viewer, and sets
`Content-Disposition: attachment` with `nosniff` and a sandboxing CSP.
The stored object is always private, even in a public forum, and a
signed object-store URL is deliberately not used.

**Why.** A signed URL is a bearer token that outlives the permission
that issued it — move a thread into a private forum and every URL handed
out in the last hour still works — and it carries the bucket's headers
rather than the board's, which is where the safety of serving
member-supplied bytes actually lives.

**Cost.** The bytes go through the app, so a large attachment costs the
board bandwidth. Revisit if the `FileStore` port ever grows the ability
to sign with response headers.

### Files are submitted with the post, in one form

**MyBB:** the composer uploads each attachment over its own request,
keyed to a post id or a "posthash" for a post that does not exist yet,
with abandoned ones swept later.

**Meith:** the file input is part of the reply form and the files arrive
with the message. There is no upload step and no draft token. Editing a
post follows the same rule: the edit form carries its own attachments
field for new files and a checkbox per existing one to remove it, still
one plain submission, never a token. Adding a file this way checks the
same `attachment.upload` permission and spends the same hourly upload
allowance a new post's attachments field does; taking one of the post's
own files back out is gated on the right to edit the post, nothing more.

**Why.** It works with JavaScript off, which the posthash flow does not
without a round trip that loses the typed message. It also removes a
whole class of state — a draft attachment waiting for a post that may
never come — and with it the sweep for abandoned drafts.

**Cost.** A browser cannot repopulate a file input, so a submission that
fails validation loses the chosen files even though the message
survives. That is true of every no-JS upload; an incremental upload
belongs in the editor islands, as an enhancement over this path rather
than a replacement for it.

### An avatar is re-encoded and locked, never linked and never deleted

**MyBB:** three ways to have one — upload, a remote URL, or Gravatar. A
moderator's remedy is to delete it.

**Meith:** upload only, decoded and re-encoded like every other image on
the board, fitted to 200×200, unservable until that succeeds. A
moderator locks it rather than deleting it, with a required reason the
member is shown.

**Why no remote URL.** Rendered directly, it is a tracking beacon
reporting every reader's IP to a third party on every page view. Fetched
server-side to avoid that, it is SSRF: an attacker supplies a URL and
the board makes the request from inside whatever network it runs in.
The only safe version ends at fetch-validate-re-encode-store — which is
what the upload path already is. Gravatar is the remote-URL problem
with a better-known third party.

**Why a lock and not a delete.** The signature argument, stronger:
deleting destroys the evidence, and an appeal about an image has
nothing at all unless the file survives. Locking stops it rendering,
stops the member replacing it, keeps the object, and records a reason.

**Cost.** A member who wants their avatar from elsewhere downloads it
and uploads it, and nobody's Gravatar follows them here. The image
loses its EXIF, which is the point.

### An avatar keeps its aspect ratio; it is not cropped to a square

**Meith:** scaled to fit 200×200, aspect preserved, no crop.

**Why.** Cropping decides for somebody which part of their picture
matters, and a board cannot know. A theme that wants circles can have
them in CSS, which is reversible; a crop at upload time is not.

**Cost.** A wide image renders wide, so a theme laying out a fixed
square has to say `object-fit: cover` rather than assuming. The default
theme does.

---

## The BBCode conversion

The conversion corpus is `packages/markdown/src/bbcode.test.ts`: each
difference below is asserted there, so this document and the converter
cannot silently disagree. (URL safety is asserted in the renderer's own
security tests, which the converted output flows through.)

**No MyBB source artefacts are copied**, and that is not only a
licensing rule: MyBB's parser is a pile of regular expressions
accumulated over fifteen years, and reproducing them would reproduce
their bugs as though the bugs were the specification. The corpus is
written from the *observable* side — the BBCode people actually type —
and every case is a claim about what a reader sees after the
conversion.

### Where the conversion is exact

Bold, italic, strikethrough, both link forms, images, quotes with their
attribution, code and PHP blocks, both kinds of list, and
case-insensitive tag names. Case-insensitivity matters more than it
looks: boards are full of `[B]`, and a converter that matched only
lower case would turn fifteen years of emphasis into literal text.

### Difference: the text is escaped on the way through

**MyBB:** a post is BBCode; `*`, `_`, `#` and `[` in it are
punctuation.

**Meith:** those are Markdown syntax, so the converter escapes them. A
post that said `a * b` still says `a * b`; a post that said `# 1 fan`
is not a heading; a variable called `snake_case` does not come out half
italic.

**Why.** Without it, every post containing an asterisk changes meaning
on the day of the upgrade — silently, and in a way nobody could find
afterwards.

**Cost.** An author who opens an old post in the editor sees
backslashes where one was genuinely needed. That is the visible half of
a guarantee whose alternative is invisible.

### Difference: URLs and CSS this renderer refuses

**MyBB:** has historically rendered `[url=javascript:…]`,
`[img]data:…[/img]` and `[color=red;background:…]` with varying degrees
of filtering by version.

**Meith:** refused by the renderer. The link keeps its text and loses
its destination — no anchor, no image element, no attribute.

**Why.** Each is an XSS in a forum post, and "MyBB renders it" is a
description of MyBB's history rather than a requirement.

**Cost.** An imported post containing one shows the URL as text instead
of a link — visible rather than silent, and intended.

### Difference: malformed input is handled consistently

**MyBB:** leaves an unclosed tag as literal text in some contexts and
swallows it in others, depending on which regular expression ran
first.

**Meith:** the input is parsed, so the answer is the same everywhere.
An unclosed tag converts to the text it is; a crossed pair keeps its
content; a stray closing tag does not eat the line.

**Why.** Consistency is worth more than bug-compatibility, and the rule
is chosen so nothing is silently dropped — a post whose second half
vanished is worse than a post with a visible `[b]` in it.

### Difference: an unknown tag becomes text

**MyBB:** drops unknown tags in some paths.

**Meith:** an unknown tag is escaped and shown, and its content is
kept.

**Why.** Dropping is the worse default: a custom MyCode the old board
defined would silently erase whatever it wrapped, and nobody would know
which posts were affected.

### Gap: tags this conversion does not translate

`[table]`, `[align]`, `[font]`, `[video]`, and any custom MyCode. Their
content survives as text, which is legible; a tag that vanished would
take its content with it. `[table]` is the one most likely to matter —
Markdown has tables, and a converter for MyBB's table syntax is a
plausible later addition.

---
