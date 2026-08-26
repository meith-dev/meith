/*
 * Colours for the images the site generates — the social cards and the PNG
 * favicons. Satori renders these off-DOM, where no stylesheet and therefore no
 * design token can reach, so like src/content/chrome.ts this file restates the
 * values as literals: the card colours are the dark scheme's tokens from
 * src/styles/globals.css, and the icon green is the ramp's mid step from
 * public/icon.svg. Each must follow its source when that changes.
 */

export const card = {
  canvas: '#08090c',
  fg: '#f2f3f6',
  fgMuted: '#a3a9b6',
  fgSubtle: '#6e7480',
  accent: '#34d399',
  border: '#202430',
} as const

export const icon = {
  ground: '#0b8f66',
  mark: '#ffffff',
} as const
