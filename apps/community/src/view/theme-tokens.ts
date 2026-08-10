export type TokenKind = 'colour' | 'length' | 'text'

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

const GROUPS: readonly GroupSpec[] = [
  {
    title: 'Brand',
    blurb:
      'The accent, and the four things it marks: the one primary button, the ' +
      'current item in a list, a link’s underline and the focus outline. The rest ' +
      'of the palette holds no hue at all, so these four are the whole of making ' +
      'the board yours. Set them together — a green button with a grey focus ring ' +
      'looks like a board that was half rebranded.',
    tokens: [
      ['primary', 'Button and link accent', 'The fill of “Post reply”, “Search” and every other primary button, and the colour a link is underlined in.'],
      ['primary-hover', 'Accent under the cursor', 'The same button while it is hovered. Usually a step darker than the accent in light mode and a step lighter in dark.'],
      ['primary-foreground', 'Text on the accent', 'Sits on top of the accent colour, so it needs to contrast with it — not with the page.'],
      ['ring', 'Focus outline', 'Drawn around whatever has keyboard focus. Keep it visible against both the page and the panels.'],
    ],
  },
  {
    title: 'Page and panels',
    blurb:
      'The three surfaces everything else sits on, and the text that sits on them. ' +
      'They are meant to be a stack: the page at the back, a band cut into it, a ' +
      'panel raised off it. Keep them in that order of lightness and the board ' +
      'keeps its depth.',
    tokens: [
      ['background', 'Page background', 'Behind the whole board. Also becomes the browser’s own toolbar colour on mobile.'],
      ['foreground', 'Body text', 'Ordinary text on the page background.'],
      ['surface', 'Band background', 'The header, a table’s heading row, and a panel’s own toolbar. Sits between the page and a panel.'],
      ['card', 'Panel background', 'Forum rows, post bodies and the footer.'],
      ['card-foreground', 'Text on panels', 'Ordinary text inside a panel.'],
      ['muted', 'Quiet surface', 'Table headers, disabled controls and other backgrounds that should recede.'],
      ['muted-foreground', 'Quiet text', 'Timestamps, counts and captions.'],
      ['secondary', 'Secondary button', 'The fill of a second-choice control, like “Preview”.'],
      ['secondary-foreground', 'Text on the secondary button', 'Contrast with the secondary fill, not with the page.'],
      ['accent', 'Hover surface', 'The tint behind a hovered row or menu item.'],
      ['accent-foreground', 'Text on the hover surface', 'Usually the same as body text.'],
      ['border', 'Rules and outlines', 'The lines between rows and around panels.'],
      ['input', 'Field outline', 'Deliberately darker than a rule: a field’s edge is information, a rule between two rows is not.'],
      ['shadow-tint', 'Panel shadow colour', 'The colour a panel’s shadow is drawn in. Needs to be far stronger in dark mode than in light — a faint shadow is invisible on a near-black page.'],
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
      ['radius', 'Corner rounding', 'A CSS length. `0px` for square corners, `0.5rem` for the default, `0.75rem` for softer ones.', 'length'],
      ['density-unit', 'Spacing step', 'Every gap on the board is a multiple of this. Lower it for a denser board.', 'length'],
      ['elevation', 'Panel shadow', 'A CSS `box-shadow`, or `none` for a flat board with no shadows at all. Its colour is “Panel shadow colour” above, so this is only the geometry.', 'text'],
      ['font-sans-stack', 'Body font', 'The face the whole board is read in. A CSS font stack — the browser uses the first name it has.', 'text'],
      ['font-heading-stack', 'Heading font', 'The face headings are set in. Defaults to the body font, so the board reads in one voice; set it to something else — `Georgia, ui-serif, serif` needs no download — to give headings a voice of their own.', 'text'],
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

export function isSchemeIndependent(name: string): boolean {
  return tokenMeta(name).kind !== 'colour'
}

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

export const BRAND_TOKENS = ['primary', 'primary-hover', 'primary-foreground', 'ring'] as const

export interface BrandPreset {
  readonly key: string
  readonly title: string
  readonly light: Readonly<Record<string, string>>
  readonly dark: Readonly<Record<string, string>>
}

export const BRAND_PRESETS: readonly BrandPreset[] = [
  {
    key: 'meith',
    title: 'Meith green',
    light: {
      primary: '#047857',
      'primary-hover': '#036045',
      'primary-foreground': '#ffffff',
      ring: '#047857',
    },
    dark: {
      primary: '#34d399',
      'primary-hover': '#5ee7b7',
      'primary-foreground': '#04160f',
      ring: '#34d399',
    },
  },
  {
    key: 'ocean',
    title: 'Ocean',
    light: {
      primary: '#1d4ed8',
      'primary-hover': '#1739a8',
      'primary-foreground': '#ffffff',
      ring: '#1d4ed8',
    },
    dark: {
      primary: '#93c5fd',
      'primary-hover': '#bfdbfe',
      'primary-foreground': '#0b1220',
      ring: '#93c5fd',
    },
  },
  {
    key: 'forest',
    title: 'Forest',
    light: {
      primary: '#15803d',
      'primary-hover': '#106430',
      'primary-foreground': '#ffffff',
      ring: '#15803d',
    },
    dark: {
      primary: '#86efac',
      'primary-hover': '#b2f5c9',
      'primary-foreground': '#052e16',
      ring: '#86efac',
    },
  },
  {
    key: 'plum',
    title: 'Plum',
    light: {
      primary: '#7e22ce',
      'primary-hover': '#651ba4',
      'primary-foreground': '#ffffff',
      ring: '#7e22ce',
    },
    dark: {
      primary: '#d8b4fe',
      'primary-hover': '#e7d0fe',
      'primary-foreground': '#2e1065',
      ring: '#d8b4fe',
    },
  },
  {
    key: 'rust',
    title: 'Rust',
    light: {
      primary: '#b91c1c',
      'primary-hover': '#961717',
      'primary-foreground': '#ffffff',
      ring: '#b91c1c',
    },
    dark: {
      primary: '#fca5a5',
      'primary-hover': '#fdc7c7',
      'primary-foreground': '#450a0a',
      ring: '#fca5a5',
    },
  },
  {
    key: 'sand',
    title: 'Sand',
    light: {
      primary: '#92400e',
      'primary-hover': '#74330b',
      'primary-foreground': '#ffffff',
      ring: '#92400e',
    },
    dark: {
      primary: '#fcd34d',
      'primary-hover': '#fde28a',
      'primary-foreground': '#3b2506',
      ring: '#fcd34d',
    },
  },
]
