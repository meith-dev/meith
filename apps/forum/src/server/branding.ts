import 'server-only'

/**
 * The board's logo: what is stored, what is accepted, and what the header gets.
 *
 * ## Why this is not the avatar pipeline
 *
 * F58's avatars take an upload, queue a job, re-encode it through the wasm
 * codecs and track a pending state, because a member's avatar is untrusted
 * input arriving at whatever rate a board's membership feels like. A logo is
 * uploaded by an administrator, once, on a screen behind `requireAdmin`. The
 * queue, the pending state and the grace period would all be machinery
 * answering questions this feature does not have.
 *
 * What it keeps from that pipeline is every part that is about *safety*: the
 * bytes are sniffed rather than trusted, the declared content type is ignored,
 * the stored key is random rather than derived from the filename, and the
 * serving route sends the same locked-down headers an avatar does.
 *
 * ## Why the bytes decide the format
 *
 * A browser sends whatever `Content-Type` the operating system guessed from
 * the extension, and an attacker sends whatever they like. Neither is evidence.
 * `sniff` reads the magic bytes, and a file whose signature is not one of the
 * four formats below is refused — including the case that matters most, which
 * is markup with a `.png` on the end.
 *
 * SVG is the exception and needs its own argument, because it is the format an
 * operator most wants for a logo and the only one that can contain script. It
 * is accepted, and three things make that safe rather than optimistic:
 *
 *  1. it is rendered through `<img>`, and an SVG in an `<img>` cannot run
 *     script, load external resources or reach the embedding page — that is a
 *     rule of the image context, not a mitigation this code applies;
 *  2. the serving route sends `Content-Security-Policy: default-src 'none';
 *     sandbox` and `X-Content-Type-Options: nosniff`, so navigating *directly*
 *     to the file cannot execute anything either;
 *  3. the markup is checked for the constructs that would matter if either of
 *     those ever stopped holding.
 *
 * Any one of the three would probably do. Depending on one of them would mean
 * this file has an opinion about which, and it does not.
 */
import { CacheTags, ValidationError } from '@meith/core'
import { PostgresSettingsRepository, getDb } from '@meith/db'
import { drivers } from '@meith/drivers'
import { saveSettings } from '@meith/settings'

import { cache } from 'react'

import { getSettings } from './settings'
import { currentColourScheme } from './theme'

/** The form field an upload arrives in. */
export const LOGO_FIELD = 'logo'

/** Which of the two images is being replaced. */
export const LOGO_SCHEMES = ['light', 'dark'] as const
export type LogoScheme = (typeof LOGO_SCHEMES)[number]

export function isLogoScheme(value: unknown): value is LogoScheme {
  return LOGO_SCHEMES.includes(value as LogoScheme)
}

const SETTING_FOR: Record<LogoScheme, 'board.logo_light' | 'board.logo_dark'> = {
  light: 'board.logo_light',
  dark: 'board.logo_dark',
}

/**
 * 512 KiB.
 *
 * A header logo is displayed at about 32 pixels tall. Half a megabyte is
 * already an order of magnitude more than that needs and is small enough that
 * a mistake — someone uploading a photograph — is refused rather than served to
 * every visitor on every page.
 */
export const MAX_LOGO_BYTES = 512 * 1024

export interface LogoFormat {
  readonly extension: string
  readonly contentType: string
}

/**
 * Identify a format from the leading bytes, or refuse.
 *
 * Returns the content type this board will *serve* it as, which is not
 * necessarily the one the browser claimed — that value is discarded before it
 * reaches here.
 */
export function sniff(bytes: Uint8Array): LogoFormat | null {
  const starts = (...signature: number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte)

  if (starts(0x89, 0x50, 0x4e, 0x47)) return { extension: 'png', contentType: 'image/png' }
  if (starts(0xff, 0xd8, 0xff)) return { extension: 'jpg', contentType: 'image/jpeg' }
  if (starts(0x52, 0x49, 0x46, 0x46) && starts2(bytes, 8, 0x57, 0x45, 0x42, 0x50)) {
    return { extension: 'webp', contentType: 'image/webp' }
  }
  if (isSvg(bytes)) return { extension: 'svg', contentType: 'image/svg+xml' }

  return null
}

function starts2(bytes: Uint8Array, offset: number, ...signature: number[]): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * Is this SVG, and is it SVG this board is willing to serve?
 *
 * The text is decoded once and asked two questions. The first is whether it is
 * SVG at all — a leading `<svg` or an XML declaration followed by one, allowing
 * for a byte-order mark and leading whitespace, because real files have both.
 *
 * The second is whether it carries anything that would matter in a context
 * where SVG *is* live markup. `<script>`, an `on…=` handler, `<foreignObject>`
 * and `javascript:` are refused. That check is deliberately crude — it is the
 * third of three defences, not the only one, and a sanitiser thorough enough to
 * be the only one is a project rather than a function.
 */
function isSvg(bytes: Uint8Array): boolean {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096))
  /*
   * `\uFEFF` written as an escape, not as the character. A literal byte-order
   * mark in source is invisible in every editor and diff — which is the same
   * argument the `no-raw-control-characters` guard makes, and ESLint's
   * `no-irregular-whitespace` caught this one before the guard's own list did.
   */
  const head = text.replace(/^\uFEFF/, '').trimStart()

  const looksSvg = head.startsWith('<svg') || /^<\?xml[\s\S]{0,512}?<svg/i.test(head)
  if (!looksSvg) return false

  const whole = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (/<script|<foreignObject|\son\w+\s*=|javascript:/i.test(whole)) {
    throw new ValidationError(
      'That SVG contains script or an event handler, so it will not be stored. ' +
        'Export it again without interactivity, or upload a PNG.',
    )
  }
  return true
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

/** A random key, so a replacement is a new URL and no cache can serve the old. */
function storageKeyFor(scheme: LogoScheme, format: LogoFormat): string {
  return `board/logo-${scheme}-${crypto.randomUUID()}.${format.extension}`
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
  if (file.size === 0) throw new ValidationError('Choose an image first.')
  if (file.size > MAX_LOGO_BYTES) {
    throw new ValidationError(
      `That image is ${Math.ceil(file.size / 1024)} KiB. The limit is ${MAX_LOGO_BYTES / 1024} KiB — ` +
        'a header logo is about 32 pixels tall, so it does not need to be large.',
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const format = sniff(bytes)
  if (format === null) {
    throw new ValidationError(
      'That file is not a PNG, JPEG, WebP or SVG. The name is not what decides ' +
        'this — the contents are.',
    )
  }

  const files = drivers().files
  const key = storageKeyFor(scheme, format)
  await files.put(key, bytes, { contentType: format.contentType, visibility: 'public' })

  const previous = (await getSettings()).get(SETTING_FOR[scheme])
  await writeSetting(SETTING_FOR[scheme], key)

  if (previous !== '' && previous !== key) {
    await files.delete(previous).catch(() => {
      /* A leaked object is cheaper than a header that cannot render. */
    })
  }
}

/** Put the board back to rendering its name in text. */
export async function removeLogo(scheme: LogoScheme): Promise<void> {
  const previous = (await getSettings()).get(SETTING_FOR[scheme])
  await writeSetting(SETTING_FOR[scheme], '')

  if (previous !== '') {
    await drivers().files.delete(previous).catch(() => {})
  }
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
