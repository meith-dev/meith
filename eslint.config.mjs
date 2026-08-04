/**
 * F01 — lint configuration.
 *
 * ESLint 9+ flat config. This file existing at all is the point: `pnpm lint` was
 * in the verify chain from the start but had no config to load, so it exited 2
 * and the gate reported nothing useful. See docs/deviations.md.
 *
 * Scope note: the type-aware rules that would catch floating promises need a
 * program per package and are slow enough to discourage running `verify`. The
 * high-value subset here runs in seconds; the strict compiler (F01) already
 * covers most of what type-aware linting would add.
 */

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Build output and vendored code are not ours to lint.
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-e2e/**',
      '**/dist/**',
      '**/drizzle/**',
      'user_read_only_context/**',
      'v0_memories/**',
      'v0_plans/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mts,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      /*
       * Without this, `console`, `process`, `Buffer`, `URL` and the timer
       * functions are all reported as `no-undef` errors in server code — which
       * is what happened on the first real run of this config.
       */
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      /*
       * F02: the AST-precise half of the "one env reader" invariant.
       *
       * scripts/guards.mjs already greps for this, but a regex cannot tell a
       * real read from the word appearing in a comment or string, and cannot be
       * suppressed per-line with a reviewable justification. This rule can.
       *
       * `packages/core/src/env.ts` carries the single sanctioned
       * eslint-disable-next-line for it. That comment sat there unused until
       * this rule was added — ESLint's `reportUnusedDisableDirectives` is what
       * surfaced that the guard did not exist.
       */
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read configuration from `env` in @meith/core instead. It validates ' +
            'every variable once at boot (F02) so a typo fails fast with a ' +
            'readable message rather than surfacing as `undefined` at runtime.',
        },
        /*
         * F20: the model rots the moment a group ID appears outside the
         * authorization package. `Actor.groupIds` / `Actor.primaryGroupId` are
         * the only fields that expose them, so any code comparing or branching
         * on a group ID must read one of these first — banning the property
         * access is a precise proxy for "no group-ID logic here".
         *
         * Turned back off for packages/authorization/** in a later block (flat
         * config: last match wins), which is the one place allowed to know.
         * @meith/db's actor-construction reads them under a narrow, justified
         * per-line disable when that repo lands.
         */
        {
          property: 'groupIds',
          message:
            'Group IDs must not leak outside @meith/authorization (F20). Ask ' +
            'the Authorizer `can(actor, action, target)` instead of branching ' +
            'on group membership.',
        },
        {
          property: 'primaryGroupId',
          message:
            'Group IDs must not leak outside @meith/authorization (F20). Ask ' +
            'the Authorizer instead of branching on the primary group.',
        },
      ],

      /*
       * Unused values are usually a half-finished edit. The argsIgnorePattern
       * allows the `_unused` convention for required-by-signature parameters,
       * which is common in the driver interfaces.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      /*
       * `any` defeats the strict compiler settings F01 turned on. Warn rather
       * than error so an unavoidable third-party gap does not block a commit,
       * but keep it visible.
       */
      '@typescript-eslint/no-explicit-any': 'warn',

      /* Prefer the type-only form so imports erase cleanly at runtime. */
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      /* `console` is allowed only via the structured logger (F09). */
      'no-console': ['error', { allow: ['warn', 'error'] }],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',

      /*
       * Catches `if (x = 1)` and similar. Off by default in recommended for
       * historical reasons.
       */
      'no-cond-assign': ['error', 'always'],
    },
  },

  {
    /* Tests legitimately poke at internals and log. */
    files: ['**/*.test.ts', 'packages/testkit/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  {
    /*
     * CommonJS tooling config (.dependency-cruiser.cjs). Needs the `module`
     * global and commonjs sourceType, and is not matched by the .ts/.mjs block
     * above — which is why `module is not defined` was the first error reported.
     */
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      /*
       * `require()` is the only import a CommonJS file has. The rule exists to
       * keep the *application* on ES modules, and these files are neither
       * bundled nor imported by it — they are read by a CLI that demands
       * CommonJS. Disabling it here rather than per line, because every
       * `require` in a `.cjs` file is correct by definition.
       */
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    /*
     * Operator scripts and the CLI are console programs by definition, and they
     * run *outside* the app, so they have no validated `env` to import — reading
     * process.env directly is correct there.
     */
    files: [
      'scripts/**',
      'apps/cli/**',
      'apps/worker/**',
      /*
       * F82. `create-meith` is a console program in the same sense: it prints to
       * a terminal and exits, and it runs before a board — and therefore before
       * any validated env — exists at all.
       */
      'packages/create-meith/**',
      '**/*.config.{ts,mts,mjs,js,cjs}',
      '**/drizzle.config.ts',
      '**/*.test.ts',
      'packages/testkit/**',
      /*
       * instrumentation.ts is deliberately NOT exempt: it reads config through
       * assertEnv(), not process.env, and its single pre-logger console.info
       * carries a narrow eslint-disable-next-line instead. Blanket-exempting it
       * would silently allow future console noise in the boot path.
       */
    ],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
    },
  },

  {
    /*
     * The authorization package is the one place allowed to know a group ID is
     * a number (F20). Re-declare no-restricted-properties with ONLY the
     * process.env restriction: flat config cannot disable a single entry of a
     * multi-entry rule, so the group-ID entries are dropped here while the env
     * ban stays in force.
     */
    files: ['packages/authorization/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration from `env` in @meith/core instead (F02).',
        },
      ],
    },
  },

  /*
   * F24's promotion engine is group *administration*, which is a different
   * thing from the group-ID logic F20 bans.
   *
   * The rule exists to stop code deciding what someone may *do* by comparing
   * group ids — `if (user.primaryGroupId === 3) allowAdmin()`. @meith/groups
   * decides which group a user *belongs to*, which cannot be expressed without
   * naming groups: a promotion rule is literally "users in group X with N posts
   * move to group Y".
   *
   * The boundary it must not cross: this package may move a user between
   * groups, but must never conclude anything about what a group is permitted to
   * do. Its "never demote" guard takes a caller-supplied rank map and draws no
   * permission conclusion from it — that stays with the Authorizer.
   */
  {
    files: ['packages/groups/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration from `env` in @meith/core instead (F02).',
        },
      ],
    },
  },

  {
    /*
     * Drizzle schema files *define* the primary_group_id column and index it.
     * Naming a persisted column is not branching on a group ID — F20 is about
     * keeping group logic out of decisions, not out of the storage layer. Same
     * flat-config limitation as above: re-declare with only the env restriction.
     * Query/repo code under packages/db/src (outside schema/) stays covered, so
     * the actor-construction read still needs its justified per-line disable.
     */
    files: ['packages/db/src/schema/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration from `env` in @meith/core instead (F02).',
        },
      ],
    },
  },
)
