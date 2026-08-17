import { z } from 'zod'

import {
  defaultPort,
  isUsableOrigin,
  MAIL_PRESET_BY_ID,
  type MailConfig,
  type MailSecurity,
  mailConfigProblems,
  normaliseOrigin,
} from '@meith/settings'

export const MAIL_SKIP = 'skip'

const mailFields = {
  mailPreset: z.string().trim().default(MAIL_SKIP),
  mailFrom: z.string().trim().default(''),
  mailHost: z.string().trim().default(''),
  mailPort: z.string().trim().default(''),
  mailSecurity: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['tls', 'starttls', 'none']).optional(),
  ),
  mailUsername: z.string().trim().default(''),
  mailSecret: z.string().trim().default(''),
  mailEndpoint: z.string().trim().default(''),
}

const installInputObject = z.object({
  boardName: z.string().trim().min(1, 'Give the board a name.').max(100, 'That name is too long.'),
  username: z
    .string()
    .trim()
    .min(3, 'The administrator’s name must be at least 3 characters.')
    .max(30, 'That name is too long.'),
  email: z.string().trim().email('That does not look like an e-mail address.'),
  boardUrl: z
    .string()
    .trim()
    .min(1, 'The board needs to know its own address.')
    .refine(isUsableOrigin, 'Give the absolute address, with no path — https://forum.example.')
    .transform(normaliseOrigin),
  password: z
    .string()
    .min(12, 'The administrator’s password must be at least 12 characters.')
    .max(200, 'That password is too long.'),
  ...mailFields,
})

export const installInputSchema = installInputObject.superRefine((value, ctx) => {
  if (value.mailPreset === MAIL_SKIP) return

  const preset = MAIL_PRESET_BY_ID.get(value.mailPreset)
  if (preset === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mailPreset'],
      message: 'Choose one of the listed options.',
    })
    return
  }

  if (value.mailFrom === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mailFrom'],
      message: 'Mail needs an address to come from.',
    })
  } else if (!z.string().email().safeParse(value.mailFrom).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mailFrom'],
      message: 'That does not look like an e-mail address.',
    })
  }

  if (preset.transport === 'http') {
    const endpoint = value.mailEndpoint === '' ? (preset.endpoint ?? '') : value.mailEndpoint
    if (endpoint === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mailEndpoint'],
        message: 'This provider needs an API endpoint.',
      })
    } else if (!z.string().url().safeParse(endpoint).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mailEndpoint'],
        message: 'That is not a URL.',
      })
    }
    if (value.mailSecret === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mailSecret'],
        message: 'This provider needs an API key.',
      })
    }
    return
  }

  if (value.mailHost === '' && (preset.host ?? '') === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mailHost'],
      message: 'Give the SMTP server’s hostname.',
    })
  }

  if (value.mailPort !== '') {
    const port = Number(value.mailPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mailPort'],
        message: 'A port is a whole number between 1 and 65535.',
      })
    }
  }

  const username = value.mailUsername === '' ? (preset.username ?? '') : value.mailUsername
  if (username !== '' && value.mailSecret === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mailSecret'],
      message: 'This server is being given a username, so it needs a password too.',
    })
  }
  if (username === '' && value.mailSecret !== '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mailUsername'],
      message: 'A password was given with no username.',
    })
  }
})

export type InstallInput = z.infer<typeof installInputSchema>

export const INSTALL_FIELDS: readonly string[] = Object.keys(installInputObject.shape)

export const SECRET_FIELDS: readonly string[] = ['password', 'mailSecret']

export const ECHOED_FIELDS: readonly string[] = INSTALL_FIELDS.filter(
  (name) => !SECRET_FIELDS.includes(name),
)

export interface FormLike {
  get(name: string): unknown
}

export function installInputFromForm(form: FormLike): Record<string, string> {
  return Object.fromEntries(
    INSTALL_FIELDS.map((name) => {
      const value = form.get(name)
      return [name, typeof value === 'string' ? value : '']
    }),
  )
}

export interface EnvironmentAnswers {
  readonly boardUrl: string | null
  readonly mailIsFromEnvironment: boolean
}

export function withEnvironmentAnswers(
  raw: Record<string, string>,
  environment: EnvironmentAnswers,
): Record<string, string> {
  const answered = { ...raw }

  if (environment.boardUrl !== null && environment.boardUrl !== '') {
    answered.boardUrl = environment.boardUrl
  }

  if (environment.mailIsFromEnvironment) {
    answered.mailPreset = MAIL_SKIP
    for (const name of INSTALL_FIELDS) {
      if (name.startsWith('mail') && name !== 'mailPreset') answered[name] = ''
    }
  }

  return answered
}

export function mailConfigFromInstallInput(input: InstallInput): MailConfig {
  if (input.mailPreset === MAIL_SKIP) return { transport: 'log' }

  const preset = MAIL_PRESET_BY_ID.get(input.mailPreset)
  if (preset === undefined) return { transport: 'log' }

  if (preset.transport === 'http') {
    return {
      transport: 'http',
      from: input.mailFrom,
      endpoint: input.mailEndpoint === '' ? (preset.endpoint ?? '') : input.mailEndpoint,
      token: input.mailSecret,
    }
  }

  const security: MailSecurity = input.mailSecurity ?? preset.security ?? 'starttls'

  return {
    transport: 'smtp',
    from: input.mailFrom,
    host: input.mailHost === '' ? (preset.host ?? '') : input.mailHost,
    port:
      input.mailPort === ''
        ? preset.security === security && preset.port !== undefined
          ? preset.port
          : defaultPort(security)
        : Number(input.mailPort),
    security,
    username: input.mailUsername === '' ? (preset.username ?? '') : input.mailUsername,
    password: input.mailSecret,
  }
}

export function parseInstallInput(
  raw: Record<string, unknown>,
): { ok: true; value: InstallInput } | { ok: false; errors: Record<string, string> } {
  const parsed = installInputSchema.safeParse(raw)
  if (parsed.success) {
    const problems = mailConfigProblems(mailConfigFromInstallInput(parsed.data))
    if (problems.length > 0) {
      return { ok: false, errors: { mailPreset: problems.join(' ') } }
    }
    return { ok: true, value: parsed.data }
  }

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
