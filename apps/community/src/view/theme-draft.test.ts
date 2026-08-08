/**
 * The theme editor's document model.
 *
 * These are the rules that decide what an operator is *told* and what actually
 * reaches the database, which is why they were moved out of the form component:
 * a `.tsx` file in this repository has no test, and "the screen says this colour
 * is live when the board is painting another one" is a bug no type catches.
 *
 * The four values per token — shipped, saved, draft, effective — are the shape
 * every test here is circling. Collapsing any two of them is how the previous
 * version of this screen managed to be wrong about which changes were saved.
 */
import { describe, expect, it } from 'vitest'

import {
  changeCounts,
  cssVariables,
  effectiveValues,
  fieldName,
  initialDraft,
  matchesQuery,
  savedValues,
  schemesFor,
  shippedValues,
  tokenChanges,
  type EditableToken,
} from './theme-draft'

function token(over: Partial<EditableToken> = {}): EditableToken {
  return {
    name: 'primary',
    label: 'Button and link accent',
    hint: 'The fill of “Post reply”.',
    kind: 'colour',
    light: '#111111',
    dark: '#eeeeee',
    overrideLight: '',
    overrideDark: '',
    ...over,
  }
}

const radius = token({
  name: 'radius',
  label: 'Corner rounding',
  hint: 'A CSS length.',
  kind: 'length',
  light: '0.5rem',
  dark: '0.5rem',
})

describe('fields', () => {
  it('names a colour’s two fields per scheme and a length’s one', () => {
    expect(schemesFor(token())).toEqual(['light', 'dark'])
    expect(schemesFor(radius)).toEqual(['both'])
  })

  /*
   * The form's field names are a contract with `submittedTokens` in the action,
   * which parses them with a regular expression. Stated here so a rename breaks
   * a test rather than a save.
   */
  it('posts a token under token.<scheme>.<name>', () => {
    expect(fieldName('primary', 'light')).toBe('token.light.primary')
    expect(fieldName('radius', 'both')).toBe('token.both.radius')
  })
})

describe('initialDraft', () => {
  it('opens on the stored overrides, and on blanks where there are none', () => {
    const draft = initialDraft([token({ overrideLight: '#abcdef' }), radius])

    expect(draft['token.light.primary']).toBe('#abcdef')
    expect(draft['token.dark.primary']).toBe('')
    expect(draft['token.both.radius']).toBe('')
  })

  /*
   * The no-JavaScript preview posts the form and re-renders it. Seeding from
   * what came back is what stops a preview emptying the form it was launched
   * from — the values win over the stored row precisely because they are newer.
   */
  it('prefers a post-back’s values, so previewing keeps what was typed', () => {
    const draft = initialDraft([token({ overrideLight: '#abcdef' })], {
      'token.light.primary': '#123456',
    })

    expect(draft['token.light.primary']).toBe('#123456')
  })
})

describe('the three palettes', () => {
  const tokens = [token({ overrideLight: '#abcdef' }), radius]

  it('shipped ignores every override, because it is what a reset would leave', () => {
    expect(shippedValues(tokens, 'light')).toEqual({ primary: '#111111', radius: '0.5rem' })
  })

  it('saved is what the board is painting right now', () => {
    expect(savedValues(tokens, 'light').primary).toBe('#abcdef')
    /* Not overridden in dark, so dark is still the theme's own. */
    expect(savedValues(tokens, 'dark').primary).toBe('#eeeeee')
  })

  it('effective is what a save would paint', () => {
    const draft = { 'token.light.primary': '#00ff00', 'token.dark.primary': '' }
    expect(effectiveValues(tokens, draft, 'light').primary).toBe('#00ff00')
    expect(effectiveValues(tokens, draft, 'dark').primary).toBe('#eeeeee')
  })

  /*
   * The whole palette and not only the overrides. The sample sits inside the
   * control panel, which `:root` paints — so an alternate theme previewed with
   * only its overrides would show the *board's* colours everywhere it had not
   * overridden one, which is the exact mistake this screen exists to prevent.
   */
  it('effective carries every token, not only the changed ones', () => {
    expect(Object.keys(effectiveValues(tokens, {}, 'light')).sort()).toEqual([
      'primary',
      'radius',
    ])
  })

  /*
   * A `both` field is one value that has to reach both schemes. Read from the
   * wrong field name it would silently fall back to the theme's own value in
   * every sample, which looks like the editor ignoring what was typed.
   */
  it('reads a scheme-independent token’s single field in both schemes', () => {
    const draft = { 'token.both.radius': '0px' }

    expect(effectiveValues(tokens, draft, 'light').radius).toBe('0px')
    expect(effectiveValues(tokens, draft, 'dark').radius).toBe('0px')
  })

  it('treats a blank as “use the theme’s value”, never as an empty override', () => {
    expect(effectiveValues(tokens, { 'token.light.primary': '   ' }, 'light').primary).toBe(
      '#111111',
    )
  })

  it('renders a palette as custom properties', () => {
    expect(cssVariables({ primary: '#111111' })).toEqual({ '--primary': '#111111' })
  })
})

