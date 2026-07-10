import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// I2: Förbjudna plattformsord i packages/core/src
const FORBIDDEN_GLOBALS = ['fetch', 'window', 'document', 'localStorage'];
const FORBIDDEN_IDENTIFIERS = ['google', 'googleapis'];

export default [
  {
    files: ['packages/core/src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-restricted-globals': [
        'error',
        ...FORBIDDEN_GLOBALS.map((name) => ({
          name,
          message: `Invariant I2: '${name}' är förbjudet i packages/core. Använd en port/adapter i Ring 2.`,
        })),
      ],
      'no-restricted-syntax': [
        'error',
        ...FORBIDDEN_IDENTIFIERS.map((name) => ({
          selector: `Identifier[name="${name}"]`,
          message: `Invariant I2: '${name}' är förbjudet i packages/core.`,
        })),
        {
          selector: "MemberExpression[object.name='window']",
          message: "Invariant I2: 'window' är förbjudet i packages/core.",
        },
        {
          selector: "MemberExpression[object.name='document']",
          message: "Invariant I2: 'document' är förbjudet i packages/core.",
        },
        {
          selector: "MemberExpression[object.name='localStorage']",
          message: "Invariant I2: 'localStorage' är förbjudet i packages/core.",
        },
        {
          selector: "CallExpression[callee.name='fetch']",
          message: "Invariant I2: 'fetch' är förbjudet i packages/core.",
        },
      ],
    },
  },
];
