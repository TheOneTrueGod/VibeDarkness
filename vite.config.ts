import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appVersion = JSON.parse(
    readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
).version as string;

export default defineConfig({
    define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    plugins: [react()],
    root: '.',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'app/js'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./app/js/test/vitestSetup.ts'],
        // Only discover project tests under app/. Vitest replaces default exclude when
        // `exclude` is set, so list node_modules/worktrees explicitly (see vitest.config
        // docs). `include` is the primary guard against dependency test files.
        include: ['app/**/*.{test,spec}.{ts,tsx}'],
        exclude: [
            '**/node_modules/**',
            '**/.claude/worktrees/**',
            'dist/**',
            'app/js-out/**',
        ],
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        chunkSizeWarningLimit: 2000,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                    if (id.includes('pixi.js')) {
                        return 'pixi';
                    }
                    if (id.includes('games/minion_battles')) {
                        return 'minion_battles';
                    }
                    return undefined;
                },
            },
        },
    },
    css: {
        devSourcemap: true,
    },
    server: {
        proxy: {
            '/api': 'http://localhost:8000',
        },
    },
});
