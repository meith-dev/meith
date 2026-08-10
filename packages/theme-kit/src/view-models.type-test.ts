/**
 * F25 — proof that the plain-data constraint is not inert.
 *
 * `view-models.ts` asserts at compile time that every slot model is JSON-shaped.
 * That assertion passing tells you nothing on its own: a `Serialisable<T>` that
 * had been broadened to `unknown` would pass just as quietly (D10 — prove every
 * gate with a deliberate violation).
 *
 * This file is that deliberate violation, made permanent. It runs under
 * `pnpm typecheck` and `pnpm typecheck:app`, and **fails in both directions**:
 *
 *  - if the constraint stops catching a `Date`, the assignment below succeeds
 *    and TypeScript reports the `@ts-expect-error` as unused;
 *  - if the constraint is broken the other way and rejects legitimate plain
 *    data, the `PLAIN` assignments fail.
 *
 * There is no runtime here on purpose — this is checked by the compiler, not by
 * vitest, which is why the name ends `.type-test.ts` and not `.test.ts`.
 */

import type { Serialisable, TimeModel } from './view-models'

type IsPlain<T> = T extends Serialisable<T> ? true : false

const PLAIN_PRIMITIVES: IsPlain<{ a: string; b: number; c: boolean; d: null }> = true
const PLAIN_NESTED: IsPlain<{ rows: readonly { id: number; title: string | null }[] }> = true
const PLAIN_TIME: IsPlain<TimeModel> = true
const PLAIN_OPTIONAL: IsPlain<{ a?: string | undefined }> = true

/*
 * Each `@ts-expect-error` below is an assertion that the constraint fires. If
 * the constraint stops working, TypeScript errors here with "Unused
 * '@ts-expect-error' directive" — the failure mode is loud, not silent.
 */

// @ts-expect-error a Date must not be allowed in a view model — see the header of view-models.ts
const REJECTS_DATE: IsPlain<{ at: Date }> = true

// @ts-expect-error a function cannot cross to a client slot or into a JSON response
const REJECTS_FUNCTION: IsPlain<{ hrefFor: (page: number) => string }> = true

// @ts-expect-error a Map is not JSON-shaped
const REJECTS_MAP: IsPlain<{ index: Map<string, number> }> = true

// @ts-expect-error nesting does not launder it: the check is deep
const REJECTS_NESTED_DATE: IsPlain<{ rows: readonly { at: Date }[] }> = true

// @ts-expect-error a bigint has no JSON representation
const REJECTS_BIGINT: IsPlain<{ views: bigint }> = true

export const _TYPE_TEST_ASSERTIONS = [
  PLAIN_PRIMITIVES,
  PLAIN_NESTED,
  PLAIN_TIME,
  PLAIN_OPTIONAL,
  REJECTS_DATE,
  REJECTS_FUNCTION,
  REJECTS_MAP,
  REJECTS_NESTED_DATE,
  REJECTS_BIGINT,
] as const
