#!/usr/bin/env node
/**
 * Smoke: login → create character (if needed) → host first mission → play until tick ≥ 100 → leave.
 *
 * Usage: npm run play:smoke
 *
 * Requires Vite :5173 + PHP :8000 and credentials in .env.playwright.local
 * (or PLAYWRIGHT_USERNAME / PLAYWRIGHT_PASSWORD).
 *
 * Appends notes to tmp/playwright/mission-play-notes.md for the future skill.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
    TestIds,
    campaignTabTestId,
    missionMapNodeTestId,
    storyChoiceTestId,
} from './testIds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]);

const DOWNLOADS_DIR = path.join(rootDir, 'tmp', 'playwright', 'downloads');
const NOTES_PATH = path.join(rootDir, 'tmp', 'playwright', 'mission-play-notes.md');
const ENV_PATH = path.join(rootDir, '.env.playwright.local');
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const TARGET_TICK = Number(process.env.PLAYWRIGHT_STOP_TICK ?? 100);

const problems = [];

function noteProblem(msg) {
    problems.push(msg);
    console.warn(`[play:smoke] NOTE: ${msg}`);
}

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

function appendNotes(lines) {
    fs.mkdirSync(path.dirname(NOTES_PATH), { recursive: true });
    const stamp = new Date().toISOString();
    fs.appendFileSync(NOTES_PATH, [`## ${stamp}`, ...lines, ''].join('\n'), 'utf8');
}

async function readEngineTick(page) {
    return page.evaluate((sessionId) => {
        const doc = globalThis.document;
        const el = doc.querySelector(`[data-testid="${sessionId}"]`);
        const attr = el?.getAttribute('data-game-tick');
        if (attr != null && attr !== '') {
            const n = Number(attr);
            if (Number.isFinite(n)) return n;
        }
        const bridge = globalThis.__minionBattlesSyncDebug;
        if (!bridge || typeof bridge !== 'object') return null;
        const tick = bridge.clientTick ?? bridge.engineTick;
        return typeof tick === 'number' ? tick : null;
    }, TestIds.gameSession);
}

async function login(page, username, password) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const tabs = page.getByTestId(TestIds.campaignTabs);
    if (await tabs.isVisible().catch(() => false)) {
        noteProblem('Session already authenticated in this context (unexpected for fresh context). Continuing.');
        return;
    }
    await page.getByTestId(TestIds.loginUsername).or(page.getByText('Loading...')).first().waitFor({
        state: 'visible',
        timeout: 30_000,
    });
    await page.getByTestId(TestIds.loginUsername).waitFor({ state: 'visible', timeout: 30_000 });
    const loginToggle = page.getByTestId(TestIds.loginModeToggle);
    if (await loginToggle.isVisible().catch(() => false)) {
        const label = await loginToggle.textContent();
        if (/Already have an account/i.test(label ?? '')) {
            await loginToggle.click();
        }
    }
    await page.getByTestId(TestIds.loginUsername).fill(username);
    await page.getByTestId(TestIds.loginPassword).fill(password);
    const loginPromise = page.waitForResponse(
        (res) => res.url().includes('/api/account/login') && res.request().method() === 'POST',
        { timeout: 20_000 },
    );
    await page.getByTestId(TestIds.loginSubmit).click();
    const loginRes = await loginPromise;
    if (!loginRes.ok()) {
        const body = await loginRes.json().catch(() => null);
        throw new Error(`Login failed: ${body?.error ?? loginRes.status()}`);
    }
    await page.getByTestId(TestIds.loginUsername).waitFor({ state: 'detached', timeout: 20_000 });
}

async function waitPastCampaignBootstrap(page) {
    const preparing = page.getByText(/Preparing your campaign|Loading campaign/i);
    if (await preparing.isVisible().catch(() => false)) {
        await preparing.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {
            noteProblem('Campaign bootstrap text still visible after 60s.');
        });
    }
    await page.getByTestId(TestIds.campaignTabs).waitFor({ state: 'visible', timeout: 60_000 });
}

async function goToCharacters(page) {
    await page.getByTestId(campaignTabTestId('characters')).click();
    await page.waitForURL(/\/players\/\d+\/characters/, { timeout: 20_000 });
}

async function ensureCharacter(page) {
    const loading = page.getByTestId(TestIds.charactersLoading);
    if (await loading.isVisible().catch(() => false)) {
        await loading.waitFor({ state: 'hidden', timeout: 60_000 });
    }

    const missionMapTab = page.getByTestId(TestIds.characterEditorMissionMapTab);
    const createBtn = page.getByTestId(TestIds.charactersCreate);

    if (!(await missionMapTab.isVisible().catch(() => false))) {
        const anyCard = page.locator(`[data-testid^="${TestIds.characterCardPrefix}"]`).first();
        if (await anyCard.isVisible().catch(() => false)) {
            await anyCard.locator('button[aria-label^="Select character"]').click();
            await missionMapTab.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
            if (await missionMapTab.isVisible().catch(() => false)) {
                return 'selected-existing';
            }
        }
        await page.waitForURL(/\/characters\/[^/]+$/, { timeout: 10_000 }).catch(() => undefined);
        await missionMapTab.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    }

    if (await missionMapTab.isVisible().catch(() => false)) {
        return 'already-on-character';
    }

    await createBtn.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
        noteProblem('Create new character control never became visible.');
    });

    if (!(await createBtn.isVisible().catch(() => false))) {
        noteProblem('No Create new character button and Mission Map not visible after waiting.');
        throw new Error('Cannot create or open a character');
    }

    await createBtn.click();
    const dialog = page.getByRole('dialog', { name: /Create character/i });
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
    const createPromise = page.waitForResponse(
        (res) => res.url().includes('/api/account/characters') && res.request().method() === 'POST',
        { timeout: 30_000 },
    );
    await dialog.getByRole('button', { name: /^Create$/i }).click();
    const createRes = await createPromise;
    if (!createRes.ok()) {
        const body = await createRes.json().catch(() => null);
        throw new Error(`createCharacter failed: ${body?.error ?? createRes.status()}`);
    }
    await dialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {
        noteProblem('Create character dialog did not close after API success.');
    });
    await missionMapTab.waitFor({ state: 'visible', timeout: 20_000 });
    return 'created';
}

async function hostFirstMission(page) {
    await page.getByTestId(TestIds.characterEditorMissionMapTab).click();
    const node = page.getByTestId(missionMapNodeTestId('dark_awakening'));
    await node.waitFor({ state: 'visible', timeout: 20_000 });
    await node.click();
    const hostBtn = page.getByTestId(TestIds.missionHost);
    await hostBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await hostBtn.click();
    await page.waitForURL(/\/lobby\/[A-Za-z0-9]+/, { timeout: 30_000 });
    return page.url();
}

async function characterSelectReady(page) {
    const dialog = page.getByRole('dialog', { name: /Create character/i });
    if (await dialog.isVisible().catch(() => false)) {
        noteProblem('Character select opened Create character dialog unexpectedly; clicking Cancel if possible.');
        const cancel = dialog.getByRole('button', { name: /^Cancel$/i });
        if (await cancel.isVisible().catch(() => false)) await cancel.click();
    }
    const ready = page.getByTestId(TestIds.characterSelectReady);
    await ready.waitFor({ state: 'visible', timeout: 30_000 });
    if (await ready.isDisabled()) {
        noteProblem('Ready button already disabled (already ready / auto). Waiting for phase advance.');
    } else {
        await ready.click();
    }
    await ready.waitFor({ state: 'detached', timeout: 60_000 }).catch(async () => {
        if (await ready.isDisabled().catch(() => false)) return;
        noteProblem('Ready button still enabled after click — character select may not have advanced.');
    });
}

async function advancePreMissionStory(page) {
    const choiceIds = ['rocks', 'torch', 'pot_shield'];
    const deadline = Date.now() + 180_000;
    let clicks = 0;
    let choices = 0;

    while (Date.now() < deadline) {
        const tick = await readEngineTick(page);
        if (tick != null) {
            return { phase: 'battle', storyClicks: clicks, choices };
        }
        const phase = await page.getByTestId(TestIds.gameSession).getAttribute('data-game-phase').catch(() => null);
        if (phase === 'battle') {
            return { phase: 'battle', storyClicks: clicks, choices };
        }
        if (await page.getByTestId(TestIds.battleWait).isVisible().catch(() => false)) {
            return { phase: 'battle', storyClicks: clicks, choices };
        }
        if (await page.getByText(/gather your party/i).isVisible().catch(() => false)) {
            await page.waitForTimeout(1000);
            continue;
        }

        let clicked = false;
        for (const id of choiceIds) {
            const btn = page.getByTestId(storyChoiceTestId(id));
            if (await btn.isVisible().catch(() => false)) {
                await btn.click();
                choices += 1;
                clicks += 1;
                clicked = true;
                noteProblem(`Pre-mission story required choice click: ${id} (mission-specific; not plain Next).`);
                await page.waitForTimeout(400);
                break;
            }
        }
        if (clicked) continue;

        const next = page.getByTestId(TestIds.storyNext);
        if (await next.isVisible().catch(() => false) && !(await next.isDisabled().catch(() => true))) {
            await next.click();
            clicks += 1;
            await page.waitForTimeout(300);
            continue;
        }

        await page.waitForTimeout(500);
    }
    noteProblem('Timed out advancing pre-mission story / waiting for battle (180s).');
    return { phase: 'timeout', storyClicks: clicks, choices };
}

async function trySubmitWait(page) {
    const chat = page.getByPlaceholder(/Type a message/i);
    if (await chat.isVisible().catch(() => false)) {
        await page.locator('canvas').first().click({ position: { x: 40, y: 40 } }).catch(() => undefined);
    }

    const waitBtn = page.getByTestId(TestIds.battleWait);
    if (await waitBtn.isVisible().catch(() => false)) {
        if (!(await waitBtn.isDisabled())) {
            await waitBtn.click();
            return 'click-testid-wait';
        }
        return 'wait-disabled';
    }

    await page.keyboard.press('Space');
    return 'space';
}

async function waitUntilTick(page, targetTick) {
    const deadline = Date.now() + 300_000; // 5 min
    let last = null;
    let stagnantSince = Date.now();
    let lastWaitAttempt = 0;
    let stagnantShotTaken = false;
    while (Date.now() < deadline) {
        const tick = await readEngineTick(page);
        if (tick != null) {
            if (last !== tick) {
                last = tick;
                stagnantSince = Date.now();
                if (tick % 10 === 0 || tick >= targetTick) {
                    console.log(`[play:smoke] gameTick=${tick}`);
                }
            } else if (Date.now() - stagnantSince > 2_500 && Date.now() - lastWaitAttempt > 1_500) {
                lastWaitAttempt = Date.now();
                const how = await trySubmitWait(page);
                if (Date.now() - stagnantSince > 12_000) {
                    noteProblem(`gameTick stagnant at ${tick}; attempted ${how} to advance orders.`);
                    if (!stagnantShotTaken) {
                        stagnantShotTaken = true;
                        const shot = path.join(rootDir, 'tmp', 'playwright', `play-smoke-stagnant-tick${tick}.png`);
                        await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
                        noteProblem(`Stagnant battle screenshot: ${path.relative(rootDir, shot)}`);
                    }
                    stagnantSince = Date.now();
                }
            }
            if (tick >= targetTick) {
                return tick;
            }
        } else if (Date.now() - lastWaitAttempt > 2_000) {
            lastWaitAttempt = Date.now();
            await trySubmitWait(page);
        }
        await page.waitForTimeout(250);
    }
    throw new Error(`Did not reach tick ${targetTick} within timeout (last=${last})`);
}

async function leaveLobby(page) {
    const leave = page.getByTestId(TestIds.lobbyLeave);
    if (await leave.isVisible().catch(() => false)) {
        await leave.click();
        await page.waitForURL((url) => !url.pathname.startsWith('/lobby/'), { timeout: 20_000 }).catch(() => {
            noteProblem('Leave clicked but still on /lobby — falling back to goto `/`.');
            return page.goto('/', { waitUntil: 'domcontentloaded' });
        });
        return;
    }
    noteProblem('Leave button not found; navigating to `/`.');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
}

async function main() {
    const fileEnv = loadEnvFile(ENV_PATH);
    const username = process.env.PLAYWRIGHT_USERNAME ?? fileEnv.PLAYWRIGHT_USERNAME ?? fileEnv.USERNAME;
    const password = process.env.PLAYWRIGHT_PASSWORD ?? fileEnv.PLAYWRIGHT_PASSWORD ?? fileEnv.PASSWORD;
    if (!username || !password) {
        throw new Error('Missing credentials. Run npm run account:create or set .env.playwright.local');
    }

    if (!(await httpOk(BASE_URL)) || !(await httpOk('http://localhost:8000/'))) {
        throw new Error('Vite and/or PHP not reachable. Start npm run dev and npm run php.');
    }

    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    const browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        downloadsPath: DOWNLOADS_DIR,
    });
    const context = await browser.newContext({ acceptDownloads: true, baseURL: BASE_URL });
    await installSandbox(context);
    const page = await context.newPage();

    let outcome = 'unknown';
    let lobbyUrl = '';
    let characterOutcome = '';
    let finalTick = null;
    let storyClicks = 0;

    try {
        console.log(`[play:smoke] login as ${username}`);
        await login(page, username, password);
        await waitPastCampaignBootstrap(page);

        console.log('[play:smoke] Characters tab');
        await goToCharacters(page);
        characterOutcome = await ensureCharacter(page);
        console.log(`[play:smoke] character: ${characterOutcome}`);

        console.log('[play:smoke] Host A Dark Awakening');
        lobbyUrl = await hostFirstMission(page);
        console.log(`[play:smoke] lobby: ${lobbyUrl}`);

        console.log('[play:smoke] character select Ready');
        await characterSelectReady(page);

        console.log('[play:smoke] pre-mission story → battle');
        const story = await advancePreMissionStory(page);
        storyClicks = story.storyClicks;
        if (story.phase !== 'battle') {
            throw new Error(
                `Did not reach battle (phase=${story.phase}, clicks=${storyClicks}, choices=${story.choices ?? 0})`,
            );
        }

        console.log(`[play:smoke] waiting until tick >= ${TARGET_TICK}`);
        finalTick = await waitUntilTick(page, TARGET_TICK);
        console.log(`[play:smoke] reached tick ${finalTick}; leaving lobby`);
        await leaveLobby(page);
        outcome = 'ok';
    } catch (err) {
        outcome = 'failed';
        noteProblem(err instanceof Error ? err.message : String(err));
        const shot = path.join(rootDir, 'tmp', 'playwright', `play-smoke-failure-${Date.now()}.png`);
        await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
        noteProblem(`Screenshot (if written): ${path.relative(rootDir, shot)}`);
        throw err;
    } finally {
        appendNotes([
            `### outcome: ${outcome}`,
            `- username: ${username}`,
            `- characterOutcome: ${characterOutcome || '(n/a)'}`,
            `- firstMission: dark_awakening / A Dark Awakening`,
            `- lobbyUrl: ${lobbyUrl || '(n/a)'}`,
            `- storyNextClicks: ${storyClicks}`,
            `- preMissionChoices: (see notes — Dark Awakening has weapon choice)`,
            `- targetTick: ${TARGET_TICK}`,
            `- finalTick: ${finalTick ?? '(n/a)'}`,
            '#### Problems / skill notes',
            ...(problems.length ? problems.map((p) => `- ${p}`) : ['- (none this run)']),
            '#### Flow documented this run',
            '- Login → wait campaign tabs → Characters tab (`/players/{id}/characters`)',
            '- Create character dialog `aria-label="Create character"` → Create → Mission Map',
            '- Mission node `A Dark Awakening — click to view details` → Host Mission → `/lobby/{CODE}`',
            '- Character select Ready → pre-mission story (Next + mission choice buttons) → battle',
            '- Dark Awakening choice labels: rocks / thick branch / pot lid (must click one)',
            '- Tick source: `window.__minionBattlesSyncDebug.clientTick` (PollLoop bridge)',
            '- Leave: button `Leave` (host-in-battle → window.location=/)',
            '#### Blockers / gotchas for skill',
            '- Non-admin hosts via Mission Map on a character, not admin Mission Select tab',
            '- Solo host works (no second player)',
            '- AuthGate Loading + campaign bootstrap banners must be waited out',
            '- Pre-mission story is NOT Next-only — `type: "choice"` phrases need labeled option clicks',
            '- After last phrase, solo shows "gather your party" end screen then auto-starts battle',
            '- Players column "Not Ready" during story = STORY_READY not yet; not the same as character-select Ready',
            '- Battle pauses for orders almost immediately — must click Wait / End Turn (or Space) or ticks stall ~1',
            '- Characters list: wait out "Loading characters…"; select existing CharacterCard by name before Mission Map',
            '- Pixi canvas is opaque; use sync debug bridge for ticks, not DOM',
            '- Triple-`~` debug console is awkward headless — prefer `__minionBattlesSyncDebug`',
            '- Script does not start Vite/PHP',
            '- Sandboxed origins only (5173/8000)',
        ]);
        console.log(`[play:smoke] notes → ${path.relative(rootDir, NOTES_PATH)}`);
        await browser.close();
    }
}

main().catch((err) => {
    console.error('[play:smoke] failed:', err);
    process.exit(1);
});
