import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Relax rules that conflict with existing patterns.
      // no-unused-vars is `error` (was `warn`) to prevent #471's class of
      // drift recurring — unused imports / consts must be deleted or
      // prefixed with `_` to keep them as documentation.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': 'off', // Lambda uses console for structured logging
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/cdk.out/**',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      'infra/**', // CDK has its own tsconfig
      'src/frontend/**', // Astro/Preact has different JSX config
    ],
  },
);
