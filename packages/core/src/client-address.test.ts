import { describe, expect, it } from "vitest"

import { forwardedChain, resolveClientAddress } from "./client-address"

describe("forwardedChain", () => {
  it("splits, trims and drops the empty entries", () => {
    expect(forwardedChain(" 1.1.1.1 , , 2.2.2.2 ")).toEqual(["1.1.1.1", "2.2.2.2"])
  })

  it("reads an absent header as an empty chain", () => {
    expect(forwardedChain(null)).toEqual([])
    expect(forwardedChain("")).toEqual([])
  })
})

describe("resolveClientAddress", () => {
  it("takes the only entry behind a single proxy", () => {
    expect(resolveClientAddress({ forwardedFor: "203.0.113.7" }, 1)).toBe("203.0.113.7")
  })

  it("counts hops from the right, not the left", () => {
    const chain = "203.0.113.7, 198.51.100.4"
    expect(resolveClientAddress({ forwardedFor: chain }, 2)).toBe("203.0.113.7")
    expect(resolveClientAddress({ forwardedFor: chain }, 1)).toBe("198.51.100.4")
  })

  it("walks a three-proxy chain", () => {
    const chain = "203.0.113.7, 198.51.100.4, 198.51.100.5"
    expect(resolveClientAddress({ forwardedFor: chain }, 3)).toBe("203.0.113.7")
  })

  it("discards entries a caller prepended", () => {
    const spoofed = "10.0.0.1, 127.0.0.1, 203.0.113.7"
    expect(resolveClientAddress({ forwardedFor: spoofed }, 1)).toBe("203.0.113.7")
  })

  it("discards a spoofed chain longer than the trusted one", () => {
    const spoofed = "9.9.9.9, 8.8.8.8, 203.0.113.7, 198.51.100.4"
    expect(resolveClientAddress({ forwardedFor: spoofed }, 2)).toBe("203.0.113.7")
  })

  it("stops at the leftmost entry when the chain is shorter than configured", () => {
    expect(resolveClientAddress({ forwardedFor: "203.0.113.7" }, 3)).toBe("203.0.113.7")
  })

  it("ignores forwarding headers entirely when no proxy is trusted", () => {
    expect(
      resolveClientAddress({ forwardedFor: "203.0.113.7", realIp: "203.0.113.7" }, 0),
    ).toBeNull()
  })

  it("falls back to the address the nearest proxy set", () => {
    expect(resolveClientAddress({ forwardedFor: null, realIp: "203.0.113.7" }, 1)).toBe(
      "203.0.113.7",
    )
  })

  it("resolves to nothing when neither header is present", () => {
    expect(resolveClientAddress({}, 1)).toBeNull()
    expect(resolveClientAddress({ forwardedFor: " ", realIp: " " }, 1)).toBeNull()
  })
})
