/**
 * Spawning a fused body with player-count health. A lobbing ability (Pod Mortar) calls `spawnFusedBody` once the
 * seed lands; the body's own fuse and effects then run from the `fusedBody` component.
 */

import { getEnemyHealthMultiplier } from '../../../constants/enemyConstants';
import type { TeamId } from '../../teams';
import type { Unit } from '../Unit';
import { getDefaultHp } from '../unit_defs/unitDef';
import type { SpawnDefinition } from '../spawning/spawnDefinition';
import { spawnUnit, type SpawnUnitContext } from '../spawning/spawnUnit';
import { UnitTag } from '../unitTag';

/** Base health scaled like every other enemy: `getEnemyHealthMultiplier(playerCount)`, never below 1. */
export function scaledFusedBodyHp(baseHp: number, playerCount: number): number {
    return Math.max(1, Math.round(baseHp * getEnemyHealthMultiplier(playerCount)));
}

export interface SpawnFusedBodyParams {
    /** Unit def that declares the `fusedBody` component (e.g. `pod_seed`). */
    characterId: string;
    x: number;
    y: number;
    /** Team of the lobber. Health scales for `enemy` only, like level-event spawns. Default `enemy`. */
    teamId?: TeamId;
    /** Stable id, when the caller needs to find the body again. */
    unitId?: string;
}

/** Build the spawn definition for a fused body (health scaled by `playerCount`). */
export function buildFusedBodySpawn(params: SpawnFusedBodyParams, playerCount: number): SpawnDefinition {
    const teamId = params.teamId ?? 'enemy';
    const baseHp = getDefaultHp(params.characterId);
    return {
        characterId: params.characterId,
        unitId: params.unitId,
        hp: teamId === 'enemy' ? scaledFusedBodyHp(baseHp, playerCount) : baseHp,
        speed: 0,
        abilities: [],
        teamId,
        ownerId: 'ai',
        unitTags: [UnitTag.CrowdSpacingExempt],
        placement: { kind: 'fixedWorld', x: params.x, y: params.y },
    };
}

/** Spawn one fused body at a world position. Returns the unit, or undefined if it could not be placed. */
export function spawnFusedBody(
    ctx: SpawnUnitContext & { readonly enemyScalingPlayerCount: number },
    params: SpawnFusedBodyParams,
): Unit | undefined {
    return spawnUnit(ctx, buildFusedBodySpawn(params, ctx.enemyScalingPlayerCount), 'abilitySpawn')[0];
}
