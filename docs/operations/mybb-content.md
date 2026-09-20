# MyBB content conversion

Keep an untouched source export. Compare representative posts and files before cutover.

## Markdown conversion

| Source tags | Result |
|---|---|
| `b`, `i`, `s`, `url`, `email`, `img`, `quote`, `code`, `php`, `list` | Markdown equivalents; quote attribution retained |
| `u`, `color`, `size` | Text retained; styling removed |
| `font`, `align`, `hr`, `video`, `table`, custom MyCode | Literal escaped tags and text |

Tag names are case-insensitive. Markdown punctuation in original text is escaped. Code fences expand to contain embedded backticks. Malformed and unknown tags retain their text; unsafe destinations are refused by the renderer.

Raw HTML is escaped. Single newlines become line breaks; indented code blocks are unsupported. Posts are converted by render backfill; messages, signatures, announcements and drafts convert when read. There is no runtime BBCode renderer.

Use `:::spoiler` for native spoiler disclosures. Imported custom `[spoiler]` tags are not converted. Directives declare syntax; arbitrary admin-defined HTML replacement patterns are unsupported. See [Formatting](../members/formatting.md).

## Quotes and announcements

Quotes resolve source posts by ID with visibility checks, then include member attribution and a durable post link. With JavaScript, Quote fills the current composer and multiquote selections persist in `sessionStorage` across pages. Without it, Quote opens the reply page; multiquote is unavailable.

Announcements are separate dated notices, not replyable threads. Recreate MyBB announcements under [Communications](../administration/community-communications.md#announcements). Dates use UTC; forum notices inherit forum visibility, without separate per-group controls.

## Editing and polls

- The opening post cannot be deleted separately. Use thread deletion with `canDeleteOwnThreads`, or ask a moderator.
- Edit windows are numeric permissions: the most generous group value wins, with zero unlimited.
- A poll cannot become public after voting begins; it can become private.
- Maximum choices use 1, N or 0 for unlimited. MyBB multiple-choice imports as 0.
- Poll editing follows opening-post editing permission. Options may be added; options with votes cannot be removed.

## Files

Attachments accept PNG, JPEG, PDF and ZIP. PNG/JPEG are decoded and re-encoded; pending images are unavailable until processing completes. Original metadata is removed. PDF/ZIP are opaque downloads. Animated GIF and arbitrary additional formats are unsupported.

Downloads pass through the board, checking forum, post and thread visibility, with attachment disposition, `nosniff` and sandboxing policy. Keep the underlying store private.

Native composer forms submit files with the post; validation failure requires reselecting them. The JavaScript **Insert attachment** enhancement also inserts inline markers. Editing permits adding files and removing existing ones; removing a marker alone does not delete a file.

Avatars are uploaded, re-encoded and fitted within 200×200 without cropping. Remote avatars and Gravatar are unsupported. Moderators lock avatars with a reason, retaining the image and preventing replacement until unlocked.

Converter cases are tested in `packages/markdown/src/bbcode.test.ts`. Import omissions are listed in [Import](migrating.md).
