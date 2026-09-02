export const BOARD_DIGEST_CADENCES = ['weekly', 'monthly'] as const

export type BoardDigestCadence = (typeof BOARD_DIGEST_CADENCES)[number]

export const BOARD_DIGEST_DEFAULT_CADENCE: BoardDigestCadence = 'weekly'

export const BOARD_DIGEST_CADENCE_INTERVAL_MS: Readonly<Record<BoardDigestCadence, number>> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
}

export function isBoardDigestCadence(value: string): value is BoardDigestCadence {
  return (BOARD_DIGEST_CADENCES as readonly string[]).includes(value)
}

export function parseBoardDigestCadence(value: string): BoardDigestCadence | null {
  return isBoardDigestCadence(value) ? value : null
}
