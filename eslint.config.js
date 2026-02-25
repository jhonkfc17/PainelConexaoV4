import js from '@eslint/js'
import globals from 'globals'
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
    rules: {
      // O projeto usa objetos vindos do Supabase/Edge Functions e payloads dinâmicos.
      // Manter `any` liberado evita falso-positivo massivo no VS Code.
      '@typescript-eslint/no-explicit-any': 'off',

      // Permite blocos vazios intencionais (ex.: placeholders / try/catch sem ação).
      'no-empty': 'off',

      // Ajusta o unused-vars para ignorar padrões comuns (ex.: _).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Evita "ruído" no VS Code para dependências de hooks (o time decide caso a caso).
      'react-hooks/exhaustive-deps': 'off',
      // Permite resetar estados ao abrir/fechar modais sem falso positivo.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
