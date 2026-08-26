// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Determinism: every simulation-affecting random draw must go through
      // the seeded mulberry32 PRNG in src/core/rng.ts. Math.random is only
      // ever acceptable for purely cosmetic effects (particle jitter etc).
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use src/core/rng.ts (mulberry32) instead of Math.random for anything simulation-affecting.' },
      ],
    },
  },
  {
    files: ['src/render/particles.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // src/core is the entire simulation and must run unchanged in Node: no
    // Pixi, no DOM, no browser globals, no reaching into render/ or ui/.
    // The level validator (tools/validate.ts) depends on this holding.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'pixi.js', message: 'src/core must not depend on the renderer.' }],
          patterns: [
            { group: ['**/render/*', '**/render', '**/ui/*', '**/ui'], message: 'src/core must not depend on render/ or ui/.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/core must run unchanged in Node — no window.' },
        { name: 'document', message: 'src/core must run unchanged in Node — no document.' },
        { name: 'localStorage', message: 'src/core must run unchanged in Node — no localStorage.' },
        { name: 'requestAnimationFrame', message: 'src/core must run unchanged in Node — use the fixed-step accumulator instead.' },
      ],
    },
  },
);
