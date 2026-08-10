export interface MarkdownLimits {
  readonly maxInput: number
  readonly maxDepth: number
  readonly maxNodes: number
  readonly maxUrlLength: number
  readonly maxDelimiters: number
}

export const DEFAULT_LIMITS: MarkdownLimits = {
  maxInput: 64 * 1024,
  maxDepth: 12,
  maxNodes: 4000,
  maxUrlLength: 2048,
  maxDelimiters: 2000,
}
