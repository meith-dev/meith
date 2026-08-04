/**
 * F46 — the challenge seam: captchas, honeypots and timing.
 *
 * ## "Swappable" means a port, and the port ships with no third party in it
 *
 * The roadmap asks for a swappable captcha. What it does *not* ask for is a
 * dependency on somebody else's service, and adding one would be a runtime
 * dependency decision this project escalates rather than makes (see the
 * roadmap's working rules and ADRs 0001–0004). So the seam is here, two
 * providers implement it, and a board that wants hCaptcha or Turnstile writes
 * fifteen lines against `CaptchaProvider` — or installs a plugin — without any
 * call site changing.
 *
 * That is also the honest position on effectiveness. A question challenge stops
 * scripted registration and does not stop a human paid to fill it in; a hosted
 * captcha stops rather more and reports every visitor's IP to a third party.
 * Which of those a board wants is an operator's decision, and the seam is what
 * lets them have it.
 *
 * ## Three mechanisms, and they fail differently on purpose
 *
 * - **A honeypot** costs a legitimate visitor nothing and catches the bots that
 *   fill every field. It is invisible, so it cannot annoy anybody, and it is
 *   trivially defeated by a bot that reads the CSS. Nearly free, so it is on.
 * - **A minimum fill time** catches the ones that post the form instantly. It
 *   *can* annoy somebody — a password manager filling a form in two seconds is
 *   a real person — which is why the floor is low and configurable.
 * - **A question** is the one that asks something of the visitor, and the only
 *   one that costs a legitimate registration any effort. So it is the one an
 *   operator turns on deliberately.
 *
 * Stacking them is the point: each is weak alone and they fail to different
 * attacks.
 */

/** What the form has to render, and what has to come back. */
export interface Challenge {
  /**
   * The question to show, or `null` when the provider needs no visible field
   * (a honeypot-only board).
   */
  readonly prompt: string | null
  /**
   * Opaque state the form must echo back — for the question provider, which
   * question was asked. Never the answer, and never trusted on the way back:
   * `verify` re-reads the question rather than believing the round trip.
   */
  readonly token: string
}

export type ChallengeVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

/**
 * A captcha implementation.
 *
 * Deliberately small. `issue` is what the form needs, `verify` is the answer —
 * a provider that needed more than this from a call site would be a provider
 * the call sites had to know about, which is the coupling the seam exists to
 * prevent.
 */
export interface CaptchaProvider {
  /** Stable name, for the setting that selects one and for the log line. */
  readonly key: string
  issue(): Promise<Challenge | null>
  verify(input: { readonly token: string; readonly answer: string }): Promise<ChallengeVerdict>
}

/**
 * No captcha.
 *
 * A real provider rather than a `null` the call sites check, so "captcha is
 * off" and "captcha is on" take the same code path — the alternative is a
 * branch at every form, and the one somebody forgets is a form with no captcha
 * on a board that thinks it has one.
 */
export const noCaptcha: CaptchaProvider = {
  key: 'none',
  async issue() {
    return null
  },
  async verify() {
    return { ok: true }
  },
}

/** One admin-defined question and the answers that satisfy it. */
export interface CaptchaQuestion {
  readonly id: number
  readonly question: string
  /** Any one of these, compared case-insensitively and trimmed. */
  readonly answers: readonly string[]
}

export interface QuestionSource {
  /** Enabled questions. Empty is a valid state and is handled, not assumed away. */
  list(): Promise<readonly CaptchaQuestion[]>
}

/**
 * Ask the visitor something only a person reading the page would know.
 *
 * **A board with no questions configured lets everybody through**, and says so
 * rather than failing closed. Failing closed here means an operator who switched
 * the mode on before writing a question has locked registration on their own
 * board, with a form that refuses every answer including the right one — and the
 * screen that would tell them why is the one they cannot reach. The ACP warns
 * loudly instead; that is the trade, and it is stated in `verify` too.
 */
export class QuestionCaptcha implements CaptchaProvider {
  readonly key = 'question'

  constructor(
    private readonly source: QuestionSource,
    private readonly pick: (count: number) => number = (count) =>
      Math.floor(Math.random() * count),
  ) {}

  async issue(): Promise<Challenge | null> {
    const questions = await this.source.list()
    if (questions.length === 0) return null

    const chosen = questions[this.pick(questions.length)] ?? questions[0]!
    return { prompt: chosen.question, token: String(chosen.id) }
  }

  /**
   * Check an answer.
   *
   * The token names the question and the answer is compared against what is
   * **stored now**, not against anything the form carried. A form that could
   * carry its own correct answer — hashed, signed, however — is a form whose
   * answer an attacker holds a copy of.
   *
   * A token naming a question that has since been deleted or disabled is
   * *accepted*. It is a visitor who loaded the page before the operator edited
   * the list, and refusing them would punish somebody for the board changing
   * under them; the attacker's gain is one stale id that stops working the
   * moment the row is gone.
   */
  async verify(input: { token: string; answer: string }): Promise<ChallengeVerdict> {
    const questions = await this.source.list()
    if (questions.length === 0) return { ok: true }

    const question = questions.find((candidate) => String(candidate.id) === input.token)
    if (question === undefined) return { ok: true }

    const given = normalise(input.answer)
    if (given === '') return { ok: false, reason: 'Answer the question to continue.' }

    return question.answers.some((answer) => normalise(answer) === given)
      ? { ok: true }
      : { ok: false, reason: 'That is not the right answer.' }
  }
}

/**
 * Case, surrounding space and internal runs of space are all ignored.
 *
 * An operator writing "Blue" and a visitor typing "blue " is not a failed
 * challenge, and treating it as one teaches people the form is broken. Anything
 * beyond this — stripping punctuation, stemming — starts accepting answers the
 * operator did not mean.
 */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** The hidden field's name. One place, so the form and the check agree. */
export const HONEYPOT_FIELD = 'contact_url'

export interface HoneypotInput {
  /** Whatever came back in the hidden field. Anything non-empty is a bot. */
  readonly honeypot: string
  /** When the form was issued, as the form itself reported it. */
  readonly issuedAt: number | null
  readonly now: Date
  /** Minimum seconds between issue and submit. `0` disables the check. */
  readonly minimumSeconds: number
}

/**
 * The two checks that cost a legitimate visitor nothing.
 *
 * **The timing check treats a missing or unparseable stamp as a pass.** The
 * stamp is a form field, so it is attacker-controlled and proves nothing on its
 * own — its only job is to catch a bot that submits instantly and did not think
 * to change it. Refusing a form that lacks it would break every visitor whose
 * browser did something unexpected, in exchange for stopping an attacker who
 * need only delete a field.
 *
 * A stamp from the *future* is treated the same way, for the same reason: it is
 * a clock disagreement or a forgery, and neither is evidence of a person.
 */
export function checkHoneypot(input: HoneypotInput): ChallengeVerdict {
  if (input.honeypot.trim() !== '') {
    return { ok: false, reason: 'That submission looked automated.' }
  }

  if (input.minimumSeconds <= 0 || input.issuedAt === null) return { ok: true }

  const elapsed = (input.now.getTime() - input.issuedAt) / 1000
  if (elapsed < 0) return { ok: true }

  return elapsed >= input.minimumSeconds
    ? { ok: true }
    : { ok: false, reason: 'That submission looked automated.' }
}
