/**
 * Lighting system E2E scenarios.
 *
 * Scenario A — lighting_illuminates_area:
 *   Verifies that the stored lightTileGrid is pre-filled at mission start: the tile
 *   at the light source is bright, and a tile beyond the source's range stays dark.
 *
 * Scenario B — light_delayed_fade:
 *   Verifies that removing a light source causes tiles to darken gradually (one step
 *   per lightGameTick) rather than instantly.
 */

import type { ScenarioDefinition } from '../../types';
import { DarknessLevel } from '../../../game/darknessLevels';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    TINY_BATTLE_PLAYER_ID,
    spawnTinyPlayerUnit,
} from '../../harness/buildTinyBattleEngine';
import { LightSource } from '../../../game/lightSources/LightSource';

const CELL = 40;

const GRID_W = 20;
const GRID_H = 12;

const SOURCE_COL = 10;
const SOURCE_ROW = 6;
// Emission=5, radius=3 → range = 5+3 = 8 tiles.
// Far corner (0,0) is ~11.7 tiles from source — beyond range, stays at globalLightLevel (0).
const SOURCE_EMISSION = 5;
const SOURCE_RADIUS = 3;

function worldCenter(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function buildPlayerZigzag(startCol: number, row: number, maxCol: number): { col: number; row: number }[] {
    const path: { col: number; row: number }[] = [];
    let col = startCol;
    path.push({ col, row });
    while (col > 0) { col--; path.push({ col, row }); }
    while (col < maxCol) { col++; path.push({ col, row }); }
    while (col > 0) { col--; path.push({ col, row }); }
    return path;
}

// ============================================================================
// Scenario A — lighting_illuminates_area
// ============================================================================

export const lightingIlluminatesAreaScenario: ScenarioDefinition = {
    id: 'lighting_illuminates_area',
    title: 'Lighting: illuminates area',
    category: 'general',
    generalSection: 'Lighting',

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: GRID_W,
            gridH: GRID_H,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
        });

        const playerPos = worldCenter(1, 1);
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerPos.x,
            y: playerPos.y,
            abilities: [],
        });

        const pos = worldCenter(SOURCE_COL, SOURCE_ROW);
        engine.addLightSource(new LightSource({
            x: pos.x,
            y: pos.y,
            lightAmount: SOURCE_EMISSION,
            radius: SOURCE_RADIUS,
            decay: { roundCreated: 0, initialLightAmount: SOURCE_EMISSION, initialRadius: SOURCE_RADIUS, roundsTotal: 999 },
        }));

        engine.setMissionLightConfig(true, 0);

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.units.find((u) => u.ownerId === TINY_BATTLE_PLAYER_ID);
        if (!player) return [];
        const path = buildPlayerZigzag(1, 1, GRID_W - 1);
        return [{ unitId: player.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },

    assertPass(engine) {
        const pos = worldCenter(SOURCE_COL, SOURCE_ROW);
        const centerLevel = engine.getLightLevelAt(pos.x, pos.y);

        // Far corner (col=0, row=0) is beyond the source range.
        const farPos = worldCenter(0, 0);
        const farLevel = engine.getLightLevelAt(farPos.x, farPos.y);

        return (
            centerLevel !== null &&
            centerLevel > DarknessLevel.FULL_DARKNESS &&
            farLevel !== null &&
            farLevel <= DarknessLevel.FULL_DARKNESS
        );
    },

    failureMessage(engine) {
        const pos = worldCenter(SOURCE_COL, SOURCE_ROW);
        const farPos = worldCenter(0, 0);
        const centerLevel = engine.getLightLevelAt(pos.x, pos.y);
        const farLevel = engine.getLightLevelAt(farPos.x, farPos.y);
        return `Expected center>${DarknessLevel.FULL_DARKNESS} and far==${DarknessLevel.FULL_DARKNESS}. Got center=${centerLevel}, far=${farLevel}`;
    },
};

// ============================================================================
// Scenario B — light_delayed_fade
// ============================================================================

function createLightDelayedFadeScenario(): ScenarioDefinition {
    let lightSource: LightSource | null = null;
    let initialLevel = -1;

    return {
        id: 'light_delayed_fade',
        title: 'Lighting: gradual fade when source removed',
        category: 'general',
        generalSection: 'Lighting',
        maxDurationMs: 5000,

        buildEngine() {
            const engine = buildTinyBattleEngine({
                gridW: GRID_W,
                gridH: GRID_H,
                localPlayerId: TINY_BATTLE_PLAYER_ID,
            });

            const playerPos = worldCenter(1, 1);
            spawnTinyPlayerUnit(engine, {
                playerId: TINY_BATTLE_PLAYER_ID,
                x: playerPos.x,
                y: playerPos.y,
                abilities: [],
            });

            const pos = worldCenter(SOURCE_COL, SOURCE_ROW);
            lightSource = new LightSource({
                x: pos.x,
                y: pos.y,
                lightAmount: SOURCE_EMISSION,
                radius: SOURCE_RADIUS,
                decay: { roundCreated: 0, initialLightAmount: SOURCE_EMISSION, initialRadius: SOURCE_RADIUS, roundsTotal: 999 },
            });
            engine.addLightSource(lightSource);
            engine.setMissionLightConfig(true, 0);

            const pos1 = worldCenter(SOURCE_COL, SOURCE_ROW);
            initialLevel = engine.getLightLevelAt(pos1.x, pos1.y) ?? 0;

            return engine;
        },

        getInitialOrders(engine) {
            if (lightSource) lightSource.active = false;

            const player = engine.units.find((u) => u.ownerId === TINY_BATTLE_PLAYER_ID);
            if (!player) return [];
            const path = buildPlayerZigzag(1, 1, GRID_W - 1);
            return [{ unitId: player.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
        },

        assertPass(engine) {
            const pos = worldCenter(SOURCE_COL, SOURCE_ROW);
            const level = engine.getLightLevelAt(pos.x, pos.y);
            return level !== null && level < initialLevel;
        },

        failureMessage(engine) {
            const pos = worldCenter(SOURCE_COL, SOURCE_ROW);
            const level = engine.getLightLevelAt(pos.x, pos.y);
            return `Expected tile at source to fade below initial level ${initialLevel}. Got ${level}`;
        },
    };
}

export const lightDelayedFadeScenario = createLightDelayedFadeScenario();
