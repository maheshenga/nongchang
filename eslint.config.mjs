import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // 全局忽略
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.swc/**', '**/coverage/**'] },

  // 配置文件(.js):Node 环境(CJS 或 ESM)
  {
    files: ['**/*.config.{js,mjs}', '**/babel.config.js', '.eslintrc.*'],
    languageOptions: { globals: globals.node },
  },

  // 基础 JS/TS 推荐
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // shared 包:纯 TS
  {
    files: ['packages/shared/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // backend 包:Node + TS
  {
    files: ['packages/backend/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',  // 部分 mock/Prisma 用 any,暂不强迫
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // web 包:React + browser
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { react: reactPlugin, 'react-hooks': hooksPlugin },
    languageOptions: { globals: globals.browser },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',            // React 19 JSX transform
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',         // 让现有的 disable 注释生效
    },
  },

  // miniapp 包:Taro/React + browser
  {
    files: ['packages/miniapp/**/*.{ts,tsx}'],
    plugins: { react: reactPlugin, 'react-hooks': hooksPlugin },
    languageOptions: { globals: { ...globals.browser, Taro: 'readonly' } },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
