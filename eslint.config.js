// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      'tools/pipeline/cache/*',
      'android/*',
      'ios/*',
      '.expo/*',
    ],
  },
  {
    // src/core must stay pure: no React, Expo or native imports, no `any`.
    files: ['src/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'react/*'], message: 'src/core must not import React.' },
            { group: ['expo', 'expo-*', '@expo/*'], message: 'src/core must not import Expo.' },
            {
              group: ['@shopify/*', 'react-native*'],
              message: 'src/core must not import native modules.',
            },
          ],
        },
      ],
    },
  },
]);
