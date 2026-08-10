import { getGroupStyle } from '@/server/group-identity'

export async function GroupNameStyle() {
  const css = await getGroupStyle()
  return css === '' ? null : <style id="forum-group-names">{css}</style>
}
