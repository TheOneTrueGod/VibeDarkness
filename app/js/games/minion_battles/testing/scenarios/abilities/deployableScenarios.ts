/**
 * Deployable scenarios (docs/plans/deployables.md): bramble is a first-class deployable, and owned
 * deployables survive a checkpoint round trip. Lay Hands / Gather Light ownership filtering lives in
 * layHandsScenarios.ts / gatherLightScenario.ts.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { GameEngine } from '../../../game/GameEngine';
import { LightSource } from '../../../game/lightSources/LightSource';
import { REACH_5X5_HALF_EXTENT } from '../../../game/deployables/Deployable';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    BRAMBLE_PATCH_RADIUS,
    BRAMBLE_PATCH_STRIKE_ID,
    BRAMBLE_PATCH_THORN_EFFECT_TYPE,
} from '../../../card_defs/07_command_core/0706_BramblePatch/0706Ability';

const P = TINY_BATTLE_PLAYER_ID;
const PLAYER = { x: 5 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 };

type Engine = ReturnType<typeof buildTinyBattleEngine>;

function brambleEffectCount(engine: Engine): number {
    return Array.from(engine.terrainLayers.allEffects.values()).filter(
        (e) => e.effectType === BRAMBLE_PATCH_THORN_EFFECT_TYPE,
    ).length;
}

function findOwnBramble(engine: Engine) {
    return engine.findDeployables({
        castingTeam: 'player',
        near: PLAYER,
        radius: BRAMBLE_PATCH_RADIUS * 2,
        tags: ['bramble'],
    });
}

export const deployableBrambleFoundAndConsumedScenario: ScenarioDefinition = {
    id: 'deployable_bramble_found_and_consumed',
    title: 'Deployables: Bramble Patch is found via findDeployables by the casting team and consumed, freeing its cells',
    category: 'ability',
    maxDurationMs: 4000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        spawnTinyPlayerUnit(engine, { playerId: P, x: PLAYER.x, y: PLAYER.y, abilities: [BRAMBLE_PATCH_STRIKE_ID] });
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: BRAMBLE_PATCH_STRIKE_ID, targets: [] }];
    },

    // Mutating on purpose: the first call that sees bramble consumes it, then verifies in the same call
    // (so the result is stable if the runner calls assertPass again — it stops at the first true).
    assertPass(engine) {
        if (brambleEffectCount(engine) === 0) return false;
        const found = findOwnBramble(engine);
        if (found.length === 0) return false;
        // Enemy team must not see the player's bramble.
        const enemyView = engine.findDeployables({
            castingTeam: 'enemy',
            near: PLAYER,
            radius: BRAMBLE_PATCH_RADIUS * 2,
            tags: ['bramble'],
        });
        if (enemyView.length !== 0) return false;
        for (const d of found) {
            if (!engine.consumeDeployable(d)) return false;
        }
        return brambleEffectCount(engine) === 0 && findOwnBramble(engine).length === 0;
    },

    failureMessage(engine) {
        return `bramble effects=${brambleEffectCount(engine)}, found by player team=${findOwnBramble(engine).length} (expected found, then consumed to 0)`;
    },
};

const ROUNDTRIP_MIN_TIME = 0.5;
const roundTripResult = new WeakMap<object, boolean>();

function deployableSignature(engine: Engine): string {
    const list = engine.findDeployables({
        castingTeam: 'player',
        near: PLAYER,
        halfExtent: REACH_5X5_HALF_EXTENT * 4,
    });
    return JSON.stringify(list.map((d) => ({ ...d })));
}

export const deployableCheckpointRoundtripScenario: ScenarioDefinition = {
    id: 'deployable_checkpoint_roundtrip',
    title: 'Deployables: owned light + bramble are found identically after a mid-battle checkpoint restore',
    category: 'ability',
    maxDurationMs: 4000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 10, localPlayerId: P, grass: true });
        const player = spawnTinyPlayerUnit(engine, { playerId: P, x: PLAYER.x, y: PLAYER.y, abilities: [] });
        engine.addLightSource(new LightSource({
            id: 'roundtrip_torch',
            x: PLAYER.x + CELL_SIZE,
            y: PLAYER.y,
            lightAmount: 4,
            radius: 2,
            decay: { roundCreated: 0, initialLightAmount: 4, initialRadius: 2, roundsTotal: 1000 },
            ownerUnitId: player.id,
            ownerAbilityId: '0601',
            teamId: player.teamId,
        }));
        engine.terrainLayers.add({
            id: 'roundtrip_bramble',
            layer: 'ground',
            effectType: BRAMBLE_PATCH_THORN_EFFECT_TYPE,
            placedAtGameTime: 0,
            ownerUnitId: player.id,
            ownerAbilityId: BRAMBLE_PATCH_STRIKE_ID,
            teamId: player.teamId,
            area: { type: 'cell', col: 6, row: 5 },
            params: { slowMult: 0.52 },
        });
        return engine;
    },

    // Keeps the battle from idling out before the mid-battle checkpoint.
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        if (engine.gameTime < ROUNDTRIP_MIN_TIME) return false;
        const cached = roundTripResult.get(engine);
        if (cached !== undefined) return cached;
        const before = deployableSignature(engine);
        const restored = GameEngine.fromJSON(engine.toJSON(), P, engine.terrainManager);
        const ok = before.includes('roundtrip_torch')
            && before.includes('roundtrip_bramble')
            && deployableSignature(restored) === before;
        roundTripResult.set(engine, ok);
        return ok;
    },

    failureMessage(engine) {
        return `deployables before restore: ${deployableSignature(engine)} (expected torch + bramble, identical after restore)`;
    },
};

