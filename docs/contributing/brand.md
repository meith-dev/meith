# Brand guidelines

How Meith looks, sounds and spends its one colour, for anyone making a page, a post, a slide or a pull request that carries the name. The stylesheet is the brand: when this page and `apps/web/src/styles` disagree, the repository wins and this page is corrected.

## The idea

Meith takes its name from meitheal, the Irish tradition of neighbours coming together for shared work because the work benefits the group. The brand carries that idea quietly. It is never a craft or landscape identity: Meith is server software somebody is deciding whether to run, and it should look like it. Four ideas everything is checked against:

- **Owned.** Your domain, your server, your database. The brand never implies a platform in the middle.
- **Open.** MIT licensed and built in the open. Show the repository, the command, the real numbers.
- **Plain-spoken.** Say what the software does in the words an operator would use. No hype, no mascots.
- **Built to last.** Forums outlive chat. Restraint in colour, type and motion is how that reads on a page.

## Logo

The mark is a panel with two threads in it and a speech tail: a forum at icon size. It always takes the accent of the scheme it sits on, and the threads take the accent-contrast value. The wordmark is the name in lowercase, set in the sans at weight 450 with tracking −0.025em.

- **Proportion.** Mark height 2rem beside type at 2.125rem, with a 0.6rem gap. Scale the lockup as one unit.
- **Clear space.** Keep half the mark's height clear on every side.
- **Minimum size.** 16px for the mark alone, 20px mark height for the lockup. Below that, use the mark without the word.
- **Static assets.** Favicons and avatars cannot read tokens, so they use `#0b8f66`, which holds on light and dark. It is for icons only, never text.
- **Do not** recolour the mark, decorate it with an outline, shadow, glow or container, set it on an accent fill, or retype the word in the serif or the mono. The social card is the one exception to the wordmark: it sets “Meith” at weight 600, as `apps/web/src/og/card.tsx` does.

The site draws the mark in `apps/web/src/components/logomark.tsx` and `apps/web/public/icon.svg`; the theme draws the same mark in `themes/meith/src/shared.tsx`.

## Colour

The ground is greyscale and the accent is a single green: a deep pine against white in light, emerald against near-black in dark. Dark is a first-class scheme, not an inversion. No single green clears 4.5:1 on both grounds, so each scheme carries its own step of the ramp.

| Token | Light | Dark | Theme token |
|---|---|---|---|
| `--canvas` | `#fcfcfd` | `#08090c` | `background`, `card` |
| `--surface` | `#f4f5f8` | `#0d0f13` | `surface`, `secondary`, `muted`, `accent` |
| `--raised` | `#ffffff` | `#12141a` | — |
| `--fg` | `#0b0d12` | `#f2f3f6` | `foreground` |
| `--fg-muted` | `#4e5563` | `#a3a9b6` | `muted-foreground` |
| `--fg-subtle` | `#7c838f` | `#6e7480` | — |
| `--accent` | `#047857` | `#34d399` | `primary`, `ring` |
| `--accent-hover` | `#036045` | `#5ee7b7` | `primary-hover` |
| `--accent-contrast` | `#ffffff` | `#04160f` | `primary-foreground` |
| `--border` | `#e4e6eb` | `#202430` | `border` |
| `--border-strong` | `#d0d4dc` | `#2f3442` | `input` |

The accent marks four things and nothing else:

1. **The one primary action.** One filled button per screen. Its label takes `--accent-contrast`.
2. **The current item.** The active row in a nav or list, and the hover state of a link or top rule.
3. **A link's underline.** Text links stay in the text colour; the underline carries 60% accent until hover.
4. **The emphasised word.** The serif italic word that closes a headline, and a measured bar in a chart.

Washes are mixed from the tokens, never picked: the hero glow is accent at 18% (22% in dark), the hero grid line is `--fg` at 6% (7% in dark). Shadows are neutral, mixed from `--fg`; the glow under the primary button is the only shadow that carries a hue. There are no new colours. Status, charts and illustrations use the greyscale ramp and the accent, so in the theme the pinned, locked, moderation and group marks sit on the ramp and the label carries the meaning.

Measured pairs, against WCAG 2.1:

