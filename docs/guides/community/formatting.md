# Writing a post

Posts, replies, private messages and signatures are all written in
Markdown. This page is the member-facing reference: what the composer's
toolbar buttons do, and the syntax behind each of them — including the
newer parts, which the toolbar's own **Formatting help** disclosure only
has room to name in passing.

Everything on this page still works with JavaScript off. The toolbar,
the live preview, mention suggestions and the "Insert attachment" button
are enhancements layered on top of a composer that is a plain `<textarea>`
underneath; typing the syntax by hand always works, whichever came first.

## The basics

Bold, italic, strikethrough, links, quotes, lists, headings and code —
the everyday Markdown set — work as you would expect, and the composer's
own **Formatting help** disclosure lists the exact syntax for each. This
page covers everything past that set.

## Syntax-highlighted code

A fenced code block names its language the way GitHub's does:

    ```ts
    const answer = 42
    ```

The language is highlighted server-side when the post is written — there
is no client-side highlighter shipped to the browser, in keeping with the
board's no-JS-first rendering. An unrecognised or omitted language falls
back to plain, unhighlighted text; it is never an error. The supported
languages cover the common ones — TypeScript/JavaScript, Python, Go,
Rust, Java, C/C++/C#, Ruby, PHP, Kotlin, Swift, SQL, HTML, CSS, Markdown,
YAML, JSON, TOML, INI, bash, Dockerfile, GraphQL, diff and HTTP — under
common aliases (`js`, `py`, `sh`, `yml`, and so on).

## Tables

```
| Column | Column |
| --- | --- |
| Cell | Cell |
```

A table is rows of cells divided by pipes, with a row of dashes under the
header that marks where it ends and fixes how many columns there are. The
composer's **Table** toolbar button drops a two-column starter table at
your cursor with the first heading selected, ready to type over; add more
pipes to every row for more columns, and more lines for more rows.

## Task lists

```
- [ ] still to do
- [x] already done
```

A list whose items are checkboxes: `- [ ]` for one still open and `- [x]`
for one that is done. The composer's **Task list** toolbar button starts
one at your cursor, and pressing Return continues it — a fresh `- [ ]` on
the next line — exactly as a bulleted or numbered list does. The boxes
render as ticked or unticked marks in the saved post; they are a record,
not buttons a reader can toggle.

## Images

```
![a description of the picture](https://example.com/pic.png)
```

An image is a link with an exclamation mark in front: the text in the
square brackets is the description shown when the image cannot load and
read aloud to anyone using a screen reader, and the address in the
parentheses points at the image itself. The composer's **Image** toolbar
button inserts this around whatever you have selected, using your
selection as the description. This is for an image hosted elsewhere on the
web — a file you attach to the post has its own **Insert attachment**
button (below). Off-board images load only on boards that have opted into
remote images, the same setting behind link previews.

## Spoilers

```
:::spoiler
The ending is a twist nobody expected.
:::
```

Renders as a native, no-JavaScript-required disclosure — closed by
default, opened with a click or a keypress. `spoiler` is reserved: it
always works, on every board, whatever directives an administrator has
or has not configured. The composer's **Spoiler** toolbar button wraps
your selection in the fences for you.

## Mentioning a member

Typing `@` followed by a few letters of a username opens a short list of
suggestions — pick one, or keep typing and press Enter. This is an
enhancement only: the underlying syntax is still `@username`, so typing
it out by hand, with JavaScript off or on, works exactly the same and
still notifies the member. Suggestions never include a member on your
ignore list, and only appear for people whose profile you are allowed to
see.

## Addressing a private message

A private message's **To** and **Bcc** fields take one or more usernames
separated by commas. Start typing a name and the same suggestion list the
composer offers for mentions appears; pick one and it is added to the
comma-separated list, ready for you to type the next. This is an
enhancement only — the field is a plain comma-separated text box
underneath, so typing the names in by hand, with JavaScript off or on,
works exactly the same. The list completes usernames the same way a
mention does, and nothing more: whether a message can actually reach
somebody is decided when you send it, identically for a name you typed
and one you picked from the list.

## Link previews

A link to YouTube or Vimeo, alone on its own line, unfurls into a small
card — a thumbnail, the title, and who posted it — once the post is
saved:

