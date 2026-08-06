import { describe, expect, it } from 'vitest'

import {
  QuestionCaptcha,
  checkHoneypot,
  noCaptcha,
  type CaptchaQuestion,
} from './challenge'
import { holdsForReview } from './first-post'

const NOW = new Date('2026-08-04T12:00:30Z')

function source(questions: readonly CaptchaQuestion[]) {
  return { async list() { return questions } }
}

const QUESTIONS: readonly CaptchaQuestion[] = [
  { id: 1, question: 'What colour is the sky?', answers: ['blue', 'azure'] },
  { id: 2, question: 'Two plus two?', answers: ['4', 'four'] },
]

describe('no captcha', () => {
  it('issues nothing and accepts anything', async () => {
    expect(await noCaptcha.issue()).toBeNull()
    expect(await noCaptcha.verify({ token: 'x', answer: '' })).toEqual({ ok: true })
  })
})

describe('the question captcha', () => {
  it('issues a question and a token naming it', async () => {
    const captcha = new QuestionCaptcha(source(QUESTIONS), () => 1)
    expect(await captcha.issue()).toEqual({ prompt: 'Two plus two?', token: '2' })
  })

  it('accepts any of the configured answers', async () => {
    const captcha = new QuestionCaptcha(source(QUESTIONS))
    expect(await captcha.verify({ token: '1', answer: 'blue' })).toEqual({ ok: true })
    expect(await captcha.verify({ token: '1', answer: 'azure' })).toEqual({ ok: true })
  })

  it('ignores case, surrounding space and runs of space', async () => {
    const captcha = new QuestionCaptcha(source([
      { id: 1, question: 'Name the board?', answers: ['The Bike Shed'] },
    ]))
    expect(await captcha.verify({ token: '1', answer: '  the   bike shed ' })).toEqual({
      ok: true,
    })
  })

  it('refuses a wrong answer', async () => {
    const captcha = new QuestionCaptcha(source(QUESTIONS))
    expect(await captcha.verify({ token: '1', answer: 'green' })).toMatchObject({ ok: false })
  })

  it('refuses an empty answer with a different message from a wrong one', async () => {
    const captcha = new QuestionCaptcha(source(QUESTIONS))
    const empty = await captcha.verify({ token: '1', answer: '   ' })
    expect(empty).toMatchObject({ ok: false })
    expect(empty.ok === false && empty.reason).toContain('Answer the question')
  })

  it('checks the answer against what is stored now, not against the form', async () => {
    const questions = [{ id: 1, question: 'Colour?', answers: ['blue'] }]
    const captcha = new QuestionCaptcha({ async list() { return questions } })

    expect(await captcha.verify({ token: '1', answer: 'blue' })).toEqual({ ok: true })
    questions[0] = { id: 1, question: 'Colour?', answers: ['red'] }
    expect(await captcha.verify({ token: '1', answer: 'blue' })).toMatchObject({ ok: false })
  })

  it('lets everybody through when no question is configured', async () => {
    const captcha = new QuestionCaptcha(source([]))
    expect(await captcha.issue()).toBeNull()
    expect(await captcha.verify({ token: '1', answer: '' })).toEqual({ ok: true })
  })

  it('accepts a token naming a question that has since gone', async () => {
    const captcha = new QuestionCaptcha(source(QUESTIONS))
    expect(await captcha.verify({ token: '99', answer: 'anything' })).toEqual({ ok: true })
  })
})

describe('the honeypot', () => {
  const base = { issuedAt: null, now: NOW, minimumSeconds: 0 }

  it('passes an empty field', () => {
    expect(checkHoneypot({ ...base, honeypot: '' })).toEqual({ ok: true })
    expect(checkHoneypot({ ...base, honeypot: '   ' })).toEqual({ ok: true })
  })

  it('catches anything filled in', () => {
    expect(checkHoneypot({ ...base, honeypot: 'http://spam.test' })).toMatchObject({ ok: false })
  })
})

describe('the fill-time floor', () => {
  const filled = (secondsAgo: number) => NOW.getTime() - secondsAgo * 1000

  it('passes a form that took long enough', () => {
    expect(
      checkHoneypot({ honeypot: '', issuedAt: filled(10), now: NOW, minimumSeconds: 3 }),
    ).toEqual({ ok: true })
  })

  it('catches one submitted instantly', () => {
    expect(
      checkHoneypot({ honeypot: '', issuedAt: filled(0), now: NOW, minimumSeconds: 3 }),
    ).toMatchObject({ ok: false })
  })

  it('passes when there is no stamp at all', () => {
    expect(
      checkHoneypot({ honeypot: '', issuedAt: null, now: NOW, minimumSeconds: 3 }),
    ).toEqual({ ok: true })
  })

  it('passes a stamp from the future rather than treating it as evidence', () => {
    expect(
      checkHoneypot({ honeypot: '', issuedAt: filled(-30), now: NOW, minimumSeconds: 3 }),
    ).toEqual({ ok: true })
  })

  it('is off at zero', () => {
    expect(
      checkHoneypot({ honeypot: '', issuedAt: filled(0), now: NOW, minimumSeconds: 0 }),
    ).toEqual({ ok: true })
  })

  it('still catches a filled field on a slow form', () => {
    expect(
      checkHoneypot({ honeypot: 'x', issuedAt: filled(600), now: NOW, minimumSeconds: 3 }),
    ).toMatchObject({ ok: false })
  })
})

describe('first-post moderation', () => {
  const member = { userId: 7, postCount: 0, bypassesModeration: false }

  it('is off at a threshold of zero', () => {
    expect(holdsForReview(member, { threshold: 0 })).toBe(false)
  })

  it('holds while the account has fewer posts than the threshold', () => {
    expect(holdsForReview({ ...member, postCount: 0 }, { threshold: 2 })).toBe(true)
    expect(holdsForReview({ ...member, postCount: 1 }, { threshold: 2 })).toBe(true)
    expect(holdsForReview({ ...member, postCount: 2 }, { threshold: 2 })).toBe(false)
    expect(holdsForReview({ ...member, postCount: 9 }, { threshold: 2 })).toBe(false)
  })

  it('does not hold somebody the board has granted a moderation bypass', () => {
    expect(
      holdsForReview({ ...member, bypassesModeration: true }, { threshold: 5 }),
    ).toBe(false)
  })

  it('does not apply to a guest, who cannot reach a posting path anyway', () => {
    expect(holdsForReview({ ...member, userId: null }, { threshold: 5 })).toBe(false)
  })
})
