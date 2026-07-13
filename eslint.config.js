import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo', '**/.next/**', '**/next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // TypeScript itself catches undefined references; avoid double-reporting.
      'no-undef': 'off',
    },
  },
  {
    // packages/web only: client components' useEffect (AutoRefresh's
    // interval, DiffViewer's scroll-sync listeners) are exactly where
    // stale-closure/missing-dependency bugs live - no other package uses
    // React, so this plugin is scoped here rather than repo-wide.
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
);
