/**
 * What each design token *means*, for the people who have to choose one.
 *
 * The theme editor used to be thirty-eight text boxes labelled with the token
 * name and prefilled with an OKLCH triple. That is a faithful rendering of the
 * data model and a poor rendering of the question: an operator wants to change
 * the colour of the "post reply" button, and what they were shown was
 * `primary` with `oklch(0.205 0 0)` beside it and no way to find out what
 * either meant short of changing it and reloading the board.
 *
 * So this file is the missing half — a group, a plain-English label, a sentence
 * about where the token is actually visible, and whether it is a colour, a
 * length or a font stack, which is what decides the control the editor renders.
 *
 * ## It is checked against the theme, not trusted
 *
 * `groupTokens` takes the token names the *theme package* declares and returns
 * the groups. A token described here that the theme does not have is dropped; a
 * token the theme has and this file does not describe is still shown, in a
 * final "Other" group, under its own name. Neither is silently lost, which is
 * the failure that would matter: a theme adding a token and this file not
 * knowing about it must not make the token uneditable.
 */

export type TokenKind = 'colour' | 'length' | 'text'

/**
 * Where a colour picker points when it has nothing to point at.
 *
 * A native `<input type="color">` has no empty state — it is always showing
 * some colour — so a token whose value the picker cannot represent still needs
 * a position for the control. Mid grey is chosen because it is obviously not a
 * decision: nothing in the default palette is this colour, so an operator
 * seeing it knows the picker is showing them nothing rather than showing them
 * the token.
 *
 * It lives here rather than in the component because a literal colour in a
 * `.tsx` file is banned outright (guard `no-hardcoded-colour`), and rightly:
 * this is the one kind of colour a component may legitimately need — a control's
 * own state, not the board's appearance — and putting it in the token module
 * keeps the guard's promise intact.
 */
export const PICKER_FALLBACK = '#808080'

/**
 * The value to hand a native colour input.
 *
 * The control speaks six-digit hex and nothing else: given `oklch(…)`, a colour
 * name, or an empty string it silently falls back to black and *reports* black
 * when read, which would turn "I did not touch this" into "I set it to black"
 * on the next save. So anything it cannot represent is converted by the caller
 * beforehand, and anything still unrepresentable lands on the fallback above.
 */
export function pickerValue(...candidates: readonly (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
      return `#${[...trimmed.slice(1)].map((digit) => digit + digit).join('')}`.toLowerCase()
    }
  }
  return PICKER_FALLBACK
}

export interface TokenMeta {
  readonly label: string
  readonly hint: string
  readonly kind: TokenKind
}

export interface TokenGroup<T> {
  readonly title: string
  readonly blurb: string
  readonly tokens: readonly T[]
}

interface GroupSpec {
  readonly title: string
  readonly blurb: string
  readonly tokens: readonly (readonly [string, string, string, TokenKind?])[]
}

/**
 * The groups, in the order the editor shows them.
 *
 * Brand first because it is the one group most boards ever touch: the default
 * palette is deliberately colourless (see `themes/default/src/tokens.ts`), so
 * setting two tokens here is the whole of "make this board ours".
 */
