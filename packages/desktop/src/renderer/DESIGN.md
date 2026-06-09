# meith — UI Design System

This document defines the visual language for the **meith** desktop workbench
(the Electron renderer in `packages/desktop/src/renderer`). Follow it whenever
you add or change UI so the app stays cohesive. It is self-contained — you do
not need any prior context to apply it.

## 1. Brand & personality

**meith** is a developer tool. The name evokes a _meitheal_ — Irish for a group
of workers who gather to share one task. The product idea: several callers (the
renderer, the CLI, an agent) cooperate around **one shared tool registry** that
does the heavy lifting.

Design personality: a **warm, focused, dense developer workbench**. It should
feel like a quiet, high-craft IDE — not a flashy consumer app.

- Calm and utilitarian. Chrome recedes; content leads.
- Warm, not cold. We use a warm "harvest" palette (amber/gold + warm neutrals),
  never cold blue-grays or indigo.
- Information-dense but legible. Compact spacing, hairline borders, small but
  readable type.
- The amber brand color is a **seasoning, not a sauce** — use it sparingly.

## 2. Color system

All color is defined as OKLCH design tokens in `src/styles.css` and exposed to
Tailwind via `@theme inline`. **Always style with the semantic token classes**
(`bg-background`, `text-foreground`, `border-border`, `bg-primary`, etc.).

**Never** hard-code colors. Do not use `text-white`, `bg-black`, `bg-slate-800`,
`text-indigo-500`, hex values in `className`, or arbitrary color values like
`bg-[#1a1a1a]`. If you need a new color role, add a token in `styles.css` (both
`:root` and `.dark`) and register it under `@theme inline`.

### The palette (token → role)

| Token | Role |
| --- | --- |
| `background` / `foreground` | App canvas + primary text. Warm near-black / warm off-white. |
| `card` / `card-foreground` | Raised surfaces: panels, popovers' base, drawers. |
| `popover` / `popover-foreground` | Floating menus, dropdowns, tooltips. |
| `primary` / `primary-foreground` | **The amber/gold brand color.** Used sparingly. |
| `secondary` / `secondary-foreground` | Quiet buttons and chips. |
| `muted` / `muted-foreground` | Subtle fills + secondary/label text. |
| `accent` / `accent-foreground` | Hover states, low-emphasis highlights (warm wheat). |
| `destructive` | Errors, dangerous actions (warm red). |
| `border` | Hairline separators and outlines (low-alpha). |
| `input` | Form control borders. |
| `ring` | Focus rings (amber). |
| `sidebar-*` | The left rail / chrome surfaces — slightly distinct from `card`. |

### Brand color discipline (important)

`primary` (amber) is the **only** brand color and must stay rare. Reserve it for:

- the brand mark / logo,
- **active** state indicators (active tab icon, selected item accent),
- focus rings (`ring`),
- the "runtime connected" status dot and other live/positive signals,
- one primary call-to-action per surface (e.g. the "Run tool" button).

Do **not** paint large surfaces, full panels, or most buttons amber. Most
buttons are `secondary`, `ghost`, or `outline`. Stick to **3–5 effective colors**
on screen: the warm neutrals (background/card/muted), text, the amber accent,
and at most one status color.

### Dark-first

The app ships **dark only** — `<html>` carries the `dark` class and there is no
theme toggle. The `:root` (light) palette exists for completeness; design and
verify against the `.dark` palette. Both palettes share the warm hue family
(hue ≈ 70–80 in OKLCH) — keep any new tokens in that warm range.

## 3. Typography

Two font roles only, both set as CSS variables in `styles.css` and applied with
Tailwind classes:

- **`font-sans`** (system UI stack) — all UI chrome and prose. This is the default.
- **`font-mono`** (SF Mono / JetBrains Mono stack) — code, tool names, JSON
  arguments, logs, URLs, IDs, and any machine/technical text.

Rules:

- Use `font-mono` to signal "this is code/data" (tool identifiers, JSON, log
  lines). Use `font-sans` everywhere else.
- Body/UI text uses comfortable line height (`leading-relaxed` / `leading-6`).
- Never go below 14px for body text. Dense metadata may use `text-xs`/`text-sm`
  but keep it `muted-foreground`, not tiny + low-contrast everywhere.
- Headings/labels: prefer `font-semibold` or `font-medium` with
  `tracking-tight`. Section labels are often `text-xs uppercase tracking-wide
  text-muted-foreground`.

