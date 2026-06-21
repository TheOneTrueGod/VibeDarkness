/**
 * Lanternite death behaviour scenarios — verify the onDeathBehaviors migration from World Modifiers.
 *
 * Scenario A — lanternite_death_behaviors:
 *   Kill a free (non-nest-owned) lanternite. Verify its torch light source is deactivated
 *   and a replacement lanternite spawns after LANTERNITE_RESPAWN_DELAY_SEC.
 *
 * Scenario B — lanternite_nest_owned_no_respawn:
 *   Kill a nest-owned lanternite. Verify its torch light source is deactivated but no
 *   replacement spawns (sporeRebirth skips nest-owned units).
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    TINY_BATTLE_PLAYER_ID,
    spawnTinyPlayerUnit,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { LightSource } from '../../../game/lightSources/LightSource';
import {
    LANTERNITE_TORCH_LIGHT,
    LANTERNITE_TORCH_RADIUS_TILES,
    LANTERNITE_RESPAWN_DELAY_SEC,
} from '../../../game/lanternite/lanternitePulse';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const GRID_W = 10;
const GRID_H = 10;

const LANTERNITE_X = 3 * CELL + CELL / 2;
const LANTERNITE_Y = 3 * CELL + CELL / 2;
const PLAYER_X = 7 * CELL + CELL / 2;
const PLAYER_Y = 7 * CELL + CELL / 2;

// Build a zigzag path along row 7 so the player keeps moving (prevents idle exit).
function buildPlayerPath(): { col: number; row: number }[] {
    const row = 7;
    const path: { col: number; row: number }[] = [];
    for (let col = 7; col >= 0; col--) path.push({ col, row });
    for (let col = 0; col <= GRID_W - 1; col++) path.push({ col, row });
    for (let col = GRID_W - 1; col >= 0; col--) path.push({ col, row });
    return path;
}

// ============================================================================
// Scenario A — lanternite_death_behaviors
// ============================================================================

export const lanterniteDeathBehaviorsScenario: ScenarioDefinition = {
    id: 'lanternite_death_behaviors',
    title: 'Lanternite death: torch deactivated and replacement spawns after delay',
    category: 'general',
    generalSection: 'Lanternites',
    // Needs to run past LANTERNITE_RESPAWN_DELAY_SEC (3s) plus buffer
    maxDurationMs: (LANTERNITE_RESPAWN_DELAY_SEC + 2) * 1000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: GRID_W, gridH: GRID_H, localPlayerId: P });

        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_X,
            y: PLAYER_Y,
            abilities: [],
        });

        const lanternite = createUnitFromSpawnConfig(
            {
                id: 'test_lanternite_free',
                characterId: 'lanternite',
                name: 'Lanternite',
                x: LANTERNITE_X,
                y: LANTERNITE_Y,
                teamId: 'allied',
                ownerId: 'ai',
                abilities: [],
            },
            engine.eventBus,
            engine,
        );
        engine.addUnit(lanternite, 'initialGameSpawn');

        // Simulate the torch light source the lanternite would have in a real mission.
        engine.addLightSource(
            new LightSource({
                id: `lantern_torch_${lanternite.id}`,
                x: lanternite.x,
                y: lanternite.y,
                lightAmount: LANTERNITE_TORCH_LIGHT,
                radius: LANTERNITE_TORCH_RADIUS_TILES,
                followUnitId: lanternite.id,
                decay: {
                    roundCreated: 0,
                    initialLightAmount: LANTERNITE_TORCH_LIGHT,
                    initialRadius: LANTERNITE_TORCH_RADIUS_TILES,
                    roundsTotal: 999,
                },
            }),
        );

        // Kill the lanternite — fires onDeathBehaviors: removes torch, queues respawn.
        engine.adminKillUnit(lanternite.id);

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: buildPlayerPath() }];
    },

    assertPass(engine) {
        // 1. Torch must be gone: deactivated on death and cleaned up by LightSourceManager.
        const torch = engine.lightSources.find((ls: LightSource) => ls.id === 'lantern_torch_test_lanternite_free');
        if (torch !== undefined) return false;

        // 2. A replacement lanternite must have spawned (alive, not the original dead unit).
        const alive = engine.units.filter((u) => u.characterId === 'lanternite' && u.isAlive());
        return alive.length > 0;
    },

    failureMessage(engine) {
        const torch = engine.lightSources.find((ls: LightSource) => ls.id === 'lantern_torch_test_lanternite_free');
        const aliveLanternites = engine.units.filter((u) => u.characterId === 'lanternite' && u.isAlive());
        return (
            `torch still present=${torch !== undefined}` +
            ` | aliveLanternites=${aliveLanternites.length}` +
            ` | gameTime=${engine.gameTime.toFixed(2)}`
        );
    },
};

// ============================================================================
// Scenario B — lanternite_nest_owned_no_respawn
// ============================================================================

export const lanterniteNestOwnedNoRespawnScenario: ScenarioDefinition = {
    id: 'lanternite_nest_owned_no_respawn',
    title: 'Lanternite death: nest-owned unit torch deactivated but no respawn queued',
    category: 'general',
    generalSection: 'Lanternites',
    // Run past the respawn delay to confirm no respawn fires.
    maxDurationMs: (LANTERNITE_RESPAWN_DELAY_SEC + 2) * 1000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: GRID_W, gridH: GRID_H, localPlayerId: P });

        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_X,
            y: PLAYER_Y,
            abilities: [],
        });

        const lanternite = createUnitFromSpawnConfig(
            {
                id: 'test_lanternite_nested',
                characterId: 'lanternite',
                name: 'Lanternite',
                x: LANTERNITE_X,
                y: LANTERNITE_Y,
                teamId: 'allied',
                ownerId: 'ai',
                abilities: [],
            },
            engine.eventBus,
            engine,
        );
        // Mark as nest-owned — sporeRebirth must skip this unit.
        lanternite.lanterniteNestOwnerUnitId = 'fake_nest_id';
        engine.addUnit(lanternite, 'initialGameSpawn');

        engine.addLightSource(
            new LightSource({
                id: `lantern_torch_${lanternite.id}`,
                x: lanternite.x,
                y: lanternite.y,
                lightAmount: LANTERNITE_TORCH_LIGHT,
                radius: LANTERNITE_TORCH_RADIUS_TILES,
                followUnitId: lanternite.id,
                decay: {
                    roundCreated: 0,
                    initialLightAmount: LANTERNITE_TORCH_LIGHT,
                    initialRadius: LANTERNITE_TORCH_RADIUS_TILES,
                    roundsTotal: 999,
                },
            }),
        );

        engine.adminKillUnit(lanternite.id);

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: buildPlayerPath() }];
    },

    assertPass(engine) {
        // Wait until past the respawn delay so we can be sure no respawn fired.
        if (engine.gameTime < LANTERNITE_RESPAWN_DELAY_SEC + 1) return false;

        // 1. Torch must be inactive.
        // 1. Torch must be gone: deactivated on death and cleaned up by LightSourceManager.
        const torch = engine.lightSources.find((ls: LightSource) => ls.id === 'lantern_torch_test_lanternite_nested');
        if (torch !== undefined) return false;

        // 2. No lanternite should have respawned.
        const alive = engine.units.filter((u) => u.characterId === 'lanternite' && u.isAlive());
        return alive.length === 0;
    },

    failureMessage(engine) {
        const torch = engine.lightSources.find((ls: LightSource) => ls.id === 'lantern_torch_test_lanternite_nested');
        const aliveLanternites = engine.units.filter((u) => u.characterId === 'lanternite' && u.isAlive());
        return (
            `torch still present=${torch !== undefined}` +
            ` | aliveLanternites=${aliveLanternites.length}` +
            ` | gameTime=${engine.gameTime.toFixed(2)}`
        );
    },
};
