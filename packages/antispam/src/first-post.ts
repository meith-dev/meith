export interface FirstPostRule {
  readonly threshold: number
}

export interface FirstPostSubject {
  readonly userId: number | null
  readonly postCount: number
  readonly bypassesModeration: boolean
}

export function holdsForReview(
  subject: FirstPostSubject,
  rule: FirstPostRule,
): boolean {
  if (rule.threshold <= 0) return false
  if (subject.userId === null) return false
  if (subject.bypassesModeration) return false

  return subject.postCount < rule.threshold
}
