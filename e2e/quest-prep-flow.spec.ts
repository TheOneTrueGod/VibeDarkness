/**
 * Quest Prep lobby flow:
 * optional quest Start → character_select Quest Prep UI → pick ability → Ready → leave prep.
 *
 * Requires Vite :5173, PHP :8000, and .env.playwright.local credentials
 * (create with `npm run account:create`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures/sandboxed';
import {
    TestIds,
    campaignTabTestId,
} from '../scripts/testIds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const ENV_PATH = path.join(rootDir, '.env.playwright.local');

/** Optional quest always available from QuestBanksPanel (no bank unlock required). */
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

async function startOptionalQuest(page: import('@playwright/test').Page) {
    // Prefer Quests sub-tab when present (banks/optional panel).
    const questsSub = page.getByTestId(TestIds.missionMapSubTabQuests);
    if (await questsSub.isVisible().catch(() => false)) {
        await questsSub.click();
    }

    const optionalStart = page.getByTestId(
        `${TestIds.questStartOptionalPrefix}${SCAVENGE_QUEST_ID}`,
    );
    await optionalStart.waitFor({ state: 'visible', timeout: 30_000 });
    await optionalStart.scrollIntoViewIfNeeded();
    await optionalStart.click();
}

test.describe('Quest Prep lobby flow', () => {
    test('Start → Quest Prep UI → pick ability → Ready advances phase', async ({ page }) => {
        test.setTimeout(180_000);
        const env = { ...loadEnvFile(ENV_PATH), ...process.env };
        const username = env.PLAYWRIGHT_USERNAME ?? env.PLAYWRIGHT_USER ?? env.USERNAME;
        const password = env.PLAYWRIGHT_PASSWORD ?? env.PASSWORD;
        test.skip(!username || !password, 'Need PLAYWRIGHT_USERNAME/PASSWORD in .env.playwright.local');

        await login(page, username!, password!);
        await openMissionMap(page);
        await startOptionalQuest(page);

        // Land in character_select Quest Prep (not Character Editor equipment banner).
        await expect(page.getByTestId(TestIds.gameSession)).toHaveAttribute(
            'data-game-phase',
            'character_select',
            { timeout: 45_000 },
        );
        const picker = page.getByTestId(TestIds.questPrepAbilityPicker);
        const slotBar = page.getByTestId(TestIds.questPrepAbilitySlotBar);
        await expect(picker).toBeVisible({ timeout: 30_000 });
        await expect(slotBar).toBeVisible({ timeout: 15_000 });

        // Empty slots show numbered placeholders before picks.
        await expect(slotBar.getByLabel('Empty ability slot 1')).toBeVisible();

        // Click first selectable ability card in the picker (if any).
        const firstCard = picker.locator('button').first();
        if (await firstCard.isVisible().catch(() => false)) {
            await firstCard.click();
            // Slot 1 should no longer be the empty placeholder after a successful pick.
            await expect(slotBar.getByLabel('Empty ability slot 1')).toBeHidden({ timeout: 10_000 });
        }

        const ready = page.getByTestId(TestIds.characterSelectReady);
        await expect(ready).toBeVisible({ timeout: 15_000 });
        await ready.click();

        // Host auto-advances when Ready; first mission may be story or battle.
        await expect(page.getByTestId(TestIds.gameSession)).not.toHaveAttribute(
            'data-game-phase',
            'character_select',
            { timeout: 60_000 },
        );

        const phase = await page.getByTestId(TestIds.gameSession).getAttribute('data-game-phase');
        expect(['pre_mission_story', 'battle', 'post_mission_story']).toContain(phase);
    });
});