describe('tokenChanges', () => {
  it('says nothing about a token nobody has touched', () => {
    expect(tokenChanges([token()], initialDraft([token()]))).toEqual([])
  })

  it('marks a stored override that has not been edited as live', () => {
    const tokens = [token({ overrideLight: '#abcdef' })]
    const [change] = tokenChanges(tokens, initialDraft(tokens))

    expect(change?.state).toBe('saved')
    expect(change?.current).toBe('#abcdef')
    expect(change?.next).toBe('#abcdef')
  })

  it('marks a new override as added, with the theme’s value as the before', () => {
    const [change] = tokenChanges([token()], { 'token.light.primary': '#00ff00' })

    expect(change?.state).toBe('added')
    expect(change?.current).toBe('#111111')
    expect(change?.next).toBe('#00ff00')
  })

  it('marks a changed override as edited, against what the board is serving', () => {
    const [change] = tokenChanges([token({ overrideLight: '#abcdef' })], {
      'token.light.primary': '#00ff00',
    })

    expect(change?.state).toBe('edited')
    expect(change?.current).toBe('#abcdef')
    expect(change?.next).toBe('#00ff00')
  })

  /*
   * The case the old screen could not show at all. Emptying a stored override
   * read as "using the theme's value" the instant it was typed, while the board
   * carried on painting the old one until a save — so the screen and the board
   * disagreed and neither said so.
   */
  it('marks an emptied override as cleared, and says what it would go back to', () => {
    const [change] = tokenChanges([token({ overrideLight: '#abcdef' })], {
      'token.light.primary': '',
    })

    expect(change?.state).toBe('cleared')
    expect(change?.current).toBe('#abcdef')
    expect(change?.next).toBe('#111111')
  })

  it('lists a token’s schemes separately, because they are separate decisions', () => {
    const changes = tokenChanges([token()], {
      'token.light.primary': '#00ff00',
      'token.dark.primary': '#ff0000',
    })

    expect(changes.map((change) => change.scheme)).toEqual(['light', 'dark'])
  })
})

describe('changeCounts', () => {
  it('counts overrides, unsaved edits and tokens separately', () => {
    const tokens = [token({ overrideLight: '#abcdef', overrideDark: '#123456' }), radius]
    const counts = changeCounts(
      tokenChanges(tokens, {
        /* light edited, dark left as stored, radius newly overridden. */
        'token.light.primary': '#00ff00',
        'token.dark.primary': '#123456',
        'token.both.radius': '0px',
      }),
    )

    expect(counts).toEqual({ overridden: 3, unsaved: 2, tokens: 2 })
  })

  /*
   * A cleared override is unsaved work and not an override, so it counts in one
   * total and not the other. Getting this wrong makes the Save button offer to
   * save nothing, or claim an override the save is about to delete.
   */
  it('counts a cleared override as unsaved but not as an override', () => {
    const tokens = [token({ overrideLight: '#abcdef' })]
    const counts = changeCounts(tokenChanges(tokens, { 'token.light.primary': '' }))

    expect(counts).toEqual({ overridden: 0, unsaved: 1, tokens: 0 })
  })
})

describe('matchesQuery', () => {
  it('matches the token name, the label and the hint', () => {
    expect(matchesQuery(token(), 'primary')).toBe(true)
    expect(matchesQuery(token(), 'accent')).toBe(true)
    expect(matchesQuery(token(), 'post reply')).toBe(true)
  })

  it('ignores case and surrounding space', () => {
    expect(matchesQuery(token(), '  PRIMARY ')).toBe(true)
  })

  it('matches everything when the box is empty, and nothing that is absent', () => {
    expect(matchesQuery(token(), '')).toBe(true)
    expect(matchesQuery(token(), 'wallpaper')).toBe(false)
  })
})
