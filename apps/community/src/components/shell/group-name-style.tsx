import { getGroupStyle } from '@/server/group-identity'

/**
 * Every coloured usergroup's rule, in one style block.
 *
 * Separate from `ThemeRuntimeStyle` rather than folded into it, because the two
 * answer to different owners. The theme block is the *reader's* choice of
 * palette and changes when they pick a theme; this is the *board's* hierarchy
 * and changes when an administrator edits a group. They are cached against
 * different tags for that reason, and merging them would mean a colour change
 * to one group invalidating every theme's tokens.
 *
 * One rule per group, not per member: a thread page with twenty posters costs
 * twenty class names on twenty links, and no bytes beyond what the groups they
 * belong to already cost every other page.
 *
 * Nothing at all on a board that has not coloured a group, which is every board
 * until somebody does.
 */
export async function GroupNameStyle() {
  const css = await getGroupStyle()
  return css === '' ? null : <style id="community-group-names">{css}</style>
}