const GROUPS: readonly GroupSpec[] = [
  {
    title: 'Brand',
    blurb:
      'The one loud control on a page. The rest of the default palette holds no ' +
      'hue at all, so these are usually the only colours a board needs to set.',
    tokens: [
      ['primary', 'Button and link accent', 'The fill of “Post reply”, “Search” and every other primary button.'],
      ['primary-foreground', 'Text on the accent', 'Sits on top of the accent colour, so it needs to contrast with it — not with the page.'],
      ['ring', 'Focus outline', 'Drawn around whatever has keyboard focus. Keep it visible against both the page and the panels.'],
    ],
  },
  {
    title: 'Page and panels',
    blurb: 'The surfaces everything else sits on, and the text that sits on them.',
    tokens: [
      ['background', 'Page background', 'Behind the whole board. Also becomes the browser’s own toolbar colour on mobile.'],
      ['foreground', 'Body text', 'Ordinary text on the page background.'],
      ['card', 'Panel background', 'Forum rows, post bodies, the header and the footer.'],
      ['card-foreground', 'Text on panels', 'Ordinary text inside a panel.'],
      ['muted', 'Quiet surface', 'Table headers, disabled controls and other backgrounds that should recede.'],
      ['muted-foreground', 'Quiet text', 'Timestamps, counts and captions.'],
      ['secondary', 'Secondary button', 'The fill of a second-choice control, like “Preview”.'],
      ['secondary-foreground', 'Text on the secondary button', 'Contrast with the secondary fill, not with the page.'],
      ['accent', 'Hover surface', 'The tint behind a hovered row or menu item.'],
      ['accent-foreground', 'Text on the hover surface', 'Usually the same as body text.'],
      ['border', 'Rules and outlines', 'The lines between rows and around panels.'],
      ['input', 'Field outline', 'Deliberately darker than a rule: a field’s edge is information, a rule between two rows is not.'],
    ],
  },
  {
    title: 'Destructive actions',
    blurb: 'Delete, ban, and anything else that cannot be taken back.',
    tokens: [
      ['destructive', 'Destructive control', 'The fill of “Delete” and its kin.'],
      ['destructive-foreground', 'Text on the destructive control', 'Contrast with the destructive fill.'],
    ],
  },
  {
    title: 'Forums and threads',
    blurb:
      'These carry meaning rather than decoration — a locked thread is not merely ' +
      'a different colour — so every state a hue marks is also a word in the page. ' +
      'Changing them is safe; removing the difference between them is not.',
    tokens: [
      ['forum-unread', 'Forum with new posts', 'The forum name when there is something unread in it.'],
      ['forum-read', 'Forum with nothing new', 'The same name once everything has been read.'],
      ['forum-locked', 'Closed forum', 'A forum nobody may post in.'],
      ['thread-pinned', 'Pinned thread', 'Held at the top of its forum.'],
      ['thread-locked', 'Locked thread', 'Readable, but closed to replies.'],
      ['thread-moved', 'Moved thread', 'The stub left behind when a thread is moved.'],
      ['thread-unapproved', 'Thread awaiting approval', 'Visible to its author and to staff.'],
      ['thread-deleted', 'Deleted thread', 'Soft-deleted; visible to staff only.'],
    ],
  },
  {
    title: 'Posts',
    blurb: 'Backgrounds, not text — they sit behind a whole post, so keep them pale.',
    tokens: [
      ['post-highlight', 'Highlighted post', 'The post a permalink pointed at.'],
      ['post-own', 'Your own post', 'A gentle tint so a member can find themselves in a long thread.'],
      ['post-unapproved', 'Post awaiting approval', 'Held by the spam controls or by a moderator.'],
    ],
  },
  {
    title: 'Moderation',
    blurb: 'The moderation queue and the report list.',
    tokens: [
      ['moderation-pending', 'Waiting for a decision', ''],
      ['moderation-approved', 'Approved', ''],
      ['moderation-rejected', 'Rejected', ''],
    ],
  },
  {
    title: 'Member groups',
    blurb: 'The colour a member’s name is shown in beside their posts.',
    tokens: [
      ['group-admin', 'Administrator', ''],
      ['group-supermod', 'Super moderator', ''],
      ['group-mod', 'Moderator', ''],
      ['group-banned', 'Banned', ''],
    ],
  },
  {
    title: 'Shape and type',
    blurb:
      'Not colours, so these apply to light and dark alike — the editor shows one ' +
      'box rather than two.',
    tokens: [
      ['radius', 'Corner rounding', 'A CSS length. `0px` for square corners, `0.375rem` for the default, `0.75rem` for soft ones.', 'length'],
      ['density-unit', 'Spacing step', 'Every gap on the board is a multiple of this. Lower it for a denser board.', 'length'],
      ['font-mono-stack', 'Monospace font', 'Used for code blocks and token values. A CSS font stack.', 'text'],
    ],
  },
]

