import { z } from 'zod'

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
  password: z
    .string()
    .min(12, 'The administrator’s password must be at least 12 characters.')
    .max(200, 'That password is too long.'),
})

export type InstallInput = z.infer<typeof installInputSchema>

export function parseInstallInput(
  raw: Record<string, unknown>,
): { ok: true; value: InstallInput } | { ok: false; errors: Record<string, string> } {
  const parsed = installInputSchema.safeParse(raw)
  if (parsed.success) return { ok: true, value: parsed.data }

  const errors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    errors[key] ??= issue.message
  }
  return { ok: false, errors }
}

export function defaultForumSlug(boardName: string): string {
  const slug = boardName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return slug === '' ? 'general' : slug
}
