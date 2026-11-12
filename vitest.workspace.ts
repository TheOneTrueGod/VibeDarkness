import { defineWorkspace } from 'vitest/config';

/** Sim-only files: keep out of the unit project via matching exclude globs. */
const SIM_INCLUDE = [
    'app/**/*.scenarios.test.ts',
    'app/**/testing/runner/SimulationRunner.test.ts',
    'app/**/testing/runner/exposedDurationExtension.test.ts',
] as const;

const SHARED_EXCLUDE = [
    '**/node_modules/**',
    '**/.claude/worktrees/**',
    'dist/**',
    'app/js-out/**',
] as const;

export default defineWorkspace([
    {
        extends: './vite.config.ts',
        test: {
            name: 'unit',
            include: ['app/**/*.{test,spec}.{ts,tsx}'],
            exclude: [...SHARED_EXCLUDE, ...SIM_INCLUDE],
        },
    },
    {
        extends: './vite.config.ts',
        test: {
            name: 'sim',
            include: [...SIM_INCLUDE],
            exclude: [...SHARED_EXCLUDE],
        },
    },
]);
