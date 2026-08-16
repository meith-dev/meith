export interface PromotionRuleInput {
  readonly title: string
  readonly displayOrder: number

  readonly minPostCount: number | null
  readonly minReputation: number | null
  readonly minDaysRegistered: number | null

  readonly fromPrimaryGroupId: number | null
  readonly toPrimaryGroupId: number
}

interface Criterion {
  readonly value: number | null
  readonly label: string
}

function wholeNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function groupReference(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function promotionRuleProblem(input: PromotionRuleInput): string | null {
  if (input.title.trim() === '') return 'A promotion rule needs a title.'

  if (!wholeNumber(input.displayOrder)) {
    return 'Display order must be a whole number.'
  }

  if (!groupReference(input.toPrimaryGroupId)) {
    return 'Choose the group members are promoted into.'
  }

  if (input.fromPrimaryGroupId !== null && !groupReference(input.fromPrimaryGroupId)) {
    return 'Choose a group to promote from, or leave it as any group.'
  }

  if (input.fromPrimaryGroupId === input.toPrimaryGroupId) {
    return (
      'A rule that promotes a group into itself can never move anybody. ' +
      'Choose a different group to promote into.'
    )
  }

  const criteria: readonly Criterion[] = [
    { value: input.minPostCount, label: 'Posts' },
    { value: input.minReputation, label: 'Reputation' },
    { value: input.minDaysRegistered, label: 'Days registered' },
  ]

  for (const criterion of criteria) {
    if (criterion.value !== null && !wholeNumber(criterion.value)) {
      return `${criterion.label} must be a whole number, or blank for no limit.`
    }
  }

  if (criteria.every((criterion) => criterion.value === null)) {
    return (
      'A rule with no criteria matches every member it looks at, which is a ' +
      'board-wide group change on the next tick. Set at least one of posts, ' +
      'reputation or days registered — zero is allowed, and says so out loud.'
    )
  }

  return null
}
