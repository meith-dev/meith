/**
 * The numbers, with **no imports at all**.
 *
 * Exactly `@meith/attachments/limits`'s reason: the avatar form is a client
 * component and needs these to say "up to 2 MB, scaled to 200×200". Reaching
 * them through the package barrel pulls the service in, which pulls
 * `@meith/core` in, which pulls `node:async_hooks` into a browser bundle — a
 * build error, and the right one. A leaf module lets both sides share the
 * numbers without sharing a dependency graph.
 */

/**
 * The box an avatar is fitted into.
 *
 * Not a crop: the image is scaled to fit and keeps its aspect ratio, so a wide
 * photograph comes out wide. Cropping to a square would decide for somebody
 * which half of their face to keep, and a theme that wants a circle can have
 * one with CSS.
 */
export const AVATAR_BOX = { width: 200, height: 200 } as const

/**
 * The per-file ceiling, before any group permission.
 *
 * Far below F42's 16 MB, and deliberately: an avatar is a 200px image, so
 * anything larger is a photograph somebody has not resized and is about to be
 * thrown away by the encoder anyway. Refusing early is a better error than a
 * slow success.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
