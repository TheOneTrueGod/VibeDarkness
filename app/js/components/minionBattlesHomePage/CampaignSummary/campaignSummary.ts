/**
 * Pure helpers for the admin Campaign Summary tab: player ordering, player colours,
 * the default tracked character, and which missions a character is currently "at".
 */
import type { AccountState } from '../../../types';
import type { CampaignCharacter } from '../../../games/minion_battles/character_defs/CampaignCharacter';
import type { StorylineDef } from '../../../games/minion_battles/storylines/types';
import { getUnlockedMissionIds, hasVictoryResult } from '../../../games/minion_battles/storylines/unlock';

/** Distinct, dark-theme-friendly player colours. Wraps when there are more players. */
export const SUMMARY_PLAYER_COLORS = [
    '#f43f5e', // rose
    '#3b82f6', // blue
    '#22c55e', // green
    '#f59e0b', // amber
    '#a855f7', // purple
    '#06b6d4', // cyan
    '#f97316', // orange
    '#ec4899', // pink
    '#84cc16', // lime
    '#6366f1', // indigo
    '#14b8a6', // teal
    '#eab308', // yellow
] as const;

/**
 * Favourited first, then most recent login, then name. Accounts with no recorded login
 * sort after those with one.
 */
export function sortSummaryAccounts<T extends Pick<AccountState, 'name' | 'adminFavorite' | 'lastLoginAt'>>(
    accounts: T[],
): T[] {
    return [...accounts].sort((a, b) => {
        const fav = Number(!!b.adminFavorite) - Number(!!a.adminFavorite);
        if (fav !== 0) return fav;
        const login = (b.lastLoginAt ?? 0) - (a.lastLoginAt ?? 0);
        if (login !== 0) return login;
        return a.name.localeCompare(b.name);
    });
}

/**
 * Colour per account id, assigned in ascending id order so a player's colour stays put
 * when favourites or logins reshuffle the list (new accounts take the next colour).
 */
export function assignPlayerColors(accounts: Pick<AccountState, 'id'>[]): Map<number, string> {
    const ids = [...new Set(accounts.map((a) => a.id))].sort((a, b) => a - b);
    return new Map(ids.map((id, i) => [id, SUMMARY_PLAYER_COLORS[i % SUMMARY_PLAYER_COLORS.length]]));
}

/** The stored tracked character when it still exists, else the most recently used one. */
export function defaultTrackedCharacterId(
    account: Pick<AccountState, 'adminFavoriteCharacterId'>,
    characters: Pick<CampaignCharacter, 'id' | 'lastUsed'>[],
): string | null {
    const stored = account.adminFavoriteCharacterId;
    if (stored && characters.some((c) => c.id === stored)) return stored;
    let best: Pick<CampaignCharacter, 'id' | 'lastUsed'> | null = null;
    for (const c of characters) {
        if (!best || c.lastUsed > best.lastUsed) best = c;
    }
    return best?.id ?? null;
}

/**
 * Missions the character is "at" in `storyline`: reachable from what they have won (the player's
 * view of unlocks) but not yet won themselves. Empty when the character is in another campaign.
 * A character with several open branches is at several missions.
 */
export function getMissionsCharacterIsAt(
    storyline: StorylineDef,
    character: Pick<CampaignCharacter, 'campaignId' | 'missionResults' | 'questResults'>,
): Set<string> {
    if (character.campaignId !== storyline.id) return new Set();
    const missionResults = character.missionResults[storyline.id] ?? [];
    const questResults = character.questResults[storyline.id] ?? [];
    const unlocked = getUnlockedMissionIds(storyline, missionResults, questResults, { isAdmin: false });
    return new Set([...unlocked].filter((id) => !hasVictoryResult(id, missionResults)));
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / a date; "never" when unknown. */
export function formatLastLogin(lastLoginAt: number | null | undefined, nowSeconds: number): string {
    if (!lastLoginAt) return 'never';
    const diff = Math.max(0, nowSeconds - lastLoginAt);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(lastLoginAt * 1000).toLocaleDateString();
}
