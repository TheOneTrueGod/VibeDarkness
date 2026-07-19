#!/usr/bin/env node
/**
 * One-off / agent helper: create (or verify) a player account via the LoginScreen UI.
 *
 * Usage:
 *   npm run account:create
 *   npm run account:create -- --username Lomith --password secret
 *
 * Defaults read from .env.playwright.local (USERNAME / PASSWORD / PLAYWRIGHT_*).
 * Requires Vite (:5173) + PHP (:8000). Does not start them — run `npm run php` and
 * `npm run dev` first, or rely on an already-running stack.
 *
 * Sandbox: same constraints as e2e (Chromium sandbox on, allowed localhost origins,
 * downloads under tmp/playwright, file:// blocked).
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { TestIds } from './testIds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]);

const DOWNLOADS_DIR = path.join(rootDir, 'tmp', 'playwright', 'downloads');
const NOTES_PATH = path.join(rootDir, 'tmp', 'playwright', 'account-creation-notes.md');
const ENV_PATH = path.join(rootDir, '.env.playwright.local');
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const out = {};
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--username' || a === '-u') out.username = argv[++i];
        else if (a === '--password' || a === '-p') out.password = argv[++i];
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function isAllowedUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    if (url.protocol === 'file:') return false;
    if (url.protocol === 'blob:' || url.protocol === 'data:') return true;
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') {
        return ALLOWED_ORIGINS.has(url.origin);
    }
    return false;
}

async function installSandbox(context) {
    await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (!isAllowedUrl(url)) {
            await route.abort('blockedbyclient');
            return;
        }
        await route.continue();
    });
}

function httpOk(url, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            res.resume();
            resolve(res.statusCode != null && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve(false);
        });
    });
}

function writeEnvLocal(username, password) {
    const body = [
        '# Local Playwright / agent credentials — do not commit',
        `PLAYWRIGHT_USERNAME=${username}`,
        `PLAYWRIGHT_PASSWORD=${password}`,
        `USERNAME=${username}`,
        `PASSWORD=${password}`,
        '',
    ].join('\n');
    fs.writeFileSync(ENV_PATH, body, 'utf8');
}

function appendNotes(lines) {
    fs.mkdirSync(path.dirname(NOTES_PATH), { recursive: true });
    const stamp = new Date().toISOString();
    const block = [`## ${stamp}`, ...lines, ''].join('\n');
    fs.appendFileSync(NOTES_PATH, block, 'utf8');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log('Usage: npm run account:create -- [--username NAME] [--password PASS]');
        process.exit(0);
    }

    const fileEnv = loadEnvFile(ENV_PATH);
    const username = args.username
        ?? process.env.PLAYWRIGHT_USERNAME
        ?? fileEnv.PLAYWRIGHT_USERNAME
        ?? fileEnv.USERNAME
        ?? 'Lomith';
    const password = args.password
        ?? process.env.PLAYWRIGHT_PASSWORD
        ?? fileEnv.PLAYWRIGHT_PASSWORD
        ?? fileEnv.PASSWORD
        ?? 'Zyrustafer';

    const problems = [];

    const viteUp = await httpOk(BASE_URL);
    const phpUp = await httpOk('http://localhost:8000/');
    if (!viteUp) {
        problems.push(`Vite not reachable at ${BASE_URL}. Start with: npm run dev`);
    }
    if (!phpUp) {
        problems.push('PHP API not reachable at http://localhost:8000/. Start with: npm run php');
    }
    if (problems.length > 0) {
        for (const p of problems) console.error(`[account:create] ${p}`);
        appendNotes([
            '### Failed before browser launch',
            ...problems.map((p) => `- ${p}`),
            '- Script does not auto-start webServer (unlike `playwright test`). Agent must ensure stack is up.',
        ]);
        process.exit(1);
    }

    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

    const browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        downloadsPath: DOWNLOADS_DIR,
    });

    const context = await browser.newContext({
        acceptDownloads: true,
        baseURL: BASE_URL,
    });
    await installSandbox(context);
    const page = await context.newPage();

    let outcome = 'unknown';
    let uiError = '';

    try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });

        // Auth gate may show "Loading..." briefly while /api/account/me resolves.
        await page.getByTestId(TestIds.loginUsername).or(page.getByText('Loading...')).first().waitFor({
            state: 'visible',
            timeout: 30_000,
        });
        await page.getByTestId(TestIds.loginUsername).waitFor({ state: 'visible', timeout: 30_000 });

        // Fresh browser context should be logged out. If LoginScreen is missing, we have a problem
        // (no Log out control in the main chrome — only POST /api/account/logout).
        const createToggle = page.getByRole('button', { name: /Don't have an account\? Create one/i });
        const usernameField = page.getByTestId(TestIds.loginUsername);
        if (!(await usernameField.isVisible().catch(() => false))) {
            problems.push(
                'Login form (#username) not visible on `/` after waiting. Possible causes: '
                + 'persistent auth (unexpected), AuthGate stuck on Loading, or route change. '
                + 'There is no player-facing Log out button in AppTitleBar — logout is API-only '
                + '(`LobbyClient.logout` → POST /api/account/logout`). Prefer a fresh browser context.',
            );
            throw new Error('Could not reach LoginScreen username field');
        }

        // Switch login → create mode
        if (await createToggle.isVisible().catch(() => false)) {
            await createToggle.click();
        } else if (!(await page.getByRole('heading', { name: /Create account/i }).isVisible().catch(() => false))) {
            problems.push(
                'Create-account toggle button not found; heading "Create account" also missing. '
                + 'Selector may have changed (see LoginScreen.tsx).',
            );
            throw new Error('Cannot enter create-account mode');
        }

        await page.getByTestId(TestIds.loginUsername).fill('');
        await page.getByTestId(TestIds.loginUsername).fill(username);
        await page.getByTestId(TestIds.loginPassword).fill(password);

        const createResponsePromise = page.waitForResponse(
            (res) => res.url().includes('/api/account/create') && res.request().method() === 'POST',
            { timeout: 20_000 },
        );
        await page.getByRole('button', { name: /^Create account$/i }).click();
        const createResponse = await createResponsePromise;
        const createJson = await createResponse.json().catch(() => null);

        if (!createResponse.ok()) {
            uiError = createJson?.error ?? `HTTP ${createResponse.status()}`;
            outcome = 'api-error';
            if (/already exists/i.test(String(uiError))) {
                problems.push(
                    `Username already exists ("${uiError}"). Falling back to login to verify password.`,
                );
                const loginToggle = page.getByRole('button', { name: /Already have an account\? Log in/i });
                if (await loginToggle.isVisible().catch(() => false)) {
                    await loginToggle.click();
                } else {
                    // Still on create mode with error — toggle if needed
                    const toggle = page.getByRole('button', { name: /Already have an account\? Log in/i });
                    if (await toggle.count()) await toggle.click();
                }
                await page.getByTestId(TestIds.loginUsername).fill(username);
                await page.getByTestId(TestIds.loginPassword).fill(password);
                const loginPromise = page.waitForResponse(
                    (res) => res.url().includes('/api/account/login') && res.request().method() === 'POST',
                    { timeout: 20_000 },
                );
                await page.getByRole('button', { name: /^Log in$/i }).click();
                const loginRes = await loginPromise;
                if (!loginRes.ok()) {
                    const loginJson = await loginRes.json().catch(() => null);
                    throw new Error(`Login after exists failed: ${loginJson?.error ?? loginRes.status()}`);
                }
                outcome = 'already-exists-login-ok';
            } else {
                throw new Error(`Create account failed: ${uiError}`);
            }
        } else {
            outcome = 'created';
            // AuthGate onLogin does window.location.href = next (often `/` then client Navigate).
            await page.getByTestId(TestIds.loginUsername).waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {
                problems.push('Login #username still present after successful create response.');
            });
            if (await page.getByTestId(TestIds.loginUsername).isVisible().catch(() => false)) {
                problems.push('Still on LoginScreen after create — session cookie may not have applied through the Vite proxy.');
            }
        }

        writeEnvLocal(username, password);
        console.log(`[account:create] outcome=${outcome} username=${username}`);
        console.log(`[account:create] wrote ${path.relative(rootDir, ENV_PATH)}`);

        appendNotes([
            `### outcome: ${outcome}`,
            `- username: ${username}`,
            `- password: (stored in .env.playwright.local only — not duplicated here)`,
            `- baseURL: ${BASE_URL}`,
            uiError ? `- uiError: ${uiError}` : '- uiError: (none)',
            '#### Problems / skill notes',
            ...(problems.length ? problems.map((p) => `- ${p}`) : ['- (none this run)']),
            '#### UI selectors used (LoginScreen.tsx)',
            '- Toggle create: button name `/Don\'t have an account\\? Create one/i`',
            '- Fields: `#username`, `#password`',
            '- Submit create: button name `/^Create account$/i`',
            '- Error: `p.text-red-500`',
            '- Success signal: create API 2xx + `#username` detaches (auth gate leaves LoginScreen)',
            '- Prefer waitForResponse on POST `/api/account/create` over only watching UI error text',
            '#### Other skill notes',
            '- API path behind UI: POST `/api/account/create` via LobbyClient.createAccount (proxied Vite → PHP)',
            '- Create also starts a session (Set-Cookie); subsequent `/` skips login',
            '- Username maxLength=20 on the input',
            '- Stack must be up; this script does not start Vite/PHP (unlike playwright.config webServer)',
            '- No Log out button in AppTitleBar — use a fresh browser context for logged-out flows',
            '- AuthGate shows "Loading..." until /api/account/me returns; wait past that before filling',
            '- After success, onLogin uses full page navigation (window.location.href), not React Router alone',
        ]);

        console.log(`[account:create] notes → ${path.relative(rootDir, NOTES_PATH)}`);
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('[account:create] failed:', err);
    try {
        appendNotes([
            '### Crashed',
            `- ${err instanceof Error ? err.message : String(err)}`,
            '- Check Vite+PHP up, sandboxed origins, and LoginScreen selectors.',
        ]);
    } catch {
        /* ignore */
    }
    process.exit(1);
});
