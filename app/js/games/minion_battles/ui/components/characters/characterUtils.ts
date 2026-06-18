import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { PlayerState } from '../../../../../types';
import { getItemDef } from '../../../character_defs/items';

export function buildCounts(items: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const itemId of items) {
        counts[itemId] = (counts[itemId] ?? 0) + 1;
    }
    return counts;
}

export function sortByLastUsed(characters: CampaignCharacter[]): CampaignCharacter[] {
    return [...characters].sort((a, b) => b.lastUsed - a.lastUsed);
}

export function sortPlayers(players: Record<string, PlayerState>): PlayerState[] {
    return Object.values(players).sort((a, b) => {
        if (a.isHost && !b.isHost) return -1;
        if (!a.isHost && b.isHost) return 1;
        return a.name.localeCompare(b.name);
    });
}

export function getItemName(itemId: string): string {
    return getItemDef(itemId)?.name ?? itemId;
}
