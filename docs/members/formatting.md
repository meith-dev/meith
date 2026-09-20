# Format posts

Posts, replies and private messages accept Markdown. The toolbar inserts the same syntax. Signatures support a restricted subset.

## Syntax

| Input | Result |
|---|---|
| `**bold**` | Bold |
| `*italic*` | Italic |
| `~~removed~~` | Strikethrough |
| `[label](https://example.com)` | Link |
| `` `code` `` | Inline code |
| `> quoted text` | Quote |
| `- item` | Bullet list |
| `1. item` | Numbered list |
| `## Heading` | Heading |

Separate paragraphs and blocks with blank lines. Use **Quote** on a post or type `@username` to mention a member. Mentions do not grant access to private content.

## Code

````text
```ts
const answer = 42
```
````

Supported languages receive syntax highlighting; other code displays as plain text.

## Tables and checklists

```text
| Item | Status |
| --- | --- |
| Venue | Booked |

- [ ] Invite speakers
- [x] Book the room
```

Saved checkboxes are read-only.

## Spoilers

```text
:::spoiler
Hidden text
:::
```

Readers open the disclosure with a mouse or keyboard. JavaScript is not required.

## Images and attachments

```text
![Image description](https://example.com/photo.png)
```

Remote images require board permission. Use descriptive alternative text.

Use the attachment form to upload files. With JavaScript, **Insert attachment** uploads an image and inserts `[attachment=id]`. Without JavaScript, submit files through the ordinary attachment form. Only permitted attachments render.

Removing a marker does not delete its file. Use the post's attachment controls to delete files.

A supported video URL on its own line can show a static preview when remote images are allowed. It does not embed a player.

## Polls and drafts

Check poll choices, selection limits and voter visibility before submitting. Editing may be restricted after voting starts. Resume saved drafts at `/usercp/drafts`; browser recovery does not replace saving a draft.