## 4. The brand mark

Defined in `src/components/MeithMark.tsx`:

- `MeithMark` — the SVG glyph. Three outer nodes (renderer, CLI, agent) connected
  by spokes inward to a single central **hub** (the tool registry). The hub is
  filled with `primary` (amber); outer nodes/spokes use `currentColor` at reduced
  opacity so the mark inherits text color and reads on any surface.
- `MeithWordmark` — the mark plus the lowercase wordmark "meith".

Usage:

- The glyph inherits `currentColor`; set its color via the parent (e.g.
  `text-foreground`). Only the central hub stays amber.
- Size with `className="size-5"` (title bar) / `size-6` (wordmark) / `size-7`
  (default). Already used in `TitleBar.tsx` and `SpacesRail.tsx`.
- The brand name is always lowercase: **meith**.
- Do not redraw, recolor, or replace this mark with a generic icon. Reuse the
  component.

## 5. Layout & spacing

This is a **fixed-viewport desktop shell**, not a scrolling web page. `body` is
`overflow: hidden`; scrolling happens inside bounded panes.

Structure (outermost → in):

- A custom **title bar** (`drag-region` for OS window dragging; interactive
  children opt out with `no-drag`).
- A left **SpacesRail** (icon rail) + main workspace + optional bottom
  diagnostics drawer + a **StatusBar** footer.

Layout rules:

- **Flexbox first**; CSS Grid only for genuine 2D layouts. No floats, no
  absolute positioning unless truly necessary.
- Use the Tailwind spacing scale (`p-2`, `gap-3`, `px-4`) — avoid arbitrary
  values like `p-[13px]`.
- Use `gap-*` for spacing between flex/grid children. Never mix margin/padding
  with `gap` on the same element, and never use `space-*` utilities.
- Radius comes from the `--radius` token (`rounded-md`, `rounded-lg`).
- Separators are hairline `border-border`, not heavy or shadowed dividers.

### Scrolling & overflow (critical — this caused a real bug)

In a fixed-height shell, panes must be **bounded** so their content scrolls
inside them instead of overflowing onto neighbors (e.g. a panel overlapping the
status bar).

When building any fixed-height pane with scrollable content:

- Give the container a bounded height (`h-72`, `flex-1`, etc.) **and**
  `overflow-hidden` so children cannot spill past it.
- In a flex/grid child that must scroll, add `min-h-0` (flex) or `grid-rows-1` /
  `minmax(0,1fr)` (grid) so the row can actually shrink — without this, the
  child grows to fit its content and overflows.
- Put the scroll on a `ScrollArea` (or `overflow-auto`) element that has
  `h-full min-h-0`.

## 6. Components

- Use the existing shadcn/ui primitives in `src/components/ui/*` (Button, Tabs,
  ScrollArea, Tooltip, etc.). Match their variants rather than restyling inline.
- **Buttons:** default to `variant="secondary"`, `"ghost"`, or `"outline"`.
  Reserve the amber default/primary button for the single most important action
  on a surface.
- **Active vs. inactive:** show active state with an amber icon tint
  (`text-primary`) and/or a subtle `bg-accent`/`bg-secondary` fill — not by
  flooding the element with amber.
- **Icons:** use `lucide-react` only. Consistent sizes (`size-3.5`, `size-4`,
  `size-5`). Never use emojis as icons.
- **Status:** "connected/live/healthy" uses an amber (`primary`) dot; errors use
  `destructive`. Keep status text in `muted-foreground`.
- Tooltips/menus use `popover` tokens; keep them compact.

## 7. Do / Don't

**Do**

- Style exclusively through semantic tokens.
- Keep the amber accent rare and intentional.
- Keep chrome quiet, dense, and warm; let content lead.
- Bound every scrollable pane (`overflow-hidden` + `min-h-0`).
- Reuse `MeithMark` and the `ui/*` primitives.

**Don't**

- Don't introduce indigo/violet/cold blue-gray, or any hard-coded hex/`text-white`/`bg-black`.
- Don't add gradients (the workbench is solid-color) unless explicitly requested.
- Don't add a third font family or use decorative fonts.
- Don't paint large surfaces or most buttons amber.
- Don't use emojis, raw `find`/`grep` styling hacks, or absolute positioning for layout.
- Don't add a light-mode toggle — the app is dark-only.
