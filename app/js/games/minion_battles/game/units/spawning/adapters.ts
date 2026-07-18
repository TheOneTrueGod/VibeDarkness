/**
 * Adapters from the existing mission-authoring types (`EnemySpawnDef`, `SpawnWaveEntry`) to the
 * unified `SpawnDefinition`. Both `BaseMissionDef.ts` (mission-start `enemies[]`, and
 * `proximitySpawn`'s `extraEnemySpawns`) and `LevelEventManager.ts` (`spawnWave`/`continuousSpawn`)
 * share these instead of each hand-rolling their own field-copying logic.
 */

import type { EnemySpawnDef, SpawnWaveEntry } from '../../../storylines/types';
import { LANTERNITE_NEST_CHARACTER_ID } from '../../lanternite/lanternitePulse';
import { SWARM_NEST_CHARACTER_ID } from '../../lanternite/swarmNestTick';
import { THORNLING_NEST_CHARACTER_ID } from '../../lanternite/thornlingNestTick';
import type { SpawnAiHookup, SpawnDefinition, SpawnPlacement } from './spawnDefinition';

/** Builds the `lanternite` AI hookup from the ecology fields both source types carry. */
function buildLanternitePatrolHookup(fields: {
    lanterniteNestOwnerUnitId?: string;
    lanternPatrolFarWorld?: { x: number; y: number };
    lanternPatrolLeg?: 'toFar' | 'toNest';
    lanterniteRole?: 'scout' | 'defender';
    lanterniteTargetNestPoiId?: string;
}): SpawnAiHookup | undefined {
    const hasAny =
        fields.lanterniteNestOwnerUnitId != null ||
        fields.lanternPatrolFarWorld != null ||
        fields.lanternPatrolLeg != null ||
        fields.lanterniteRole != null ||
        fields.lanterniteTargetNestPoiId != null;
    if (!hasAny) return undefined;
    return {
        kind: 'lanternite',
        nestOwnerUnitId: fields.lanterniteNestOwnerUnitId,
        patrolFarWorld: fields.lanternPatrolFarWorld,
        patrolLeg: fields.lanternPatrolLeg,
        role: fields.lanterniteRole,
        targetNestPoiId: fields.lanterniteTargetNestPoiId,
    };
}

/** Mission-start / proximitySpawn extraEnemySpawns entry -> SpawnDefinition (fixed position). */
export function enemySpawnDefToSpawnDefinition(e: EnemySpawnDef, ownerId = 'ai'): SpawnDefinition {
    const placement: SpawnPlacement = { kind: 'fixedWorld', x: e.position.x, y: e.position.y };

    let aiHookup: SpawnAiHookup | undefined;
    if (e.characterId === LANTERNITE_NEST_CHARACTER_ID && e.lanterniteNest != null) {
        aiHookup = { kind: 'lanterniteNest', nestConfig: e.lanterniteNest, homeNestPoiId: e.lanterniteNest.nestPoiId };
    } else if (e.characterId === SWARM_NEST_CHARACTER_ID && e.swarmNest != null) {
        aiHookup = { kind: 'swarmNest', nestConfig: e.swarmNest, homeNestPoiId: e.swarmNest.nestPoiId };
    } else if (e.characterId === THORNLING_NEST_CHARACTER_ID && e.thornlingNest != null) {
        aiHookup = { kind: 'thornlingNest', nestConfig: e.thornlingNest };
    } else {
        aiHookup = buildLanternitePatrolHookup(e);
    }

    return {
        characterId: e.characterId,
        name: e.name,
        hp: e.hp,
        speed: e.speed,
        abilities: e.abilities,
        aiSettings: e.aiSettings,
        radius: e.radius,
        unitTags: e.unitTags,
        teamId: e.teamId,
        ownerId,
        controlGroupId: e.controlGroupId,
        controllable: e.controllable,
        unitId: e.unitId,
        invulnerabilityGenerations: e.invulnerabilityGenerations,
        unitAITreeId: e.unitAITreeId,
        placement,
        aiHookup,
    };
}

function spawnBehaviourToPlacement(entry: SpawnWaveEntry): SpawnPlacement {
    const behaviour = entry.spawnBehaviour ?? 'edgeOfMap';
    switch (behaviour) {
        case 'edgeOfMap':
            return { kind: 'edgeOfMap' };
        case 'closest':
            return { kind: 'closestToPlayers', inDarkness: entry.closestConfig?.inDarkness };
        case 'closestEnemySpawnPoint':
            return {
                kind: 'closestEnemySpawnPoint',
                radius: entry.enemySpawnPointConfig?.radius,
                inDarkness: entry.enemySpawnPointConfig?.inDarkness,
                matchesTags: entry.enemySpawnPointConfig?.matchesTags,
            };
        case 'network_nearest_owned_leaf':
            return {
                kind: 'networkNearestOwnedLeaf',
                ownerCharacterIds: entry.networkNearestOwnedLeafConfig?.ownerCharacterIds,
                radius: entry.networkNearestOwnedLeafConfig?.radius,
                inDarkness: entry.networkNearestOwnedLeafConfig?.inDarkness,
                maxDistance: entry.networkNearestOwnedLeafConfig?.maxDistance,
            };
        case 'anywhere':
        default:
            return {
                kind: 'anywhere',
                inDarkness: entry.inDarkness,
                target: entry.spawnTarget,
                zoneId: entry.spawnZoneId,
            };
    }
}

/** LevelEventManager spawnWave/continuousSpawn entry (+ its base template) -> SpawnDefinition. */
export function spawnWaveEntryToSpawnDefinition(base: EnemySpawnDef, entry: SpawnWaveEntry, ownerId = 'ai'): SpawnDefinition {
    return {
        characterId: entry.characterId,
        name: entry.name ?? base.name,
        hp: entry.hp,
        speed: entry.speed,
        stackSize: entry.stackSize,
        abilities: base.abilities,
        aiSettings: entry.aiSettings ?? base.aiSettings,
        radius: base.radius,
        unitTags: entry.unitTags ?? base.unitTags,
        teamId: base.teamId,
        ownerId,
        controlGroupId: entry.controlGroupId ?? base.controlGroupId,
        controllable: entry.controllable ?? base.controllable,
        unitAITreeId: entry.unitAITreeId,
        placement: spawnBehaviourToPlacement(entry),
        aiHookup: buildLanternitePatrolHookup(entry),
        count: Math.max(0, entry.spawnCount ?? 1),
    };
}
