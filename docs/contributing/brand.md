# Brand guidelines

Use the [Paper brand guidelines](https://app.paper.design/file/01M2XHWAP80F97J76E0QTY1CM6/p-2-0) and existing stylesheet tokens. The Paper guide identifies the repository styles as the source of truth when values differ.

## Logo

Use the existing mark from `apps/web/src/components/logomark.tsx` or `public/icon.svg`. The board equivalent is in `themes/meith/src/shared.tsx`.

The mark uses the current accent; its threads use accent-contrast. Static icons use `#0b8f66`. Do not recolour, rotate, outline or decorate the mark, or put it on an accent fill.

| Property | Value |
|---|---|
| Wordmark | Lowercase `meith`, sans, weight 450, tracking −0.025em |
| Lockup | 2rem mark, 2.125rem type, 0.6rem gap |
| Clear space | Half the mark height |
| Minimum | 16px mark alone; 20px mark in a lockup |
| Social-card exception | `Meith`, weight 600 |

## Colour

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

Use the accent for the primary action, current navigation, link underlines and marketing headline emphasis. Keep other surfaces neutral. Use token-derived washes and shadows rather than additional colours.

Small text needs at least 4.5:1 contrast. `--fg-subtle` does not meet that on the canvas in either scheme; use `--fg-muted` for meaningful labels. Status and selection must also have a non-colour indicator.

## Typography

Use the site's system stacks: Inter followed by system sans, the system serif stack for marketing emphasis, and the mono stack for code and section labels. Do not add font downloads. Paper and rendered social cards use Lora Italic as a consistent serif substitute.

Use weight 400 for headlines/body and 500 for subheads/buttons. Marketing headings may end in one accent-coloured serif italic phrase. Documentation headings use sentence case without that emphasis.

## Layout and controls

Use left alignment and 1px rules before adding filled panels. Marketing controls are square. Docs/app controls use 0.5rem radii and cards use 0.75rem.

The marketing shell is at most 72rem; the docs/header shell is at most 80rem, both with 2.5rem total outer space. Reuse the existing spacing scale.

Preserve the 2px accent focus outline and 2px offset. Forward/outbound actions use ↗; hover moves the arrow, not the control. Transitions last 160–180ms and respect reduced motion. Reading and native navigation must work without scripts.

## Documentation copy

Use neutral, concise instructions, verified commands and actual UI labels. Omit slogans, opinions and promotional introductions. Follow [Documentation](documentation.md) for page structure.

Use Irish/British spelling in prose. Preserve code identifiers and UI labels. Write “Meith” for the product, “meith.dev” for the website, “board” for an installation, “forum” for a section, and “thread”/“post” for content. An operator runs infrastructure; an administrator manages the board.

## Screenshots

Use actual product captures with fixture data, descriptive alt text and paired light/dark images. Store site captures in `apps/web/public/shots`.

| Capture | Pixels at 2× |
|---|---|
| Desktop | 2560 × 1640 |
| Phone | 780 × 1560 |

Exclude browser chrome, device mockups, stock/generated imagery, mascots and decorative icons. Use a flat screenshot with a border. Diagrams use the brand tokens.

## Source files

| Concern | Source under `apps/web` |
|---|---|
| Palette, typography and controls | `src/styles/globals.css` |
| Homepage | `src/styles/home.css` |
| Header/footer | `src/styles/chrome.css` |
| Inner pages | `src/styles/marketing.css` |
| Social cards | `src/og/card.tsx`, `palette.ts`, `fonts.ts` |
| Name and product copy | `src/content/site.ts`, `about.ts` |

Check both schemes, focus, contrast and phone widths before publishing. For board palettes, see [Theme tokens](../extensions/theme-design.md).
