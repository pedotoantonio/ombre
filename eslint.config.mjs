import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/.turbo/**', '**/dist/**', '**/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Gli script statici progressivi del sito (per esempio il trascinamento del
  // pianificatore, D60) girano nel navigatore: i globali sono i suoi.
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: {
      globals: { document: 'readonly', window: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' },
    },
  },
);
