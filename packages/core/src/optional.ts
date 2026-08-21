export function optional<T, R extends object>(
  dep: T | undefined,
  build: (dep: T) => R,
): R | Record<string, never> {
  return dep === undefined ? {} : build(dep)
}
