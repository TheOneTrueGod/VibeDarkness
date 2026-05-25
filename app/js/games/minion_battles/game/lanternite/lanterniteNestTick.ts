/**
 * Lanternite nest — pacing spawns toward a patrol corridor or networked nest expansion;
 * per-nest child id tracking; construction completion for scout-built nests.
 */

import type { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import type { Unit } from '../units/Unit';
import type { MapSegmentPOI } from '../../terrain/segmentSchema';
import type { LanterniteNestMissionConfig } from '../../storylines/types';
import { createUnitFromSpawnConfig } from '../units/index';
import {
    LANTERNITE_CHARACTER_ID,
    LANTERNITE_NEST_CHARACTER_ID,
    prepareLanterniteNestForMissionStart,
} from './lanternitePulse';
import { findUnoccupiedConnectedNestPoi, countAliveChildrenByRole } from './lanterniteNetworkUtils';

const ROUND_DURATION_SEC = 10;

function pruneSpawnedLanternIds(nest: Unit, units: readonly Unit[]): void {
    const state = nest.lanterniteNestSpawnState;
    if (!state) return;
    state.spawnedIds = state.spawnedIds.filter((id) => {
        const u = units.find((x) => x.id === id);
        return u != null && u.isAlive();
    });
}

function resolvePatrolFarWorld(nest: Unit, units: readonly Unit[]): { x: number; y: number } | null {
    const cfg = nest.lanterniteNestConfig;
    if (!cfg) return null;
    const dest = cfg.patrolDestination;
    if (dest.kind === 'world') return { x: dest.x, y: dest.y };
    const other = units.find((u) => u.id === dest.unitId && u.isAlive());
    return other ? { x: other.x, y: other.y } : null;
}

interface TerrainGridLike {
    gridToWorld: (col: number, row: number) => { x: number; y: number };
}

/**
 * Advances nest spawn timers once per simulation tick (host).
 * Also handles scout construction completion — spawns a new nest and removes the scout.
 */
export function processLanterniteNests(params: {
    gameTime: number;
    units: Unit[];
    eventBus: EventBus;
    addUnit: (unit: Unit) => void;
    idSource?: Pick<EngineContext, 'allocateObjectId'> | EngineContext;
    mapPOIs?: readonly MapSegmentPOI[];
    terrainGrid?: TerrainGridLike | null;
}): void {
    // --- Construction completion: scouts that have finished building ---
    for (const unit of params.units) {
        if (
            !unit.isAlive() ||
            unit.lanterniteConstructionCompleteAtGameTime == null ||
            params.gameTime < unit.lanterniteConstructionCompleteAtGameTime
        ) {
            continue;
        }

        const parentNestId = unit.lanterniteNestOwnerUnitId;
        const parentNest = parentNestId
            ? params.units.find((u) => u.id === parentNestId)
            : null;

        // Remove scout from parent's spawn tracking
        if (parentNest?.lanterniteNestSpawnState) {
            parentNest.lanterniteNestSpawnState.spawnedIds =
                parentNest.lanterniteNestSpawnState.spawnedIds.filter((id) => id !== unit.id);
        }

        const parentCfg = parentNest?.lanterniteNestConfig;
        const newNestCfg: LanterniteNestMissionConfig = {
            maxLanternites: parentCfg?.maxLanternites ?? 3,
            spawnIntervalSec: parentCfg?.spawnIntervalSec ?? 14,
            patrolDestination: { kind: 'world', x: unit.x, y: unit.y },
            networked: true,
            nestPoiId: unit.lanterniteTargetNestPoiId ?? undefined,
            scoutConstructionSec: parentCfg?.scoutConstructionSec ?? 12,
        };

        const newNest = createUnitFromSpawnConfig(
            {
                x: unit.x,
                y: unit.y,
                teamId: 'allied' as const,
                ownerId: 'ai',
                characterId: LANTERNITE_NEST_CHARACTER_ID,
                name: 'Lanternite Nest',
                abilities: [],
                unitAITreeId: 'lanterniteNestIdle',
                aiSettings: { minRange: 0, maxRange: 0 },
                hp: undefined,
                speed: undefined,
            },
            params.eventBus,
            params.idSource,
        );
        newNest.lanterniteNestConfig = newNestCfg;
        newNest.lanterniteHomeNestPoiId = unit.lanterniteTargetNestPoiId ?? null;
        prepareLanterniteNestForMissionStart(newNest, params.gameTime);
        params.addUnit(newNest);

        // Kill scout (nest-owned, so no global respawn will trigger)
        unit.hp = 0;
        unit.active = false;
        params.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
    }

    // --- Nest spawning ---
    for (const nest of params.units) {
        if (!nest.isAlive() || nest.characterId !== LANTERNITE_NEST_CHARACTER_ID) continue;

        const cfg = nest.lanterniteNestConfig;
        const state = nest.lanterniteNestSpawnState;
        if (!cfg || !state) continue;

        pruneSpawnedLanternIds(nest, params.units);

        const aliveKids = nest.lanterniteNestSpawnState!.spawnedIds.length;
        if (aliveKids >= cfg.maxLanternites) continue;
        if (params.gameTime < state.nextSpawnAtGameTime) continue;

        const lan = createUnitFromSpawnConfig(
            {
                x: nest.x + (state.spawnedIds.length === 0 ? 0 : 16),
                y: nest.y,
                teamId: 'allied' as const,
                ownerId: 'ai',
                characterId: LANTERNITE_CHARACTER_ID,
                name: 'Lanternite',
                abilities: [],
                unitAITreeId: 'lanternitePatrol',
                aiSettings: { minRange: 0, maxRange: 600 },
                hp: undefined,
                speed: undefined,
            },
            params.eventBus,
            params.idSource,
        );
        lan.lanterniteNestOwnerUnitId = nest.id;

        if (cfg.networked) {
            // Network mode: assign roles, resolve scout target, stagger attack offset
            const defenderCount = countAliveChildrenByRole(state.spawnedIds, params.units, 'defender');
            const targetDefenders = Math.floor(cfg.maxLanternites / 2);
            const nestPoiId = nest.lanterniteHomeNestPoiId ?? cfg.nestPoiId;

            let role: 'scout' | 'defender' = 'defender';
            let targetPoi: MapSegmentPOI | null = null;

            if (aliveKids === 0 || (defenderCount >= targetDefenders)) {
                // First spawn is a scout; subsequent scouts go to unoccupied connected POIs
                if (nestPoiId && params.mapPOIs) {
                    targetPoi = findUnoccupiedConnectedNestPoi(nestPoiId, params.mapPOIs, params.units);
                }
                role = targetPoi ? 'scout' : 'defender';
            } else if (defenderCount < targetDefenders) {
                role = 'defender';
            }

            lan.lanterniteRole = role;
            lan.unitAITreeId = 'lanterniteNetwork';

            if (role === 'scout' && targetPoi && params.terrainGrid) {
                const worldPos = params.terrainGrid.gridToWorld(targetPoi.col, targetPoi.row);
                lan.lanternPatrolFarWorld = worldPos;
                lan.lanterniteTargetNestPoiId = targetPoi.id;
                lan.lanterniteNestConfig = cfg;
            }

            const numPhases = Math.max(1, cfg.maxLanternites);
            const phaseOffsetSec =
                (state.spawnedIds.length % numPhases) * (ROUND_DURATION_SEC / numPhases);
            lan.lanterniteAttackReadyAtGameTime = params.gameTime + phaseOffsetSec;
        } else {
            // Legacy patrol behavior
            const far = resolvePatrolFarWorld(nest, params.units);
            if (!far) continue;
            lan.lanternPatrolFarWorld = { ...far };
            lan.lanternPatrolLeg = 'toFar';
        }

        params.addUnit(lan);

        nest.lanterniteNestSpawnState!.spawnedIds.push(lan.id);
        nest.lanterniteNestSpawnState!.nextSpawnAtGameTime =
            params.gameTime + Math.max(0.5, cfg.spawnIntervalSec);
    }
}
