import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // The app ships in English and Turkish, so a bare sentence in JSX is a bug:
    // it is copy that will never be translated. This catches the ones that slip
    // back in. It only sees JSX children - a hardcoded placeholder or aria-label
    // gets past it, so it is a safety net rather than a proof.
    //
    // ignoreProps is on because otherwise every className is an error.
    files: ['src/pages/**/*.tsx', 'src/components/**/*.tsx'],
    plugins: { react },
    rules: {
      'react/jsx-no-literals': ['error', {
        ignoreProps: true,
        allowedStrings: [
          // Punctuation and separators that sit between translated pieces.
          '—', '•', '·', '(', ')', '%', '/', ':', '×',
          // The product's own name and logo mark: a brand is not translated,
          // for the same reason "Türkçe" and "English" are not.
          'U', 'UUP',
        ],
      }],
    },
  },
])
