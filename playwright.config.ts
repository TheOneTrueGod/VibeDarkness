import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import {
    PLAYWRIGHT_DEFAULT_BASE_URL,
    PLAYWRIGHT_DOWNLOADS_DIR,
    PLAYWRIGHT_OUTPUT_DIR,
    PLAYWRIGHT_REPORT_DIR,
    PLAYWRIGHT_TMP_DIR,
    PLAYWRIGHT_TRACE_DIR,
} from './e2e/sandboxConstants';

for (const dir of [
    PLAYWRIGHT_TMP_DIR,
    PLAYWRIGHT_DOWNLOADS_DIR,
    PLAYWRIGHT_OUTPUT_DIR,
    PLAYWRIGHT_REPORT_DIR,
    PLAYWRIGHT_TRACE_DIR,
]) {
    fs.mkdirSync(dir, { recursive: true });
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? PLAYWRIGHT_DEFAULT_BASE_URL;

/**
 * Headless Chromium e2e / agent smoke config.
 * Sandbox defaults: Chromium OS sandbox on, downloads under tmp/playwright,
 * no --no-sandbox. Origin / file:// guards live in e2e/fixtures/sandbox.ts.
 *
 * Not part of `npm run ci` — run explicitly via `npm run test:e2e`.
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 1 : undefined,
    outputDir: PLAYWRIGHT_OUTPUT_DIR,
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: PLAYWRIGHT_REPORT_DIR }],
    ],
    timeout: 60_000,
    expect: { timeout: 10_000 },
    use: {
        ...devices['Desktop Chrome'],
        baseURL,
        headless: true,
        acceptDownloads: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        launchOptions: {
            // Playwright defaults chromiumSandbox to false; we require it on.
            chromiumSandbox: true,
            downloadsPath: PLAYWRIGHT_DOWNLOADS_DIR,
        },
    },
    projects: [
        {
            name: 'chromium-sandboxed',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    // Full local stack: PHP API + Vite (proxies /api → :8000). reuseExistingServer
    // so agents can attach to already-running `npm run php` / `npm run dev`.
    webServer: [
        {
            command: 'npm run php',
            url: 'http://localhost:8000',
            reuseExistingServer: true,
            timeout: 120_000,
        },
        {
            command: 'npm run dev',
            url: 'http://localhost:5173',
            reuseExistingServer: true,
            timeout: 120_000,
        },
    ],
});
