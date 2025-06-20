import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import solid from "eslint-plugin-solid/configs/typescript";

export default tseslint.config(
  { ignores: ['frontend/dist'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],

    files: ['**/*.{ts,tsx}'],

    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
    ...solid,
  }
);