```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

A link that shares a paragraph with other text is left as a plain link;
only a link on a line by itself is treated as something worth a preview
of its own. This only happens on boards that have opted into loading
remote images at all (the same setting that governs whether an `![image
alt text](https://example.com/pic.png)` from off-board loads) — an
administrator who has kept the board's content-security policy locked to
same-origin images gets no cards, and no request to YouTube or Vimeo is
ever made on their behalf. The card itself is a static image and text —
never an embedded player — so it costs nothing beyond that same image
allowance.

## Placing an attachment inline

By default, every file you attach to a post is shown in a list below it.
To place one *inline* — where it belongs in what you wrote, the way an
image does — click the toolbar's **Insert attachment** button (the
paperclip). It uploads the file immediately, before the post itself is
submitted, and drops `[attachment=id]` at your cursor once it is done;
the file still also appears in the attachment list once the post is
saved. An id you did not upload yourself never resolves to anything in
somebody else's post — typing one by hand does not work.

## Editing a post's attachments

Opening **Edit** on a post you may edit shows every file already attached
to it, alongside a checkbox to remove it. Removing one of your own post's
attachments needs nothing beyond the right to edit the post itself — the
same edit window, and the same allowance for staff who may edit past it.

Adding a new file is a separate matter: the attachments field for it only
appears if you still hold the board's **attach files** permission for this
forum, the same one a new post's attachments field checks, and it counts
against the same hourly upload allowance. Losing that permission after
posting does not let you add files by editing around it — it only means
you can no longer add more, not that you cannot take existing ones out.
Either way, adding or removing travels with the edit in the same plain
form as the message itself — there is still no separate upload step and
no token, the same rule new posts follow (see [Files are submitted with
the post, in one
form](../../reference/mybb-parity.md#files-are-submitted-with-the-post-in-one-form)).
A file still being re-encoded shows as **Still being processed** rather
than a broken image, and one that failed shows as such — both stay in the
list, with their remove checkbox, until you either leave them or take
them out.

## Polls

A new thread's composer offers **Add a poll** when the forum allows them.
Opening it shows a question and four option fields, plus how many of them
a member may pick, whether they can change their vote, whether their name
is shown beside what they picked, and an optional closing time.

Four options is a starting point, not a ceiling — a poll may carry up to
twenty. **More options** reveals four more empty fields at a time, and
never loses what is already typed in the ones that came before it. With
JavaScript on, this happens instantly, in the browser; with it off, the
same button submits the form and the page comes back with the extra
fields in place, the question, the options already filled in, and the
rest of the thread you were writing exactly as it was. Once twenty is
reached, the button is disabled — there is nowhere left to grow into. An
option field left blank when the thread is posted is simply not part of
the poll; you do not need to fill every field the button has revealed.

A closing time is optional and, like an announcement's, is entered as
**UTC** wall-clock text rather than your own time zone — leave it empty
for a poll that stays open until someone closes it by hand.

**Results are always visible under the options** — a bar sized to its
share of the vote, the percentage, and the count, with a total-votes line
underneath the list. This is server-rendered HTML and CSS, not a chart
library: it looks the same, and needs nothing extra, whether or not
JavaScript is running. Voting is a plain form submission either way.

An existing poll can be reopened for editing from **Edit poll** beside it
(inside the same edit window as the post it is attached to). The edit
form adds three more option slots on top of whatever the poll already
has, still up to the twenty-option cap, and can add or change the closing
time the same way the composer does.

## Drafts

The composer saves what you are writing without being asked. A second or
so after you stop typing, and again whenever a field loses focus, it
sends the subject and the message to the board and says **Saved just
now.** underneath. One draft is kept per forum for a thread you have not
posted yet, and one per thread for a reply; reopening the composer fills
it back in. **Save draft** does the same on demand.

A copy is also kept in the browser, and it is the one that survives a
crashed tab or a lost connection. Reopen the composer and it offers to
**restore** what it kept, or to **discard** it.

Posting clears both, so the next thread you start in that forum begins
empty. With scripting off there is no autosave and no recovery offer;
**Save draft** still works.

**Drafts**, under your account panel, lists every one you have saved —
the forum or thread it belongs to, when it last saved, a **Resume** link
back into the composer with the text still there, and a **Delete** to
discard it without ever opening it.

## Everything else stays server-rendered

None of the above needed a client-side markup renderer, a syntax-
highlighting library shipped to the browser, or a script tag on the
rendered post itself. What changes with JavaScript off is only the
*composing* experience — the toolbar, the mention list, a private
message's recipient suggestions, the "Insert attachment" button, the live
preview tab, and whether **More options** on a poll grows the option list
in place or through a round trip — never what a saved post, or a poll's
results, look like once someone reads it.
