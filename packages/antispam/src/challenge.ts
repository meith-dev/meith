export interface Challenge {
  readonly prompt: string | null
  readonly token: string
}

export type ChallengeVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

export interface CaptchaProvider {
  readonly key: string
  issue(): Promise<Challenge | null>
  verify(input: { readonly token: string; readonly answer: string }): Promise<ChallengeVerdict>
}

export const noCaptcha: CaptchaProvider = {
  key: 'none',
  async issue() {
    return null
  },
  async verify() {
    return { ok: true }
  },
}

export interface CaptchaQuestion {
  readonly id: number
  readonly question: string
  readonly answers: readonly string[]
}

export interface QuestionSource {
  list(): Promise<readonly CaptchaQuestion[]>
}

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

  async verify(input: { token: string; answer: string }): Promise<ChallengeVerdict> {
    const questions = await this.source.list()
    if (questions.length === 0) return { ok: true }

    const question = questions.find((candidate) => String(candidate.id) === input.token)
    if (question === undefined) return { ok: false, reason: 'That challenge expired. Try again.' }

    const given = normalise(input.answer)
    if (given === '') return { ok: false, reason: 'Answer the question to continue.' }

    return question.answers.some((answer) => normalise(answer) === given)
      ? { ok: true }
      : { ok: false, reason: 'That is not the right answer.' }
  }
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export const HONEYPOT_FIELD = 'contact_url'

export interface HoneypotInput {
  readonly honeypot: string
  readonly issuedAt: number | null
  readonly now: Date
  readonly minimumSeconds: number
}

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