| Pair | Light | Dark | Use for |
|---|---|---|---|
| `--fg` on `--canvas` | 18.96:1 | 17.94:1 | All text |
| `--fg-muted` on `--canvas` | 7.31:1 | 8.45:1 | Body copy, labels |
| `--accent` on `--canvas` | 5.35:1 | 10.36:1 | Links, emphasis, small text |
| `--accent-contrast` on `--accent` | 5.48:1 | 9.69:1 | Primary button label |
| `--fg-subtle` on `--canvas` | 3.72:1 | 4.24:1 | Large or non-essential text only |

`--fg-subtle` fails for small text in both schemes, so it never carries meaning on its own.

## Typography

Three faces, no web font. The site carries no third-party request, so every face is a system stack with Inter named first.

- **Sans.** Everything by default: headlines at 400, sub-heads and buttons at 500, body at 400 in `--fg-muted`. `"Inter var", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Serif italic.** Emphasis only: one word or phrase per headline, always in the accent. Never upright, never body copy. `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif`.
- **Mono.** Section labels in uppercase, commands, tokens and version numbers. `ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace`.

The marketing scale:

| Step | Size | Weight · tracking · leading |
|---|---|---|
| Hero h1 | `clamp(3.5rem, 6.2vw, 6.5rem)` | 400 · −0.025em · 1.18 |
| Section h2 | `clamp(2.1rem, 3.5vw, 3.35rem)` | 400 · −0.025em · 1.25 |
| Item h3 | 1.02rem | 500 · 1.55 |
| Body | 0.85–0.95rem | 400 · 1.8–1.9, `--fg-muted`, measure ≤ 34rem |
| Label | mono 0.6rem | 0.075em, uppercase, `--fg-muted` |

The theme keeps the weights, tracking and leading and scales the headline steps down for an application. Its labels run at 0.6875rem, because a board's labels (pinned, locked, moderation) carry meaning and must stay legible, and a post's body runs to 60rem so code blocks, tables and long paragraphs have room.

## Interface

- **Square on the page.** Marketing buttons and panels have no radius. The 0.5rem control and 0.75rem card radii belong to docs chrome and app UI.
- **The arrow moves.** Every outbound or forward action ends in ↗, and nothing else does. On hover the arrow shifts 2px up and right; the control itself stays still.
- **Rules before boxes.** Separate items with a 1px top rule in `--border-strong`. Reach for a filled panel only for code or a change of scheme.
- **Left-aligned, always.** Headlines, copy and actions share a left edge. Intros split 1.05–1.15fr to 1fr, headline left, copy right.
- **Works without script.** Most reading and posting works with JavaScript off. Brand moments never depend on animation or client code.
- **Visible focus.** A 2px accent outline, offset 2px, on everything focusable. Never remove it, never restyle it per component.
- **Quiet motion.** Transitions run 160–180ms and collapse under `prefers-reduced-motion`. Nothing loops, nothing autoplays.
- **Never colour alone.** Current items also change weight or rule; links keep an underline; charts label their bars.

Layout measurements: the shell is `min(72rem, 100% − 2.5rem)`, the wide shell for the header and docs is `min(80rem, 100% − 2.5rem)`, the header runs wordmark and navigation from the left with search, scheme and the action from the right, bands pad 4.5rem block, grids gap 2.25rem and two-column intros 4rem, and the top beam is a 1px accent gradient, the first colour on the page.

## Imagery

Meith has no illustration style, no stock photography and no mascot. The only imagery is the software itself: real screenshots of a real board, captured in both schemes, with sample data that reads like a community.

- Every shot exists as `-light.png` and `-dark.png` in `apps/web/public/shots`, and the page swaps them with the scheme.
- Desktop 2560 × 1640, phone 780 × 1560, both at 2×. Keep the browser chrome out; the frame is the 1px border.
- Use the fixture board. Real-sounding thread titles, no celebrity names, no real member data.
- Alt text describes what the screen shows and why it matters, in a sentence, in the voice.

Not in the brand: stock or generated imagery, landscape motifs (the fields, gorse and limewash identity was retired on purpose), device mockups, and decorative icons. The only glyphs are the mark, ↗ and the theme toggle. Diagrams are Mermaid, coloured from the tokens.

## Voice

Meith talks to the person who will run the server. Short declarative sentences, concrete nouns, and a point of view about ownership. A headline states a position and lets its last word carry the weight: “Long live *the forum.*”, “A home you own. Not a platform you *rent.*”

| Say | Not |
|---|---|
| It's a PostgreSQL database you can back up, move, or take apart. | Enterprise-grade data portability for modern communities. |
| On your domain. On your terms. | The all-in-one community platform. |
| `npx create-meith my-community` | Get started in minutes with our seamless onboarding. |
| This preview uses sample data. Saving posts requires PostgreSQL. | Works out of the box for everyone. |

House style:

- **Spelling.** Irish and British English: colour, licence, organisation. Curly quotes and real apostrophes.
- **The name.** “Meith” in prose, “meith” only in the wordmark and in commands. A forum installation is a “board”.
- **Labels.** Section labels are two or three words in uppercase mono. Nothing else is uppercase.
- **No hype.** No exclamation marks, no superlatives without a number, no emoji.
- **Commands and code.** Set in mono, exactly as typed, lowercase. Never inside a sentence that ends with a full stop.
- **Numbers and versions.** Versions as 0.37.5, no “v” in prose. Node.js, PostgreSQL, pnpm: each project's own capitalisation.
- **Headings.** Sentence case. One italic emphasis at the end on marketing pages, none in docs.
- **Punctuation.** Spaced em dashes used rarely. No ampersands in sentences.

Terminology:

| Term | Means | Not |
|---|---|---|
| Meith | The project and the software. Capitalised in prose. | MEITH, Meith.dev as the product name |
| meith.dev | The website. Always lowercase, no www in copy. | Meith.dev, the Meith site |
| Board | One running installation of Meith. | Instance, site, workspace, server |
| Forum | A section of a board that holds threads. | Category, channel, room |
| Thread · post | A discussion, and one message in it. | Topic, conversation · comment, message |
| Member | Someone with an account on a board. | User (except in technical docs), customer |
| Operator | The person who runs the server a board lives on. | Admin (a role on the board), owner |
| Operator CLI | The command-line tool for backups, imports and upgrades. | Admin tool, the script |
| Theme · plugin | Extensions that change how a board looks, or what it does. | Skin, template · add-on, module, app |
| Marketplace | The listing at meith.dev/marketplace. | Store, shop |
| Self-hosted | Runs on infrastructure the community controls. | On-prem, DIY |
| Open source | MIT licensed. Two words as a noun, hyphenated before one. | OSS in headlines, “open” alone |

## Where the truth lives

| What | File |
|---|---|
| Colour, type scale, radii, base controls | `apps/web/src/styles/globals.css` |
| Homepage edition styles | `apps/web/src/styles/home.css` |
| Header, wordmark, footer | `apps/web/src/styles/chrome.css` |
| Inner marketing pages | `apps/web/src/styles/marketing.css` |
| The mark | `apps/web/src/components/logomark.tsx`, `apps/web/public/icon.svg` |
| Social card, its palette and fonts | `apps/web/src/og/card.tsx`, `palette.ts`, `fonts.ts` |
| Name, tagline, descriptions, the story of the name | `apps/web/src/content/site.ts`, `about.ts` |
| Screenshots | `apps/web/public/shots` |
| The board theme | `themes/meith/src/tokens.ts`, `shared.tsx` |

Tokens change in code first: update `globals.css`, then the theme tokens, then this page. Never introduce a colour the stylesheet does not have. Before anything public ships, check it against the list:

- One accent, only on the action, current item, link underline or emphasised word.
- Headline closes with one serif italic phrase, and only one.
- Labels are uppercase mono; nothing else is uppercase.
- Works in light and dark, and every screenshot has its pair.
- Text pairs pass 4.5:1; `--fg-subtle` is not carrying meaning.
- Corners are square on marketing surfaces.
- Forward actions end in ↗, and nothing else does.
- Copy is concrete, in Irish and British spelling, with no exclamation marks.
- The name is “Meith” in prose and “meith” in the wordmark and commands.
- Colours, type and spacing come from the theme tokens, not picked by eye.

[Theme tokens and shared controls](../extensions/theme-design.md) describes how `themes/meith` maps these rules onto the board.
