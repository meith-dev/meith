export const MAX_TRUSTED_PROXY_HOPS = 8

export interface ForwardingHeaders {
  readonly forwardedFor?: string | null
  readonly realIp?: string | null
}

export function forwardedChain(value: string | null | undefined): readonly string[] {
  if (!value) return []
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export function resolveClientAddress(
  headers: ForwardingHeaders,
  trustedProxyHops: number,
): string | null {
  if (trustedProxyHops <= 0) return null

  const chain = forwardedChain(headers.forwardedFor)
  if (chain.length === 0) {
    const direct = headers.realIp?.trim()
    return direct ? direct : null
  }

  return chain[Math.max(0, chain.length - trustedProxyHops)] ?? null
}
