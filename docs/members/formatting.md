# Write and format posts

Use Markdown in posts, replies and private messages. The toolbar inserts syntax, but you can type it directly without JavaScript. Signatures allow a restricted subset of formatting.

## Basic formatting

| Write | Result |
|---|---|
| `**bold**` | Bold text |
| `*italic*` | Italic text |
| `~~removed~~` | Strikethrough |
| `[label](https://example.com)` | A named link |
| `` `code` `` | Inline code |
| `> quoted text` | A blockquote |
| `- item` | A bulleted list |
| `1. item` | A numbered list |
| `## Heading` | A heading |

Leave blank lines around paragraphs, lists and larger blocks. Use the composer's **Formatting help** for a reminder while writing.

## Quote or mention someone

Use **Quote** on a post to bring its text into the reply composer, then keep the relevant part. Type `@username` to mention a member. With JavaScript enabled, suggestions help complete names; typed mentions still work without it.

Suggestions respect the profiles you can see and your ignore list. A mention is not a way to grant someone access to a private thread.

## Show code

Put three backticks on separate lines around code and optionally name its language:

````text
```ts
const answer = 42
```
````

Recognized languages are highlighted when the post is rendered. An omitted or unrecognized language displays plain code.

## Add tables and checklists

```text
| Item | Status |
| --- | --- |
| Venue | Booked |
```

```text
- [ ] Invite speakers
- [x] Book the room
```

Saved task-list boxes show a record of completion; readers cannot toggle them as interactive tasks.

## Hide a spoiler

```text
:::spoiler
The answer is inside this disclosure.
:::
```

Spoilers use a disclosure that can be opened with a mouse or keyboard and works without JavaScript.

## Add images and attachments

For an externally hosted image:

```text
![Describe the image](https://example.com/photo.png)
```

Remote images only load when the board permits them. Provide a useful description for readers who cannot see the image.

For a local file, use the attachment controls offered by the forum. Files normally appear beneath the post. **Insert attachment** uploads an image and inserts its `[attachment=id]` marker into the text; that toolbar enhancement requires JavaScript. With JavaScript disabled, use the ordinary attachment form and submit with the post.

Only permitted attachments resolve. Removing an inline marker is not the same operation as deleting the attachment. When editing a post, use its attachment management controls to remove or retain files, then verify the saved result.

## Use link previews

On boards allowing remote images, a supported video URL on its own line can show a static preview card. A link inside a paragraph stays a link. Previews are not embedded video players.

## Polls and drafts

If the forum allows polls, use the new-thread poll controls and check the choices, multiple-selection limit and voter visibility before submitting. Later edits may be restricted once voting begins.

Use saved drafts at `/usercp/drafts` to resume unfinished writing. Browser composer recovery is an enhancement, not a replacement for saving important text. Posting, editing and deletion remain subject to permissions and any time limit.

See [Member guide](member-guide.md) for the posting workflow and [Notifications](notifications.md) for following replies.
