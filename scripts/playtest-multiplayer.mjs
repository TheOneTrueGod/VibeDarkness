#!/usr/bin/env node
/**
 * Two-player playtest: host + joiner in two Playwright contexts play campaign missions end to end.
 *
 * Usage: npm run playtest -- [missionId ...]      (default: dark_awakening towards_the_light)
 *        npm run playtest -- quest:<bankId>/<questDefId>/<missionCount>
 *          starts the quest from its Mission Map bank node, then follows each victory's
 *          Continue into the next quest lobby (one lobby per quest mission)
 *   PLAYTEST_HEADED=1      show both browser windows
 *   PLAYTEST_MAX_MINUTES   per-mission battle budget (default 15)
 *   PLAYTEST_SOLO=1        host only (checks the bridge/autoplay without a second account)
 *   PLAYTEST_ACCOUNTS=session   log in as the session-testing accounts (SESSION_TEST_USERNAME_A/_B)
 *                               instead of PLAYWRIGHT_USERNAME/_2; A hosts
 *   PLAYTEST_LOBBY=CODE    rejoin an existing lobby for the first mission instead of hosting one
 *   PLAYTEST_SKIP_ABILITIES=0537,...   abilities the autoplay never casts (prompts it can't answer)
 *   --check-sandbox        only check that sandboxed Chromium can open a page (exit 0 ok, 2 blocked)
 *
 * Input is real UI input: canvas mouse clicks at screen points from the dev-only
 * `window.__minionBattlesPlaytest` bridge (usePlaytestBridge.ts), ability-card clicks and the Pass
 * button. Orders therefore go through the targeting tools, BattleSession.submitPlayerOrder and
 * BattleNet, and the Your Turn spinner runs as normal.
 *
 * Output: tmp/playwright/playtest/<stamp>/ (report.json, screenshots).
 * See .claude/skills/jp-playtest/SKILL.md.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
    TestIds,
    battleAbilityCardTestId,
    campaignTabTestId,
    missionMapNodeTestId,
    missionMapQuestBankTestId,
} from './testIds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const ENV_PATH = path.join(rootDir, '.env.playwright.local');
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const HEADED = process.env.PLAYTEST_HEADED === '1';
const SOLO = process.env.PLAYTEST_SOLO === '1';
const ACCOUNTS = process.env.PLAYTEST_ACCOUNTS ?? 'playwright';
const REJOIN_LOBBY = process.env.PLAYTEST_LOBBY ?? null;
/** Rock Slide's first pick is a rock tile, which the enemy-clicking autoplay can't answer. */
const DEFAULT_SKIP_ABILITIES = ['0537'];
const SKIP_ABILITIES = (process.env.PLAYTEST_SKIP_ABILITIES ?? DEFAULT_SKIP_ABILITIES.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
/** Console lines (any level) worth surfacing as multiplayer sync events. */
const SYNC_LINE_RE = /desync|resync|mismatch|recover|reload|rollback|fingerprint|stuck|softlock/i;
const MAX_BATTLE_MS = Number(process.env.PLAYTEST_MAX_MINUTES ?? 15) * 60_000;
const DEFAULT_MISSIONS = ['dark_awakening', 'towards_the_light'];
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.join(rootDir, 'tmp', 'playwright', 'playtest', STAMP);

const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'ws://localhost:5173',
]);

const report = { startedAt: new Date().toISOString(), baseUrl: BASE_URL, missions: [], notes: [] };

/** Live battle status line (frame counter); redrawn in place on a TTY, printed every few seconds otherwise. */
const liveLine = { text: '', shown: false, lastPrintedAt: 0 };
const LIVE_LINE_PLAIN_EVERY_MS = 5_000;

