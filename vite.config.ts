import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Source folder whose files are emitted under `dist/assets/characters/`. */
const PORTRAITS_DIR = 'app/js/games/minion_battles/character_defs/portraits/';

function isPortraitAsset(filePath: string | undefined): boolean {
    return !!filePath && filePath.replace(/\\/g, '/').includes(PORTRAITS_DIR);
}
const appVersion = JSON.parse(
    readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
).version as string;

export default defineConfig({
    define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    plugins: [react()],
    // Markdown is only imported with `?raw` (Ideas page), but `vitest related` strips the
    // query when crawling the import graph and would parse the bare .md as JS. Treating .md
    // as an asset makes that bare transform a harmless URL export.
    assetsInclude: ['**/*.md'],
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
        // Discovery (include/exclude) lives in vitest.workspace.ts projects.
    },

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        chunkSizeWarningLimit: 2000,
        // Portraits are always emitted as files (never inlined as data URIs) so they
        // all live in dist/assets/characters/. Other assets keep Vite's 4 KB default.
        assetsInlineLimit: (filePath) => (isPortraitAsset(filePath) ? false : undefined),
        rollupOptions: {
            output: {
                assetFileNames(assetInfo) {
                    if (assetInfo.originalFileNames.some(isPortraitAsset)) {
                        // Keep the character folder in the name: portraits/warrior/portrait.svg
                        // → assets/characters/warrior-portrait-<hash>.svg
                        const source = assetInfo.originalFileNames.find(isPortraitAsset)!.replace(/\\/g, '/');
                        const character = source.split(PORTRAITS_DIR)[1].split('/')[0];
                        return `assets/characters/${character}-[name]-[hash][extname]`;
                    }
                    return 'assets/[name]-[hash][extname]';
                },
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
            '/lobby_debug': 'http://localhost:8000',
        },
    },
});
