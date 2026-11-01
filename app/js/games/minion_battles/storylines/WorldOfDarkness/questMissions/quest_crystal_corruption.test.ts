import { describe, expect, it } from 'vitest';
import { QUEST_CRYSTAL_CORRUPTION } from './quest_crystal_corruption';
import { CRYSTAL_CORRUPTION } from '../missions/004b_crystal_corruption';
import type { LevelEventConvertSpecialTile } from '../../types';

function conversions(levelEvents: typeof CRYSTAL_CORRUPTION.levelEvents): LevelEventConvertSpecialTile[] {
    return (levelEvents ?? []).filter((e): e is LevelEventConvertSpecialTile => e.type === 'convertSpecialTile');
}

describe('QuestCrystalCorruptionMission', () => {
    it('stays playable when the campaign map copy is disabled', () => {
        expect(QUEST_CRYSTAL_CORRUPTION.disabled).toBe(false);
    });

    it('starts with every crystal corrupted', () => {
        const crystals = (QUEST_CRYSTAL_CORRUPTION.specialTiles ?? []).filter((t) => t.defId !== 'Campfire');
        expect(crystals).toHaveLength(5);
        expect(crystals.every((t) => t.defId === 'DarkCrystal')).toBe(true);
    });

    it('restores one crystal per round, on the same tiles and rounds the side mission corrupts them', () => {
        const restore = conversions(QUEST_CRYSTAL_CORRUPTION.levelEvents);
        const corrupt = conversions(CRYSTAL_CORRUPTION.levelEvents);
        expect(restore.map((e) => e.replacementDefId)).toEqual(Array(5).fill('Crystal'));
        expect(corrupt.map((e) => e.replacementDefId)).toEqual(Array(5).fill('DarkCrystal'));
        expect(restore.map((e) => [e.col, e.row, e.trigger.atRound])).toEqual(
            corrupt.map((e) => [e.col, e.row, e.trigger.atRound]),
        );
    });
});
