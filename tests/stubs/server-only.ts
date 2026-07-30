/**
 * Test stub for Next's `server-only` marker package.
 *
 * `server-only` has no standalone npm package — Next injects it — and importing
 * it merely throws if a module reaches a client bundle. Under vitest there is no
 * bundler boundary, so a module guarded by `import 'server-only'` (e.g. the
 * composition root) is perfectly safe to load. This empty module satisfies the
 * import so those modules can be unit-tested directly. Aliased in vitest.config.
 */
export {}
