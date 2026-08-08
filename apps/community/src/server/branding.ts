import 'server-only'

/**
 * The board's logo: what is stored, and what the header gets.
 *
 * The accepting and the storing are `image-upload.ts`, shared with group
 * badges — that module is where the board decides what an uploaded file *is*,
 * and two copies of that decision is two chances for one to accept what the
 * other refuses. What is left here is the part that is about the *logo*: which
 * settings hold it, and which of the two images a given reader sees.
 */
import { CacheTags } from '@meith/core'
import { PostgresSettingsRepository, getDb } from '@meith/db'
import { drivers } from '@meith/drivers'
import { saveSettings } from '@meith/settings'

import { cache } from 'react'

import {
  forgetImage,
  isImageScheme,
  storeImage,
  type ImageScheme,
} from './image-upload'
import { getSettings } from './settings'
import { currentColourScheme } from './theme'

/** The form field an upload arrives in. */
export const LOGO_FIELD = 'logo'

/** Which of the two images is being replaced. Shared with group badges. */
export type LogoScheme = ImageScheme
export const isLogoScheme = isImageScheme

const SETTING_FOR: Record<LogoScheme, 'board.logo_light' | 'board.logo_dark'> = {
  light: 'board.logo_light',
  dark: 'board.logo_dark',
}

/**
 * Write one setting and drop what it invalidates.
 *
 * The same two steps `saveAdminSettingsAction` takes, for the same reason: a
 * write whose caches are not dropped is a change an operator watches do
 * nothing. It is a few lines rather than a shared helper because the settings
 * action also has a form, a batch, an audit entry and a permission check around
 * its pair, and a helper that fitted both would be a helper with a flag in it.
 */
async function writeSetting(key: string, value: string): Promise<void> {
  const result = await saveSettings(
    new PostgresSettingsRepository(getDb()),
    { [key]: value },
    await getSettings(),
  )

  if (result.changed.length > 0) {
    await drivers().cache.invalidateTags([CacheTags.settings(), ...result.invalidates])
  }
}

/**
 * Accept an uploaded logo, store it, and point the board at it.
 *
 * The previous object is deleted **after** the setting is written, not before.
 * If the delete fails the board still renders — it is holding a key that
 * resolves — whereas deleting first and failing to save would leave every page
 * asking for an object that is gone. A leaked object costs disk; the other
 * order costs the header.
 */
export async function saveLogo(scheme: LogoScheme, file: File): Promise<void> {
  const key = await storeImage('board', `logo-${scheme}`, file)

  const previous = (await getSettings()).get(SETTING_FOR[scheme])
  await writeSetting(SETTING_FOR[scheme], key)

  if (previous !== key) await forgetImage(previous)
}

/** Put the board back to rendering its name in text. */
export async function removeLogo(scheme: LogoScheme): Promise<void> {
  const previous = (await getSettings()).get(SETTING_FOR[scheme])
  await writeSetting(SETTING_FOR[scheme], '')

  await forgetImage(previous)
}

/**
 * The stored key for one scheme, or `null`.
 *
 * Refuses to hand back anything that is not a key this module wrote. The value
 * comes from a settings row, which an operator can edit from the CLI and a
 * restored backup can carry across from another board — and it is about to be
 * turned into a path in a file store. `local-file-store` already refuses to
 * escape its root, but "something else checks it" is the reasoning behind every
 * traversal that ever shipped.
 */
export async function logoKey(scheme: LogoScheme): Promise<string | null> {
  const key = (await getSettings()).get(SETTING_FOR[scheme])
  return /^board\/logo-(light|dark)-[a-f0-9-]{36}\.(png|jpg|webp|svg)$/.test(key) ? key : null
}

/**
 * The URL the header points at.
 *
 * `/logo/light` is a fixed path, so on its own it could never carry an
 * `immutable` cache header — a replaced logo would be the same URL and readers
 * would keep the old one until their cache felt otherwise. The stored key ends
 * in the UUID minted at upload, so putting a slice of it in the query makes the
 * URL change exactly when the image does, which is what earns the year-long
 * `max-age` the route sends.
 *
 * The route ignores `v` entirely. It is a cache key, not an argument — and a
 * route that *read* it would be a route where a wrong guess serves the wrong
 * image rather than merely a stale one.
 */
export function logoSrc(scheme: LogoScheme, key: string): string {
  return `/logo/${scheme}?v=${key.slice(-16, -4)}`
}

/** What the header renders. `null` when the board has no logo. */
export interface BoardLogo {
  /** The image every reader gets unless a dark one applies. */
  readonly src: string
  /**
   * The dark-mode image, or `null`.
   *
   * Non-null means "render a `<picture>` whose source is behind
   * `prefers-color-scheme: dark`". It is null in three different situations and
   * the theme does not need to tell them apart: the board has no dark logo, the
   * reader has forced light, or the reader has forced dark — in which case
   * `src` is already the dark one.
   */
  readonly darkSrc: string | null
  readonly alt: string
}

/**
 * Resolve the pair against the reader's chosen colour scheme.
 *
 * The decision is made here rather than in CSS because this board knows the
 * answer on the server. A theme doing it with `dark:hidden` would be wrong for
 * the commonest case: Tailwind's `dark:` variant on this board matches the
 * `.dark` *class*, and a reader on "system" has no class at all — their dark
 * mode comes from the media query in `globals.css`. They would get the light
 * logo on a black page, which is the exact failure having two images exists to
 * prevent.
 *
 * So: a forced scheme resolves to one image and no `<picture>` at all, and only
 * "system" — where the server genuinely does not know — defers to the media
 * query.
 */
export function resolveLogo(input: {
  /** Stored keys, not URLs — this builds the URLs, so they cannot drift. */
  readonly lightKey: string | null
  readonly darkKey: string | null
  readonly scheme: 'light' | 'dark' | 'system'
  readonly alt: string
  readonly boardTitle: string
}): BoardLogo | null {
  const alt = input.alt.trim() === '' ? input.boardTitle : input.alt.trim()

  /*
   * A board with only a dark logo uses it in both schemes, and the same in
   * reverse. Falling back to the other image is better than falling back to the
   * board's name in text: an operator who has uploaded one has told us what
   * they want the header to be, and showing it on the wrong background is a
   * smaller surprise than showing something else entirely.
   */
  const light = input.lightKey ?? input.darkKey
  const dark = input.darkKey ?? input.lightKey
  if (light === null || dark === null) return null

  const lightSrc = logoSrc(input.lightKey === null ? 'dark' : 'light', light)
  const darkSrc = logoSrc(input.darkKey === null ? 'light' : 'dark', dark)

  if (input.scheme === 'light') return { src: lightSrc, darkSrc: null, alt }
  if (input.scheme === 'dark') return { src: darkSrc, darkSrc: null, alt }

  return { src: lightSrc, darkSrc: darkSrc === lightSrc ? null : darkSrc, alt }
}

/** The board's logo for this request, or `null`. Memoised per render. */
export const currentLogo = cache(async (boardTitle: string): Promise<BoardLogo | null> => {
  const [settings, scheme, lightKey, darkKey] = await Promise.all([
    getSettings(),
    currentColourScheme(),
    logoKey('light'),
    logoKey('dark'),
  ])

  return resolveLogo({
    lightKey,
    darkKey,
    scheme,
    alt: settings.get('board.logo_alt'),
    boardTitle,
  })
})
