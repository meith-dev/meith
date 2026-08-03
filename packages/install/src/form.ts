/**
 * F83 — the install form's input, validated where it can be tested.
 *
 * Zod, shared with the Server Action, per the project's rule that one schema
 * serves the form, the action and the CLI. The interesting part is what it does
 * *not* do: it never checks whether a username is taken or whether the password
 * satisfies the board's policy, because both of those belong to the registration
 * command the installer calls (F18) and a second copy would eventually disagree
 * with it — most likely by being laxer.
 */

import { z } from 'zod'

/**
 * The three questions worth asking, and no more.
 *
 * An installer that collected a timezone, a language, a board description and a
 * theme is one people abandon halfway. Everything else has a default and an
 * admin screen; a board name and an administrator are the two things that cannot
 * be defaulted.
 */
export const installInputSchema = z.object({
  boardName: z
    .string()
    .trim()
    .min(1, 'Give the board a name.')
    .max(100, 'That name is too long.'),
  username: z
    .string()
    .trim()
    .min(3, 'The administrator’s name must be at least 3 characters.')
    .max(30, 'That name is too long.'),
  email: z.string().trim().email('That does not look like an e-mail address.'),
  /*
   * Twelve, not eight, and only for this account. It is the one credential that
   * can reconfigure the board, it is created before any rate limiting or lockout
   * has a board to protect, and its owner is choosing it in a hurry — which is
   * exactly when "password1" gets typed.
   */
  password: z
    .string()
    .min(12, 'The administrator’s password must be at least 12 characters.')
    .max(200, 'That password is too long.'),
})

export type InstallInput = z.infer<typeof installInputSchema>

/** Field-keyed errors, in the shape the no-JS form renders. */
export function parseInstallInput(
  raw: Record<string, unknown>,
): { ok: true; value: InstallInput } | { ok: false; errors: Record<string, string> } {
  const parsed = installInputSchema.safeParse(raw)
  if (parsed.success) return { ok: true, value: parsed.data }

  const errors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    /* First message per field: a stack of three about one input is noise. */
    errors[key] ??= issue.message
  }
  return { ok: false, errors }
}

/**
 * A slug for the first forum, from the board's name.
 *
 * Not asked for. A slug is a URL detail nobody has an opinion about at install
 * time, and the forum screen can rename it in a minute.
 */
export function defaultForumSlug(boardName: string): string {
  const slug = boardName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  /* A board named "日本語" slugs to nothing; "general" is better than an empty path. */
  return slug === '' ? 'general' : slug
}
