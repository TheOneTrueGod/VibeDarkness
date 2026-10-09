import type { CampaignState } from '../../../../types';

/**
 * Campaign-level equipment unlocks. Defaults to `[]` for legacy saves / missing campaign,
 * and drops blanks and duplicates (order preserved).
 */
export function getUnlockedItemIds(campaign: Pick<CampaignState, 'unlockedItemIds'> | null | undefined): string[] {
    const raw = campaign?.unlockedItemIds;
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const id of raw) {
        if (typeof id !== 'string') continue;
        const t = id.trim();
        if (t !== '' && !out.includes(t)) out.push(t);
    }
    return out;
}
