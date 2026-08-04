/**
 * The key the colour-scheme choice is stored under.
 *
 * Its own module because both sides need it and they are on opposite sides of
 * the client boundary: the toggle (`"use client"`) writes it, and the bootstrap
 * script inlined by the root layout (a server component) reads it. Importing a
 * value *out of* a `"use client"` module into a server component gives the
 * server a client reference rather than the string, so the two would silently
 * disagree about the key and the choice would never be honoured on reload.
 */
export const THEME_STORAGE_KEY = "meith-theme"
