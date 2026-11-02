// Lint config for the Node side of the repo: the mock server, the shared package and the e2e script.
// The terminal app has its own config (apps/terminal/eslint.config.js, Expo's rules).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'apps/terminal/**', 'design/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,mjs,js}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // `_name` marks a value that is deliberately unused (e.g. destructured out of an object).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-console': ['warn', { allow: ['log', 'warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  // Code passed to page.evaluate() runs in the browser.
  { files: ['e2e/**'], languageOptions: { globals: { ...globals.browser } } },
  prettier,
);
