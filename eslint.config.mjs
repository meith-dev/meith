import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next*/**',
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
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
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

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/no-explicit-any': 'warn',

      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      'no-console': ['error', { allow: ['warn', 'error'] }],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',

      'no-cond-assign': ['error', 'always'],
    },
  },

  {
    files: ['**/*.test.ts', 'packages/testkit/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: [
      'scripts/**',
      'apps/cli/**',
      'apps/worker/**',
      'packages/create-meith/**',
      '**/*.config.{ts,mts,mjs,js,cjs}',
      '**/drizzle.config.ts',
      '**/*.test.ts',
      'packages/testkit/**',
    ],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
    },
  },

  {
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
