// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Deterministic packages (sim, procgen, shared, content) must produce identical results
 * in every browser and in the Durable Object. Non-deterministic or engine-dependent APIs
 * are banned there. Use @ao/shared Rng and dsin/dcos/datan2 instead.
 */
const nonDeterministicMath = [
  'random',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'exp',
  'expm1',
  'log',
  'log2',
  'log10',
  'log1p',
  'pow',
  'cbrt',
  'hypot',
].map((property) => ({
  object: 'Math',
  property,
  message: `Math.${property} is banned in deterministic code: use @ao/shared (Rng, dsin, dcos, datan2, dpow).`,
}));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.wrangler/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'apps/server/worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: [
      'scripts/**',
      '*.config.*',
      'e2e/**',
      'apps/client/build/**',
      'apps/client/vite.config.ts',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['packages/**/*.ts'],
    ignores: ['packages/**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...nonDeterministicMath,
        { object: 'Date', property: 'now', message: 'Time comes from the fixed tick counter.' },
        {
          object: 'performance',
          property: 'now',
          message: 'Time comes from the fixed tick counter.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Wall-clock time is banned in deterministic code.' },
        { name: 'performance', message: 'Wall-clock time is banned in deterministic code.' },
        { name: 'setTimeout', message: 'Use tick-based timers.' },
        { name: 'setInterval', message: 'Use tick-based timers.' },
        { name: 'crypto', message: 'Use @ao/shared Rng.' },
        { name: 'window', message: 'No DOM in deterministic packages.' },
        { name: 'document', message: 'No DOM in deterministic packages.' },
      ],
    },
  },
  prettier,
);
