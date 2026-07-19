import { test, expect } from './fixtures/sandboxed';
import { PLAYWRIGHT_ALLOWED_ORIGINS } from './sandboxConstants';

test.describe('sandboxed smoke', () => {
    test('loads the Vite app shell on an allowed origin', async ({ page }) => {
        const response = await page.goto('/');
        expect(response, 'navigation should return a response').not.toBeNull();
        expect(response!.ok() || response!.status() === 304).toBeTruthy();

        const origin = new URL(page.url()).origin;
        expect(PLAYWRIGHT_ALLOWED_ORIGINS as readonly string[]).toContain(origin);

        // Root React mount — confirms the SPA bootstrapped.
        await expect(page.locator('#root')).toBeAttached();
    });

    test('blocks file:// navigation', async ({ page }) => {
        const errors: string[] = [];
        page.on('requestfailed', (req) => {
            if (req.url().startsWith('file:')) {
                errors.push(req.url());
            }
        });

        // Attempt to leave the sandbox; route handler should abort.
        await page.goto('file:///C:/Windows/System32/drivers/etc/hosts', {
            waitUntil: 'commit',
        }).catch(() => undefined);

        const url = page.url();
        expect(url.startsWith('file:')).toBe(false);
    });

    test('blocks navigation to an external https origin', async ({ page }) => {
        await page.goto('/');
        const failed: string[] = [];
        page.on('requestfailed', (req) => {
            if (req.url().includes('example.com')) failed.push(req.url());
        });

        await page.evaluate(async () => {
            try {
                await fetch('https://example.com/', { mode: 'no-cors' });
            } catch {
                /* expected when aborted */
            }
        });

        expect(failed.length).toBeGreaterThan(0);
    });
});
