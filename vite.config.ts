import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    root: '.',
    test: {
        globals: true,
        environment: 'node',
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
