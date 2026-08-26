import type { Serialisable, TimeModel } from './view-models'

type IsPlain<T> = T extends Serialisable<T> ? true : false

const PLAIN_PRIMITIVES: IsPlain<{ a: string; b: number; c: boolean; d: null }> = true
const PLAIN_NESTED: IsPlain<{ rows: readonly { id: number; title: string | null }[] }> = true
const PLAIN_TIME: IsPlain<TimeModel> = true
const PLAIN_OPTIONAL: IsPlain<{ a?: string | undefined }> = true

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
