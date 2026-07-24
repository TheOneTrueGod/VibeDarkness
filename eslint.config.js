import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'app/js-out/**', '.claude/worktrees/**', 'tmp/**'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['e2e/**/*.{ts,tsx}', 'playwright.config.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ['app/js/**/*.{ts,tsx}', 'vite-env.d.ts'],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        files: ['**/*.test.ts', '**/*.test.tsx'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.vitest,
            },
        },
    },
    {
        files: ['vite.config.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ['scripts/**/*.{js,mjs,cjs}'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ['app/js/**/*.tsx'],
        plugins: {
            'react-hooks': reactHooks,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-hooks/exhaustive-deps': 'warn',
        },
    },
    {
        files: ['**/*.{ts,tsx}'],
        rules: {
            'no-undef': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            '@typescript-eslint/no-this-alias': 'warn',
            'prefer-const': 'warn',
            'no-async-promise-executor': 'warn',
        },
    },
    {
        // Forbid Math.random() in sim-critical Minion Battles code so randomness flows
        // through the engine RNG (deterministic across host/clients). Cosmetic-only
        // randomness in card_defs/** and renderer paths remains allowed.
        files: [
            'app/js/games/minion_battles/game/**/*.{ts,tsx}',
            'app/js/games/minion_battles/abilities/**/*.{ts,tsx}',
            'app/js/games/minion_battles/units/**/*.{ts,tsx}',
            'app/js/games/minion_battles/storylines/**/*.{ts,tsx}',
            'app/js/games/minion_battles/buffs/**/*.{ts,tsx}',
        ],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
                    message: 'Math.random() is forbidden in sim-critical code; use engine.generateRandomInteger or engine.generateRandomNumber.',
                },
            ],
        },
    },
);
