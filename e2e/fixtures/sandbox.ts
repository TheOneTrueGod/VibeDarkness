/**
 * Network / navigation confinement for Playwright contexts.
 * Keeps the browser on project-local origins and blocks file://.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { PLAYWRIGHT_ALLOWED_ORIGINS } from '../sandboxConstants';

const allowedOrigins = new Set<string>(PLAYWRIGHT_ALLOWED_ORIGINS);

function isAllowedUrl(raw: string): boolean {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }

    if (url.protocol === 'file:') return false;
    // In-page blobs / data URIs are fine; they do not leave the process.
    if (url.protocol === 'blob:' || url.protocol === 'data:') return true;
    // Vite HMR and same-origin assets use http(s) to an allowed origin.
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') {
        return allowedOrigins.has(url.origin);
    }
    return false;
}

/**
 * Install request + navigation guards on a context.
 * Call once per context before any page navigation.
 */
export async function installPlaywrightSandbox(context: BrowserContext): Promise<void> {
    await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (!isAllowedUrl(url)) {
            await route.abort('blockedbyclient');
            return;
        }
        await route.continue();
    });

    context.on('page', (page) => attachPageGuards(page));
    for (const page of context.pages()) {
        attachPageGuards(page);
    }
}

function attachPageGuards(page: Page): void {
    page.on('framenavigated', async (frame) => {
        if (frame !== page.mainFrame()) return;
        const url = frame.url();
        if (url === 'about:blank' || url === '') return;
        if (!isAllowedUrl(url)) {
            await page.close().catch(() => undefined);
        }
    });
}
