import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/coverage/**', '**/*.config.*'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      // core 纯净性第二道墙（第一道是包依赖图）：禁止引入 Electron / 原生能力
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'core 层禁止依赖 Electron（AGENTS.md 分层铁律）' },
            { name: 'nut.js', message: 'core 层禁止原生能力，平台耦合只允许在 LinkerService' },
            { name: 'koffi', message: 'core 层禁止原生能力，平台耦合只允许在 LinkerService' },
            { name: 'onnxruntime-node', message: 'core 层禁止推理运行时' },
          ],
          patterns: [
            {
              group: ['electron/*', 'node:*'],
              message: 'core 层禁止平台/运行时 API（AGENTS.md 分层铁律）',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'packages/app/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        performance: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
