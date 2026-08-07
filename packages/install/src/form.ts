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

import {
  MAIL_PRESET_BY_ID,
  defaultPort,
  isUsableOrigin,
  mailConfigProblems,
  normaliseOrigin,
  type MailConfig,
  type MailSecurity,
} from '@meith/settings'
import { z } from 'zod'

/**
 * The preset value meaning "not now".
 *
 * A value rather than an empty string, so that "the operator chose to skip" and
 * "the select did not submit" are different things on the server. The first is a
 * decision to record; the second is a bug, and one that would otherwise install
 * a mailless board while looking like it had worked.
 */
export const MAIL_SKIP = 'skip'

/**
 * Mail, asked at install time — the one addition to "the three questions worth
 * asking, and no more".
 *
 * It earns the exception by being the only piece of configuration that is
 * *harder* to add later than now, and not for a technical reason: a board with
 * no mail works, looks finished, and stays that way until the first member
 * forgets their password. Every other default here can be discovered from the
 * screen it lives on. This one is discovered from a support request.
 *
 * ## Every field is optional, and the requirements are conditional
 *
 * The form has no scripting (R5), so it cannot show and hide the SMTP half when
 * the preset changes — every box is on the page at once. Making them
 * individually required would therefore demand an API endpoint from somebody
 * configuring SMTP. The `superRefine` below asks only for what the *chosen*
 * transport needs, which is the same thing the visible grouping implies.
 */
const mailFields = {
  mailPreset: z.string().trim().default(MAIL_SKIP),
  mailFrom: z.string().trim().default(''),
  mailHost: z.string().trim().default(''),
  /*
   * A string, coerced later rather than by `z.coerce.number()`. An empty box is
   * the ordinary state of this field for anybody using a preset that supplies
   * the port, and `Number('')` is 0 — which would arrive at the schema as a
   * port number, out of range, and be reported as "must be at least 1" to
   * somebody who typed nothing.
   */
  mailPort: z.string().trim().default(''),
  /*
   * The blank option means "whatever the choice above uses", and it has to reach
   * the schema as **absent** rather than as an empty string.
   *
   * This is the one mail field that is an enum rather than free text, so `''` is
   * not a permissive default — it is a value outside the enum, and it fails
   * before the conditional rules below get to say the operator was skipping mail
   * entirely. Without the preprocess, a board being installed with no mail could
   * not be submitted without first picking a TLS mode for the transport it does
   * not have. Handled here rather than in the action, so the rule is where it can
   * be tested.
   */
  mailSecurity: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['tls', 'starttls', 'none']).optional(),
  ),
  mailUsername: z.string().trim().default(''),
  mailPassword: z.string().default(''),
  mailEndpoint: z.string().trim().default(''),
  mailToken: z.string().trim().default(''),
}

/**
 * The three questions worth asking, and no more — plus mail.
 *
 * An installer that collected a timezone, a language, a board description and a
 * theme is one people abandon halfway. Everything else has a default and an
 * admin screen; a board name and an administrator are the two things that cannot
 * be defaulted, and mail is the one that can be defaulted but should not be.
 */
export const installInputSchema = z
  .object({
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
     * The board's own address, prefilled by the page from the request's `Host`
     * and **confirmed here**.
     *
     * Required, unlike every mail field: a board that does not know its own
     * address sends password resets with no link in them, and unlike mail there
     * is no "skip" that leaves the board in a coherent state — the value is
     * needed by feeds, canonical URLs and every message, and the operator is
     * looking at the answer in their address bar right now.
     *
     * Validated with `isUsableOrigin` rather than `z.string().url()` because
     * this is concatenated with a path and emitted into an `href`: `mailto:` and
     * `javascript:` are URLs, and a pasted page address would put that page's
     * path in the middle of every link the board ever sends.
     */
    boardUrl: z
      .string()
      .trim()
      .min(1, 'The board needs to know its own address.')
      .refine(
        isUsableOrigin,
        'Give the absolute address, with no path — https://forum.example.',
      )
      .transform(normaliseOrigin),
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
    ...mailFields,
  })
  .superRefine((value, ctx) => {
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
      if (value.mailToken === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mailToken'],
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

    /*
     * The pair, not the fields. An unauthenticated relay is legitimate — it is
     * how a board with Postfix on the same machine sends — so neither box is
     * required. One filled and the other empty is always a mistake, and one the
     * operator will otherwise meet as an authentication failure in the log.
     */
    const username = value.mailUsername === '' ? (preset.username ?? '') : value.mailUsername
    if (username !== '' && value.mailPassword === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mailPassword'],
        message: 'This server is being given a username, so it needs a password too.',
      })
    }
    if (username === '' && value.mailPassword !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mailUsername'],
        message: 'A password was given with no username.',
      })
    }
  })

export type InstallInput = z.infer<typeof installInputSchema>

/**
 * What the operator typed, resolved against the preset they chose.
 *
 * **The typed value always wins.** The preset is a prefill and nothing more, so
 * an operator who picks "Resend (SMTP)" and then types a different host gets
 * their host — which matters because the presets are static data that will age,
 * and a board must not be un-installable because a provider moved a hostname
 * between releases.
 */
export function mailConfigFromInstallInput(input: InstallInput): MailConfig {
  if (input.mailPreset === MAIL_SKIP) return { transport: 'log' }

  const preset = MAIL_PRESET_BY_ID.get(input.mailPreset)
  if (preset === undefined) return { transport: 'log' }

  if (preset.transport === 'http') {
    return {
      transport: 'http',
      from: input.mailFrom,
      endpoint: input.mailEndpoint === '' ? (preset.endpoint ?? '') : input.mailEndpoint,
      token: input.mailToken,
    }
  }

  const security: MailSecurity = input.mailSecurity ?? preset.security ?? 'starttls'

  return {
    transport: 'smtp',
    from: input.mailFrom,
    host: input.mailHost === '' ? (preset.host ?? '') : input.mailHost,
    port:
      input.mailPort === ''
        ? /*
           * The preset's port, but only when the operator has not overridden the
           * security mode into disagreeing with it. Someone who picks a preset
           * carrying 465 and then selects STARTTLS means 587, and handing them
           * 465 produces the connection that hangs instead of failing — the
           * exact confusion `MailSecurity` is written to prevent.
           */
          preset.security === security && preset.port !== undefined
          ? preset.port
          : defaultPort(security)
        : Number(input.mailPort),
    security,
    username: input.mailUsername === '' ? (preset.username ?? '') : input.mailUsername,
    password: input.mailPassword,
  }
}

/** Field-keyed errors, in the shape the no-JS form renders. */
export function parseInstallInput(
  raw: Record<string, unknown>,
): { ok: true; value: InstallInput } | { ok: false; errors: Record<string, string> } {
  const parsed = installInputSchema.safeParse(raw)
  if (parsed.success) {
    /*
     * One more gate, and it is not a duplicate of the `superRefine` above.
     *
     * That one checks what the *form* needs; this checks what the *transport*
     * needs, through the same function the settings screen and the driver use.
     * They agree today. The point is that they cannot drift apart tomorrow
     * without this failing — an installer that accepted a config the driver
     * would refuse is a board that installs and then cannot send.
     */
    const problems = mailConfigProblems(mailConfigFromInstallInput(parsed.data))
    if (problems.length > 0) {
      return { ok: false, errors: { mailPreset: problems.join(' ') } }
    }
    return { ok: true, value: parsed.data }
  }

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
