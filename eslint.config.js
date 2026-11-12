import globals from 'globals';
import js from '@eslint/js';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['dist/**', 'release/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: pluginReact,
      'react-hooks': pluginReactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      // Item 7: ban locale-aware date formatting — use src/utils/money.js helpers instead
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'toLocaleDateString', message: 'Use fmtDate() from src/utils/money.js or electron/utils/dates.js' },
        { object: 'Date', property: 'toLocaleString',     message: 'Use fmtDateTime() from src/utils/money.js or electron/utils/dates.js' },
        { object: 'Date', property: 'toLocaleTimeString', message: 'Use fmtDate/fmtDateTime from utils/dates.js' },
      ],
    },
  },
];
