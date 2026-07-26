/**
 * Mission Map quest-bank side-quest node: click opens tooltip.
 * Unlocked path can Start → Quest Prep; locked path shows locked message.
 * Requires Vite :5173, PHP :8000, and .env.playwright.local credentials.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures/sandboxed';
import {
    TestIds,
    campaignTabTestId,
    missionMapQuestBankTestId,
} from '../scripts/testIds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const ENV_PATH = path.join(rootDir, '.env.playwright.local');

const POST_CORE_BANK_ID = 'wod_post_core_awakening_quests';
const SCAVENGE_QUEST_ID = 'scavenge_the_plains';

function loadEnvFile(filePath: string): Record<string, string> {
    if (!fs.existsSync(filePath)) return {};
    const out: Record<string, string> = {};
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

async function login(page: import('@playwright/test').Page, username: string, password: string) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const tabs = page.getByTestId(TestIds.campaignTabs);
    if (await tabs.isVisible().catch(() => false)) return;

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
    await page.getByTestId(TestIds.loginSubmit).click();
    await page.getByTestId(TestIds.campaignTabs).waitFor({ state: 'visible', timeout: 60_000 });
}

async function openMissionMap(page: import('@playwright/test').Page) {
    await page.getByTestId(campaignTabTestId('characters')).click();
    const missionMapTab = page.getByTestId(TestIds.characterEditorMissionMapTab);
    if (!(await missionMapTab.isVisible().catch(() => false))) {
        const anyCard = page.locator(`[data-testid^="${TestIds.characterCardPrefix}"]`).first();
        if (await anyCard.isVisible().catch(() => false)) {
            await anyCard.locator('button[aria-label^="Select character"]').click();
        } else {
            await page.getByTestId(TestIds.charactersCreate).click();
            const dialog = page.getByRole('dialog', { name: /Create character/i });
            await dialog.waitFor({ state: 'visible', timeout: 15_000 });
            await dialog.getByRole('button', { name: /^Create$/i }).click();
        }
        await missionMapTab.waitFor({ state: 'visible', timeout: 30_000 });
    }
    await missionMapTab.click();
}

test.describe('Mission Map quest bank side quest', () => {
    test('clicking Surface Quests node opens a tooltip (locked or start)', async ({ page }) => {
        test.setTimeout(90_000);
        const env = { ...loadEnvFile(ENV_PATH), ...process.env };
        const username = env.PLAYWRIGHT_USERNAME ?? env.PLAYWRIGHT_USER;
        const password = env.PLAYWRIGHT_PASSWORD;
        test.skip(!username || !password, 'Need PLAYWRIGHT_USERNAME/PASSWORD in .env.playwright.local');

        await login(page, username!, password!);
        await openMissionMap(page);

        const bankNode = page.getByTestId(missionMapQuestBankTestId(POST_CORE_BANK_ID));
        await bankNode.scrollIntoViewIfNeeded();
        await expect(bankNode).toBeVisible({ timeout: 15_000 });
        await bankNode.click();

        const tooltip = page.getByTestId(TestIds.questBankTooltip);
        await expect(tooltip).toBeVisible({ timeout: 10_000 });

        const startBtn = page.getByTestId(`${TestIds.questStartPrefix}${SCAVENGE_QUEST_ID}`);
        const lockedMsg = page.getByTestId('quest-bank-tooltip-locked');

        if (await startBtn.isVisible().catch(() => false)) {
            await startBtn.click();
            await expect(page.getByTestId(TestIds.questPrepBanner)).toBeVisible({ timeout: 15_000 });
            await expect(page.getByTestId(TestIds.questPrepConfirm)).toBeVisible();
            return;
        }

        // Bank still locked (no Core Awakening victory) — tooltip must explain that.
        await expect(lockedMsg).toBeVisible();

        // Dismiss tooltip so it doesn't intercept the panel Start click.
        await page.keyboard.press('Escape');
        await expect(tooltip).toBeHidden();

        // Optional outlet still lets the player start the same quest.
        const optionalStart = page.getByTestId(
            `${TestIds.questStartOptionalPrefix}${SCAVENGE_QUEST_ID}`,
        );
        await optionalStart.scrollIntoViewIfNeeded();
        await optionalStart.click();
        await expect(page.getByTestId(TestIds.questPrepBanner)).toBeVisible({ timeout: 15_000 });
    });
});