const META = new Map<string, TokenMeta & { group: string }>()
for (const group of GROUPS) {
  for (const [name, label, hint, kind] of group.tokens) {
    META.set(name, { label, hint, kind: kind ?? 'colour', group: group.title })
  }
}

export function tokenMeta(name: string): TokenMeta {
  return META.get(name) ?? { label: name, hint: '', kind: 'colour' }
}

/** True when a token means the same thing in both colour schemes. */
export function isSchemeIndependent(name: string): boolean {
  return tokenMeta(name).kind !== 'colour'
}

/**
 * Arrange a theme's tokens into the editor's sections.
 *
 * Driven by the names the caller passes — the theme's — so a theme that
 * declares a token nobody described still gets an editable field, and a token
 * described here that a theme does not declare is not offered.
 */
export function groupTokens<T extends { readonly name: string }>(
  tokens: readonly T[],
): readonly TokenGroup<T>[] {
  const byName = new Map(tokens.map((token) => [token.name, token]))
  const groups: TokenGroup<T>[] = []
  const placed = new Set<string>()

  for (const group of GROUPS) {
    const members: T[] = []
    for (const [name] of group.tokens) {
      const token = byName.get(name)
      if (token === undefined) continue
      members.push(token)
      placed.add(name)
    }
    if (members.length > 0) {
      groups.push({ title: group.title, blurb: group.blurb, tokens: members })
    }
  }

  const rest = tokens.filter((token) => !placed.has(token.name))
  if (rest.length > 0) {
    groups.push({
      title: 'Other',
      blurb: 'Declared by this theme, and not described by the board’s own token list.',
      tokens: rest,
    })
  }

  return groups
}

/**
 * One-click brand palettes.
 *
 * Three tokens each, which is the whole of branding a board built on a
 * colourless default: the fill of the loud control, the text on it, and the
 * focus ring. Every pair meets WCAG AA against its own fill in both schemes,
 * and the dark values are lighter fills with dark text rather than the same
 * colour reused — a colour that is legible on white is not legible on near
 * black, and applying one palette to both schemes is the mistake this feature
 * exists to stop an operator making by hand.
 */
export interface BrandPreset {
  readonly key: string
  readonly title: string
  readonly light: Readonly<Record<string, string>>
  readonly dark: Readonly<Record<string, string>>
}

export const BRAND_PRESETS: readonly BrandPreset[] = [
  {
    key: 'ocean',
    title: 'Ocean',
    light: { primary: '#1d4ed8', 'primary-foreground': '#ffffff', ring: '#1d4ed8' },
    dark: { primary: '#93c5fd', 'primary-foreground': '#0b1220', ring: '#93c5fd' },
  },
  {
    key: 'forest',
    title: 'Forest',
    light: { primary: '#15803d', 'primary-foreground': '#ffffff', ring: '#15803d' },
    dark: { primary: '#86efac', 'primary-foreground': '#052e16', ring: '#86efac' },
  },
  {
    key: 'plum',
    title: 'Plum',
    light: { primary: '#7e22ce', 'primary-foreground': '#ffffff', ring: '#7e22ce' },
    dark: { primary: '#d8b4fe', 'primary-foreground': '#2e1065', ring: '#d8b4fe' },
  },
  {
    key: 'rust',
    title: 'Rust',
    light: { primary: '#b91c1c', 'primary-foreground': '#ffffff', ring: '#b91c1c' },
    dark: { primary: '#fca5a5', 'primary-foreground': '#450a0a', ring: '#fca5a5' },
  },
  {
    key: 'sand',
    title: 'Sand',
    light: { primary: '#92400e', 'primary-foreground': '#ffffff', ring: '#92400e' },
    dark: { primary: '#fcd34d', 'primary-foreground': '#3b2506', ring: '#fcd34d' },
  },
]
