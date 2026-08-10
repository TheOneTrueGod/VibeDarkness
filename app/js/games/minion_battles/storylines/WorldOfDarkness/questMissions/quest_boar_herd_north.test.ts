/**
 * Quest: Find the herd of boars — slot 1 smoke (map goal + doubled opening packs).
 */

import { describe, expect, it } from 'vitest';
import {
    QUEST_BOAR_HERD_NORTH,
    QUEST_BOAR_HERD_NORTH_GOAL_MAX_DISTANCE,
    QUEST_BOAR_HERD_NORTH_MISSION_ID,
    QUEST_BOAR_HERD_NORTH_SLIME_MAX_UNITS,
    QUEST_BOAR_HERD_NORTH_SLIME_SPAWN_COUNT,
    QUEST_BOAR_HERD_NORTH_SPAWN_RADIUS_TILES,
    QUEST_BOAR_HERD_NORTH_START_SLIME_COUNT,
    QUEST_BOAR_HERD_NORTH_START_WOLF_COUNT,
    QUEST_BOAR_HERD_NORTH_WOLF_MAX_UNITS,
    QUEST_BOAR_HERD_NORTH_WOLF_SPAWN_COUNT,
} from './quest_boar_herd_north';

describe('quest_boar_herd_north', () => {
    it('uses a unique quest mission id and north-reach victory', () => {
        expect(QUEST_BOAR_HERD_NORTH.missionId).toBe(QUEST_BOAR_HERD_NORTH_MISSION_ID);
        expect(QUEST_BOAR_HERD_NORTH.mapPosition).toBeUndefined();
        const reach = QUEST_BOAR_HERD_NORTH.battleObjectives?.find((o) => o.id === 'reach_north');
        expect(reach?.toComplete).toEqual({
            type: 'allUnitsNearPosition',
            col: expect.any(Number),
            row: expect.any(Number),
            maxDistance: QUEST_BOAR_HERD_NORTH_GOAL_MAX_DISTANCE,
        });
    });

    it('opens with doubled wolf/slime packs and no boars', () => {
        const enemies = QUEST_BOAR_HERD_NORTH.enemies ?? [];
        expect(enemies.filter((e) => e.characterId === 'dark_wolf')).toHaveLength(
            QUEST_BOAR_HERD_NORTH_START_WOLF_COUNT,
        );
        expect(enemies.filter((e) => e.characterId === 'slime')).toHaveLength(
            QUEST_BOAR_HERD_NORTH_START_SLIME_COUNT,
        );
        expect(enemies.some((e) => e.characterId === 'boar')).toBe(false);
    });

    it('reinforces from the northern spawn target at double light_empowered rates', () => {
        const events = QUEST_BOAR_HERD_NORTH.levelEvents ?? [];
        const wolf = events.find(
            (e) =>
                e.type === 'continuousSpawn'
                && e.spawns?.[0]?.characterId === 'dark_wolf',
        );
        const slime = events.find(
            (e) =>
                e.type === 'continuousSpawn'
                && e.spawns?.[0]?.characterId === 'slime',
        );
        expect(wolf?.type).toBe('continuousSpawn');
        expect(slime?.type).toBe('continuousSpawn');
        if (wolf?.type !== 'continuousSpawn' || slime?.type !== 'continuousSpawn') return;

        expect(wolf.maxUnits).toBe(QUEST_BOAR_HERD_NORTH_WOLF_MAX_UNITS);
        expect(slime.maxUnits).toBe(QUEST_BOAR_HERD_NORTH_SLIME_MAX_UNITS);
        expect(wolf.spawns[0]?.spawnCount).toBe(QUEST_BOAR_HERD_NORTH_WOLF_SPAWN_COUNT);
        expect(slime.spawns[0]?.spawnCount).toBe(QUEST_BOAR_HERD_NORTH_SLIME_SPAWN_COUNT);
        expect(wolf.spawns[0]?.spawnTarget?.radius).toBe(QUEST_BOAR_HERD_NORTH_SPAWN_RADIUS_TILES);
        expect(slime.spawns[0]?.spawnTarget?.radius).toBe(QUEST_BOAR_HERD_NORTH_SPAWN_RADIUS_TILES);
    });
});
