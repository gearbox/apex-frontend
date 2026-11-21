import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.svelte'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/testing/**'],
              message: 'Testing support modules must only be imported by test files.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    ignores: ['src/lib/product/**', 'src/**/*.test.ts', 'src/mocks/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'BinaryExpression[operator=/^[!=]==?$/] > Literal[value=/^(vex|synthara)$/]',
          message:
            'Do not branch on a product id. Add a field to ProductProfile (src/lib/product/profiles.ts) instead.',
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'svelte/require-each-key': 'error',
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
  {
    ignores: [
      'build/',
      '.svelte-kit/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
      'src/paraglide/',
    ],
  },
);