function clearLiveLine() {
    if (liveLine.shown && process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
    liveLine.shown = false;
}

function drawLiveLine(text) {
    liveLine.text = text;
    if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[2K${text}`);
        liveLine.shown = true;
    } else if (Date.now() - liveLine.lastPrintedAt >= LIVE_LINE_PLAIN_EVERY_MS) {
        liveLine.lastPrintedAt = Date.now();
        console.log(text);
    }
}

function note(msg) {
    report.notes.push(`${new Date().toISOString()} ${msg}`);
    clearLiveLine();
    console.log(`[playtest] ${msg}`);
    if (liveLine.text && process.stdout.isTTY) drawLiveLine(liveLine.text);
}

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const out = {};
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1) continue;
        out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    }
    return out;
}

function httpOk(url) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            res.resume();
            resolve(res.statusCode != null && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

function isAllowedUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    if (url.protocol === 'blob:' || url.protocol === 'data:') return true;
    return ALLOWED_ORIGINS.has(url.origin);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(p, name) {
    const file = path.join(OUT_DIR, `${p.label}-${name}.png`);
    await p.page.screenshot({ path: file }).catch(() => undefined);
    return path.relative(rootDir, file);
}

// ---------------------------------------------------------------------------
// Player setup

async function newPlayer(browser, label, username, password) {
    const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1400, height: 900 } });
    await context.route('**/*', (route) =>
        isAllowedUrl(route.request().url()) ? route.continue() : route.abort('blockedbyclient'),
    );
    const page = await context.newPage();
    const p = { label, username, password, context, page, consoleErrors: [], syncEvents: [] };
    page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error') p.consoleErrors.push(text.slice(0, 400));
        if (SYNC_LINE_RE.test(text) && p.syncEvents.length < 200) {
            p.syncEvents.push(`${new Date().toISOString()} [${msg.type()}] ${text.slice(0, 300)}`);
            if (msg.type() === 'error' || msg.type() === 'warning') note(`${label} sync: ${text.slice(0, 160)}`);
        }
    });
    page.on('pageerror', (err) => p.consoleErrors.push(`pageerror: ${String(err).slice(0, 400)}`));
    return p;
}

async function login(p) {
    const { page } = p;
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const username = page.getByTestId(TestIds.loginUsername);
    const tabs = page.getByTestId(TestIds.campaignTabs);
    await username.or(tabs).first().waitFor({ state: 'visible', timeout: 30_000 });
    if (await tabs.isVisible().catch(() => false)) return;
    const toggle = page.getByTestId(TestIds.loginModeToggle);
    if (/Already have an account/i.test((await toggle.textContent().catch(() => '')) ?? '')) await toggle.click();
    await username.fill(p.username);
    await page.getByTestId(TestIds.loginPassword).fill(p.password);
    const res = page.waitForResponse((r) => r.url().includes('/api/account/login') && r.request().method() === 'POST');
    await page.getByTestId(TestIds.loginSubmit).click();
    const loginRes = await res;
    if (!loginRes.ok()) throw new Error(`${p.label} login failed: HTTP ${loginRes.status()}`);
    await username.waitFor({ state: 'detached', timeout: 20_000 });
    await tabs.waitFor({ state: 'visible', timeout: 60_000 });
}

/** Characters tab → select first character, or create one. Leaves the character editor open. */
async function ensureCharacter(p) {
    const { page } = p;
    await page.getByTestId(campaignTabTestId('characters')).click();
    await page.waitForURL(/\/players\/\d+\/characters/, { timeout: 20_000 });
    const loading = page.getByTestId(TestIds.charactersLoading);
    await loading.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined);
    const mapTab = page.getByTestId(TestIds.characterEditorMissionMapTab);
    const card = page.locator(`[data-testid^="${TestIds.characterCardPrefix}"]`).first();
    const create = page.getByTestId(TestIds.charactersCreate);
    // The list can render a beat before a remembered character's editor opens over it.
    await mapTab.or(card).or(create).first().waitFor({ state: 'visible', timeout: 30_000 });
    if (await mapTab.isVisible().catch(() => false)) return 'already-open';
    if (await card.isVisible().catch(() => false)) {
        try {
            await card.locator('button[aria-label^="Select character"]').click({ timeout: 5_000 });
        } catch (err) {
            // The editor opened over the list mid-click (playtest 2026-11-03: joiner timed out here).
            if (await mapTab.isVisible().catch(() => false)) return 'already-open';
            throw err;
        }
        await mapTab.waitFor({ state: 'visible', timeout: 15_000 });
        return 'selected-existing';
    }
    await page.getByTestId(TestIds.charactersCreate).click();
    const dialog = page.getByRole('dialog', { name: /Create character/i });
    await dialog.getByRole('button', { name: /^Create$/i }).click();
    await mapTab.waitFor({ state: 'visible', timeout: 30_000 });
    return 'created';
}

async function hostMission(p, missionId) {
    const { page } = p;
    await page.getByTestId(TestIds.characterEditorMissionMapTab).click();
    const node = page.getByTestId(missionMapNodeTestId(missionId));
    await node.waitFor({ state: 'visible', timeout: 20_000 });
    await node.click();
    await page.getByTestId(TestIds.missionHost).click();
    await page.waitForURL(/\/lobby\/[A-Za-z0-9]+/, { timeout: 30_000 });
    return page.url().match(/\/lobby\/([A-Za-z0-9]+)/)[1];
}

/** Mission Map quest bank node → Start quest. Leaves the host in the quest's first lobby. */
async function hostQuest(p, bankId, questDefId) {
    const { page } = p;
    await page.getByTestId(TestIds.characterEditorMissionMapTab).click();
    const node = page.getByTestId(missionMapQuestBankTestId(bankId));
    await node.waitFor({ state: 'visible', timeout: 20_000 });
    await node.click();
    await page.getByTestId(`${TestIds.questStartPrefix}${questDefId}`).click();
    await page.waitForURL(/\/lobby\/[A-Za-z0-9]+/, { timeout: 30_000 });
    return page.url().match(/\/lobby\/([A-Za-z0-9]+)/)[1];
}

/** Wait until the page sits in a lobby other than `previousLobby`; returns its code or null. */
async function waitForNextLobby(p, previousLobby, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const code = p.page.url().match(/\/lobby\/([A-Za-z0-9]+)/)?.[1] ?? null;
        if (code && code !== previousLobby) return code;
        await sleep(500);
    }
    return null;
}

/** Expand `quest:<bankId>/<questDefId>/<count>` into one entry per quest mission. */
function expandMissionArgs(args) {
    const out = [];
    for (const arg of args) {
        const m = /^quest:([^/]+)\/([^/]+)\/(\d+)$/.exec(arg);
        if (!m) {
            out.push({ label: arg, missionId: arg });
            continue;
        }
        const [, bankId, questDefId, count] = m;
        for (let k = 0; k < Number(count); k++) {
            out.push({ label: `${questDefId}#${k + 1}`, quest: { bankId, questDefId, index: k } });
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Pre-battle phases (character select + story), driven for one player until battle starts.

async function readSnapshot(page) {
    return page.evaluate(() => globalThis.__minionBattlesPlaytest?.snapshot() ?? null).catch(() => null);
}

async function advanceToBattle(p, deadlineMs) {
    const { page } = p;
    const deadline = Date.now() + deadlineMs;
    let storyClicks = 0;
    while (Date.now() < deadline) {
        if (await readSnapshot(page)) return { storyClicks };
        const ready = page.getByTestId(TestIds.characterSelectReady);
        if (await ready.isVisible().catch(() => false) && await ready.isEnabled().catch(() => false)) {
            await ready.click().catch(() => undefined);
            note(`${p.label}: character select Ready`);
            await sleep(500);
            continue;
        }
        const choice = page.locator(`[data-testid^="${TestIds.storyChoicePrefix}"]:not([disabled])`).first();
        if (await choice.isVisible().catch(() => false)) {
            const id = await choice.getAttribute('data-testid');
            await choice.click().catch(() => undefined);
            note(`${p.label}: story choice ${id}`);
            storyClicks += 1;
            await sleep(400);
            continue;
        }
        const next = page.getByTestId(TestIds.storyNext);
        if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) {
            await next.click().catch(() => undefined);
            storyClicks += 1;
            await sleep(300);
            continue;
        }
        await sleep(500);
    }
    throw new Error(`${p.label}: did not reach battle in ${deadlineMs / 1000}s (url=${page.url()})`);
}

// ---------------------------------------------------------------------------
// Battle autoplay

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Destination for this turn: an active reach-location objective, else the nearest enemy. */
function pickGoal(snap, me) {
    const reach = snap.objectives.find((o) => o.active && !o.completed && o.toComplete?.type === 'allUnitsNearPosition');
    const enemies = snap.units.filter((u) => u.alive && u.teamId !== me.teamId);
    enemies.sort((a, b) => dist(a, me) - dist(b, me));
    return { reach, enemy: enemies[0] ?? null };
}

async function canvasPoint(page, x, y) {
    let s = await page.evaluate(([wx, wy]) => globalThis.__minionBattlesPlaytest?.worldToScreen(wx, wy), [x, y]);
    if (!s?.inView) {
        await page.evaluate(([wx, wy]) => globalThis.__minionBattlesPlaytest?.focus(wx, wy), [x, y]);
        await sleep(150);
        s = await page.evaluate(([wx, wy]) => globalThis.__minionBattlesPlaytest?.worldToScreen(wx, wy), [x, y]);
    }
    const box = await page.locator('canvas').first().boundingBox();
    if (!s || !box) return null;
    return { x: box.x + s.x, y: box.y + s.y };
}

async function clickPass(page) {
    const pass = page.getByTestId(TestIds.battlePass);
    if (await pass.isVisible().catch(() => false) && await pass.isEnabled().catch(() => false)) {
        await pass.click();
        return true;
    }
    return false;
}

/** Drive an open ITS preview: answer target picks on the enemy, press Done when offered. */
async function driveIts(p, targetUnitId) {
    const { page } = p;
    for (let i = 0; i < 30; i++) {
        const snap = await readSnapshot(page);
        if (!snap?.itsActive) return true;
        const done = page.getByRole('button', { name: 'Done' });
        if (await done.isVisible().catch(() => false) && await done.isEnabled().catch(() => false)) {
            await done.click();
            await sleep(300);
            continue;
        }
        if (snap.waitingForTargetInput) {
            const target = snap.units.find((u) => u.id === targetUnitId && u.alive)
                ?? snap.units.find((u) => u.alive && u.teamId !== snap.units.find((m) => m.id === snap.myWaiterUnitId)?.teamId);
            if (target) {
                const pt = await canvasPoint(page, target.x, target.y);
                if (pt) {
                    await page.mouse.move(pt.x, pt.y);
                    await page.mouse.click(pt.x, pt.y);
                }
            }
        }
        await sleep(250);
    }
    const prompt = (await readSnapshot(page))?.waitingForTargetInput;
    note(`${p.label}: ITS still active after 30 steps${prompt ? ` (prompt "${prompt.label}" for ${prompt.abilityId})` : ''}; pressing Undo`);
    await page.getByRole('button', { name: 'Undo' }).click().catch(() => undefined);
    await sleep(300);
    return false;
}

/** Try each enabled ability card against `enemy`; true once a cast started. */
async function tryAttack(p, snap, me, enemy) {
    const { page } = p;
    const d = dist(me, enemy);
    for (const ab of snap.myAbilities) {
        // Abilities whose target prompt the driver can't answer by clicking an enemy (e.g. a "Rock"
        // pick) are skipped for the rest of the battle instead of retried every turn.
        if (p.skipAbilities?.has(ab.id)) continue;
        const maxRange = ab.aiSettings?.maxRange ?? 120;
        if (d > maxRange + enemy.radius) continue;
        const card = page.getByTestId(battleAbilityCardTestId(ab.id));
        if (!(await card.isVisible().catch(() => false))) continue;
        if (await card.getAttribute('data-disabled-reason')) continue;
        const pendingBefore = (await page.evaluate(() => globalThis.__minionBattlesPlaytest?.spinnerSpans().length ?? 0));
        await card.click();
        await sleep(150);
        const pt = await canvasPoint(page, enemy.x, enemy.y);
        if (!pt) continue;
        await page.mouse.move(pt.x, pt.y);
        await sleep(80);
        await page.mouse.click(pt.x, pt.y);
        await sleep(250);
        const after = await readSnapshot(page);
        if (after?.itsActive) {
            if (await driveIts(p, enemy.id)) {
                p.stats.casts[ab.id] = (p.stats.casts[ab.id] ?? 0) + 1;
                return true;
            }
            p.skipAbilities.add(ab.id);
            note(`${p.label}: skipping ${ab.id} for the rest of the battle (its target prompt was not answerable)`);
            continue;
        }
        const spans = await page.evaluate(() => globalThis.__minionBattlesPlaytest?.spinnerSpans().length ?? 0);
        if (spans > pendingBefore || after?.myWaiterUnitId !== me.id) {
            p.stats.casts[ab.id] = (p.stats.casts[ab.id] ?? 0) + 1;
            return true;
        }
        // Card selected but nothing happened (out of range, bad target): deselect.
        await page.keyboard.press('Escape').catch(() => undefined);
    }
    return false;
}

async function takeTurn(p, snap) {
    const { page } = p;
    const me = snap.units.find((u) => u.id === snap.myWaiterUnitId);
    if (!me) return 'no-unit';
    const { reach, enemy } = pickGoal(snap, me);

    if (!reach && enemy && await tryAttack(p, snap, me, enemy)) {
        return 'attack';
    }
    let dest = null;
    if (reach) {
        const t = reach.toComplete;
        const w = await page.evaluate(([c, r]) => globalThis.__minionBattlesPlaytest?.gridToWorld(c, r), [t.col, t.row]);
        dest = w;
    } else if (enemy) {
        dest = { x: enemy.x, y: enemy.y };
    }
    if (dest) {
        const pt = await canvasPoint(page, dest.x, dest.y);
        if (pt) {
            await page.mouse.click(pt.x, pt.y, { button: 'right' });
            await sleep(150);
        }
    }
    await clickPass(page);
    return dest ? (reach ? 'move-objective' : 'move-enemy') : 'pass';
}

async function battleOutcome(page) {
    if (await page.getByTestId(TestIds.victoryPopover).isVisible().catch(() => false)) return 'victory';
    // Test id, not text: objectives like "Defeat the Displacer Spirit" matched /defeat/ (run 2026-11-06T18-31).
    if (await page.getByTestId(TestIds.defeatModal).isVisible().catch(() => false)) return 'defeat';
    return null;
}

async function playerLoop(p, stopFlag) {
    const { page } = p;
    const tickState = { lastTick: null, lastTickAt: Date.now() };
    while (!stopFlag.stop) {
        try {
            const outcome = await playerLoopStep(p, tickState);
            if (outcome) return outcome;
        } catch (err) {
            // A page reload (app recovery, Vite HMR) destroys the evaluate context mid-step.
            // Wait for the battle to come back instead of failing the whole run.
            const msg = String(err?.message ?? err).split(/\r?\n/)[0];
            note(`${p.label}: step failed (${msg.slice(0, 120)}); waiting for the page`);
            p.stats.reloads = (p.stats.reloads ?? 0) + 1;
            await page.waitForLoadState('domcontentloaded').catch(() => undefined);
            await sleep(2000);
        }
    }
    return 'stopped';
}

/** One autoplay step; returns the battle outcome once there is one, else null. */
async function playerLoopStep(p, tickState) {
    const { page } = p;
    const outcome = await battleOutcome(page);
    if (outcome) return outcome;
    const start = page.getByTestId(TestIds.objectivesPopoverStart);
    if (await start.isVisible().catch(() => false)) {
        await start.click().catch(() => undefined);
        return null;
    }
    const snap = await readSnapshot(page);
    if (snap) {
        if (snap.tick !== tickState.lastTick) {
            tickState.lastTick = snap.tick;
            tickState.lastTickAt = Date.now();
        } else if (Date.now() - tickState.lastTickAt > 20_000 && !snap.myWaiterUnitId) {
            p.stats.stalls.push({ tick: snap.tick, at: new Date().toISOString(), shot: await shot(p, `stall-${snap.tick}`) });
            note(`${p.label}: tick stuck at ${snap.tick} for 20s while not our turn`);
            tickState.lastTickAt = Date.now();
        }
        p.stats.lastTick = snap.tick;
        p.stats.myTurn = Boolean(snap.myWaiterUnitId);
        if (snap.myWaiterUnitId && snap.canUseOrderUi && !snap.itsActive) {
            const how = await takeTurn(p, snap);
            p.stats.turns[how] = (p.stats.turns[how] ?? 0) + 1;
            await sleep(200);
            return null;
        }
        if (snap.itsActive) {
            await driveIts(p, null);
            return null;
        }
    }
    await sleep(250);
    return null;
}

const FRAME_COUNTER_INTERVAL_MS = 500;
/** How long the other players get to reach their own outcome after the first one does. */
const OUTCOME_GRACE_MS = 90_000;

/**
 * Live frame counter: each player's engine tick (one fixed-step frame per tick) as the battle runs,
 * with frames/s over the last second and a "your turn" marker. A rate of 0 outside a turn is a stall.
 */
function startFrameCounter(players, missionId) {
    const t0 = Date.now();
    /** label → recent [atMs, tick] samples (about one second's worth). */
    const history = new Map(players.map((p) => [p.label, []]));
    const id = setInterval(() => {
        const now = Date.now();
        const parts = players.map((p) => {
            const tick = p.stats.lastTick;
            const samples = history.get(p.label);
            if (tick != null) samples.push([now, tick]);
            while (samples.length > 1 && now - samples[0][0] > 1_000) samples.shift();
            const [firstAt, firstTick] = samples[0] ?? [now, tick];
            const rate = tick != null && now > firstAt ? Math.round(((tick - firstTick) * 1000) / (now - firstAt)) : 0;
            const turn = p.stats.myTurn ? ' (turn)' : '';
            return `${p.label} ${tick ?? '-'} @${rate}/s${turn}`;
        });
        const elapsed = Math.round((now - t0) / 1000);
        drawLiveLine(`[playtest] ${missionId} ${elapsed}s | frames ${parts.join(' | ')}`);
    }, FRAME_COUNTER_INTERVAL_MS);
    return {
        stop() {
            clearInterval(id);
            clearLiveLine();
            liveLine.text = '';
        },
    };
}

async function playBattle(players, missionId) {
    const stopFlag = { stop: false };
    const timer = setTimeout(() => {
        stopFlag.stop = true;
    }, MAX_BATTLE_MS);
    for (const p of players) {
        p.stats = { turns: {}, casts: {}, stalls: [], lastTick: null };
        p.skipAbilities = new Set(SKIP_ABILITIES);
    }
    const frameCounter = startFrameCounter(players, missionId);
    let outcomes;
    try {
        // When one player reaches an outcome, give the others a grace period to reach theirs: a
        // player's result is only recorded once its own client shows the victory popover (run
        // 2026-11-06T17-22: the joiner was stopped on the Victory banner and got no mission result).
        let graceTimer = null;
        outcomes = await Promise.all(players.map((p) => playerLoop(p, stopFlag).then((outcome) => {
            if (outcome === 'victory' || outcome === 'defeat') {
                graceTimer ??= setTimeout(() => {
                    stopFlag.stop = true;
                }, OUTCOME_GRACE_MS);
            } else {
                stopFlag.stop = true;
            }
            return outcome;
        }, (err) => {
            stopFlag.stop = true;
            throw err;
        })));
        if (graceTimer) clearTimeout(graceTimer);
    } finally {
        // A live interval keeps Node running after main() returns (2026-11-03: hung after a failed battle).
        clearTimeout(timer);
        frameCounter.stop();
        stopFlag.stop = true;
    }
    const result = { missionId, outcomes: {}, players: {} };
    for (const [i, p] of players.entries()) {
        const spans = await p.page.evaluate(() => globalThis.__minionBattlesPlaytest?.spinnerSpans() ?? []).catch(() => []);
        const durations = spans.filter((s) => s.endedAt != null).map((s) => s.endedAt - s.startedAt).sort((a, b) => a - b);
        const pct = (q) => (durations.length ? Math.round(durations[Math.min(durations.length - 1, Math.floor(q * durations.length))]) : null);
        result.outcomes[p.label] = outcomes[i];
        result.players[p.label] = {
            ...p.stats,
            spinner: { count: durations.length, p50: pct(0.5), p90: pct(0.9), max: durations.length ? Math.round(durations.at(-1)) : null },
            consoleErrors: p.consoleErrors.splice(0).slice(0, 30),
            syncEvents: p.syncEvents.splice(0),
            finalShot: await shot(p, `${missionId}-end`),
        };
    }
    return result;
}

// ---------------------------------------------------------------------------

/** Agents run this first: inside an agent tool sandbox, Chromium's own OS sandbox cannot start. */
async function checkSandbox() {
    try {
        const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
        await (await browser.newContext()).newPage();
        await browser.close();
        console.log('[playtest] sandbox check: OK (sandboxed Chromium can open pages)');
        return 0;
    } catch (err) {
        const first = String(err?.message ?? err).split('\n')[0].trim();
        console.log(`[playtest] sandbox check: BLOCKED (${first})`);
        return 2;
    }
}

async function main() {
    if (process.argv.includes('--check-sandbox')) {
        process.exitCode = await checkSandbox();
        return;
    }
    const missions = process.argv.slice(2).filter((a) => !a.startsWith('-'));
    if (missions.length === 0) missions.push(...DEFAULT_MISSIONS);
    const env = loadEnvFile(ENV_PATH);
    const creds =
        ACCOUNTS === 'session'
            ? [
                  [env.SESSION_TEST_USERNAME_A, env.SESSION_TEST_PASSWORD_A],
                  [env.SESSION_TEST_USERNAME_B, env.SESSION_TEST_PASSWORD_B],
              ]
            : [
                  [env.PLAYWRIGHT_USERNAME, env.PLAYWRIGHT_PASSWORD],
                  [env.PLAYWRIGHT_USERNAME_2, env.PLAYWRIGHT_PASSWORD_2],
              ];
    if (SOLO) creds.pop();
    if (creds.some(([u, pw]) => !u || !pw)) {
        throw new Error('Need PLAYWRIGHT_USERNAME/_PASSWORD and PLAYWRIGHT_USERNAME_2/_PASSWORD_2 in .env.playwright.local (ask the user before creating an account).');
    }
    if (!(await httpOk(BASE_URL)) || !(await httpOk('http://localhost:8000/'))) {
        throw new Error('Vite :5173 and/or PHP :8000 not reachable. Start npm run dev and npm run php.');
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: !HEADED, chromiumSandbox: true });
    const host = await newPlayer(browser, 'host', ...creds[0]);
    const joiner = SOLO ? null : await newPlayer(browser, 'joiner', ...creds[1]);
    const players = joiner ? [host, joiner] : [host];
    try {
        await Promise.all(players.map(login));
        note('both logged in');
        for (const p of players) note(`${p.label}: character ${await ensureCharacter(p)}`);

        let previousLobby = null;
        for (const [i, entry] of expandMissionArgs(missions).entries()) {
            const missionId = entry.label;
            const t0 = Date.now();
            let lobby = null;
            if (entry.quest && entry.quest.index === 0 && !(i === 0 && REJOIN_LOBBY)) {
                if (i > 0) await ensureCharacter(host);
                lobby = await hostQuest(host, entry.quest.bankId, entry.quest.questDefId);
                note(`host started quest ${entry.quest.questDefId} in lobby ${lobby}`);
                await joiner?.page.goto(`/lobby/${lobby}`, { waitUntil: 'domcontentloaded' });
            } else if (entry.quest && entry.quest.index > 0) {
                // Quest continuation: each player's victory Continue claims the next quest lobby.
                lobby = await waitForNextLobby(host, previousLobby, 60_000);
                if (!lobby) throw new Error(`host did not reach the next quest lobby after ${previousLobby}`);
                const joinerLobby = joiner ? await waitForNextLobby(joiner, previousLobby, 30_000) : null;
                note(`quest continues in lobby ${lobby}${joiner ? ` (joiner landed in ${joinerLobby ?? 'none'})` : ''}`);
                if (joiner && joinerLobby !== lobby) {
                    await joiner.page.goto(`/lobby/${lobby}`, { waitUntil: 'domcontentloaded' });
                }
            } else if (i === 0 && REJOIN_LOBBY) {
                lobby = REJOIN_LOBBY;
                note(`rejoining lobby ${lobby} for ${missionId}`);
                await Promise.all(players.map((p) => p.page.goto(`/lobby/${lobby}`, { waitUntil: 'domcontentloaded' })));
            } else if (i === 0 || !/\/lobby\//.test(host.page.url())) {
                if (i > 0) await ensureCharacter(host);
                lobby = await hostMission(host, missionId);
                note(`host lobby ${lobby} for ${missionId}`);
                await joiner?.page.goto(`/lobby/${lobby}`, { waitUntil: 'domcontentloaded' });
            } else {
                lobby = host.page.url().match(/\/lobby\/([A-Za-z0-9]+)/)?.[1] ?? null;
                note(`continuing in lobby ${lobby} for ${missionId}`);
                if (joiner && lobby && !joiner.page.url().includes(lobby)) {
                    await joiner.page.goto(`/lobby/${lobby}`, { waitUntil: 'domcontentloaded' });
                }
            }
            // Don't let the host Ready (and start) before the joiner is in character select: otherwise
            // the battle starts without the joiner's unit and it spectates (run 2026-11-06T19-01, P0.16).
            if (joiner && !(i === 0 && REJOIN_LOBBY) && !(entry.quest && entry.quest.index > 0)) {
                const inSelect = await joiner.page.getByTestId(TestIds.characterSelectReady)
                    .waitFor({ state: 'visible', timeout: 60_000 })
                    .then(() => true, () => false);
                if (!inSelect) note('joiner never reached character select; starting anyway');
            }
            const pre = await Promise.all(players.map((p) => advanceToBattle(p, 180_000)));
            note(`${missionId}: battle started after ${Math.round((Date.now() - t0) / 1000)}s (story clicks ${pre.map((x) => x.storyClicks).join('/')})`);
            const battle = await playBattle(players, missionId);
            battle.lobby = lobby;
            previousLobby = lobby;
            battle.seconds = Math.round((Date.now() - t0) / 1000);
            report.missions.push(battle);
            note(`${missionId}: ${JSON.stringify(battle.outcomes)} in ${battle.seconds}s`);
            if (!Object.values(battle.outcomes).every((o) => o === 'victory')) break;
            for (const p of players) {
                await p.page.getByTestId(TestIds.victoryPopoverContinue).click().catch(() => undefined);
            }
            await sleep(3000);
        }
    } catch (err) {
        note(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
        for (const p of players) note(`${p.label} screenshot: ${await shot(p, 'failure')}`);
        process.exitCode = 1;
    } finally {
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
        console.log(`[playtest] report → ${path.relative(rootDir, path.join(OUT_DIR, 'report.json'))}`);
        await browser.close();
    }
}

main().catch((err) => {
    console.error('[playtest] failed:', err);
    process.exit(1);
});
