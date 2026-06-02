/**
 * Lanternite nest — pacing spawns toward a patrol corridor or networked nest expansion;
 * per-nest child id tracking; construction completion for scout-built nests.
 */

import type { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import type { Unit } from '../units/Unit';
import type { MapSegmentPOI } from '../../terrain/segmentSchema';
import type { LanterniteNestMissionConfig } from '../../storylines/types';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { createUnitFromSpawnConfig } from '../units/index';
import {
    LANTERNITE_CHARACTER_ID,
    LANTERNITE_NEST_CHARACTER_ID,
    prepareLanterniteNestForMissionStart,
    upsertNestLightSource,
} from './lanternitePulse';
import type { LightSource } from '../lightSources/LightSource';
import { findUnoccupiedConnectedNestPoi, countAliveChildrenByRole } from './lanterniteNetworkUtils';
import { UnitTag } from '../units/unitTag';
import { IntervalEmitter, type EffectEmitter } from '../effects/EffectEmitter';
import { Effect } from '../effects/Effect';

/**
 * Golden angle in radians (~137.5°). Used to distribute scout stand angles so each
 * scout in a nest occupies a distinct direction around the build site.
 */
const GOLDEN_ANGLE = 2.399963229728653;

/** Default construction duration if not specified in nest config. */
const DEFAULT_CONSTRUCTION_SEC = 10;

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
/** Extra px beyond the nest's own radius that lanternites may spawn within. */
const NEST_SPAWN_EXTRA_RADIUS = 70;

export function processLanterniteNests(params: {
    gameTime: number;
    units: Unit[];
    eventBus: EventBus;
    addUnit: (unit: Unit, spawnSource?: import('../types').SpawnSource) => void;
    idSource?: Pick<EngineContext, 'allocateObjectId'> | EngineContext;
    mapPOIs?: readonly MapSegmentPOI[];
    terrainGrid?: TerrainGridLike | null;
    lightLevelEnabled?: boolean;
    addLightSource?: (ls: LightSource) => void;
    lightSources?: LightSource[];
    addEffectEmitter?: (emitter: EffectEmitter) => void;
    /** Seeded RNG — must be passed from the engine so spawn positions are deterministic across clients. */
    generateRandomNumber?: () => number;
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

        // Skip if another scout already built a nest at this POI
        if (unit.lanterniteTargetNestPoiId != null) {
            const alreadyOccupied = params.units.some(
                (u) =>
                    u.characterId === LANTERNITE_NEST_CHARACTER_ID &&
                    u.isAlive() &&
                    u.lanterniteHomeNestPoiId === unit.lanterniteTargetNestPoiId,
            );
            if (alreadyOccupied) {
                unit.hp = 0;
                unit.active = false;
                params.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
                continue;
            }
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
        const nestPos = unit.lanternPatrolFarWorld ?? { x: unit.x, y: unit.y };
        const newNestCfg: LanterniteNestMissionConfig = {
            maxLanternites: parentCfg?.maxLanternites ?? 3,
            spawnIntervalSec: parentCfg?.spawnIntervalSec ?? 14,
            patrolDestination: { kind: 'world', x: nestPos.x, y: nestPos.y },
            networked: true,
            nestPoiId: unit.lanterniteTargetNestPoiId ?? undefined,
            scoutConstructionSec: parentCfg?.scoutConstructionSec ?? 10,
        };

        const newNest = createUnitFromSpawnConfig(
            {
                x: nestPos.x,
                y: nestPos.y,
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
        if (unit.isInvincible()) newNest.tags = [UnitTag.Invincible];
        prepareLanterniteNestForMissionStart(newNest, params.gameTime);
        params.addUnit(newNest);

        if (params.lightLevelEnabled && params.addLightSource && params.lightSources) {
            upsertNestLightSource({ nest: newNest, addLightSource: params.addLightSource, lightSources: params.lightSources });
        }

        // Claim the scout as owned by the new nest before killing it so the global
        // respawn manager (which only respawns ownerless lanternites) does not queue
        // a replacement. Pre-spawned scouts start with no owner.
        unit.lanterniteNestOwnerUnitId = newNest.id;
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

        // Spawn at a random position in a ring around the nest using the seeded RNG.
        const rng = params.generateRandomNumber ?? (() => Math.floor(Math.random() * 0x7fffffff));
        const INT31 = 0x7fffffff;
        const spawnAngle = (rng() / INT31) * Math.PI * 2;
        const spawnDist = nest.radius + (rng() / INT31) * NEST_SPAWN_EXTRA_RADIUS;
        const lan = createUnitFromSpawnConfig(
            {
                x: nest.x + Math.cos(spawnAngle) * spawnDist,
                y: nest.y + Math.sin(spawnAngle) * spawnDist,
                teamId: 'allied' as const,
                ownerId: 'ai',
                characterId: LANTERNITE_CHARACTER_ID,
                name: 'Lanternite',
                abilities: ['0010'],
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

            // Assign a unique stand angle using the golden angle so each scout
            // in a nest stands at a distinct direction around the build site.
            lan.lanterniteConstructionAngle =
                (state.spawnedIds.length * GOLDEN_ANGLE) % (Math.PI * 2);

            if (role === 'scout' && targetPoi) {
                const worldPos = params.terrainGrid
                    ? params.terrainGrid.gridToWorld(targetPoi.col, targetPoi.row)
                    : { x: targetPoi.col * CELL_SIZE + CELL_SIZE / 2, y: targetPoi.row * CELL_SIZE + CELL_SIZE / 2 };
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

        if (nest.isInvincible()) lan.tags = [UnitTag.Invincible];
        params.addUnit(lan, 'nestSpawn');

        nest.lanterniteNestSpawnState!.spawnedIds.push(lan.id);
        nest.lanterniteNestSpawnState!.nextSpawnAtGameTime =
            params.gameTime + Math.max(0.5, cfg.spawnIntervalSec);
    }

    // --- Construction particle emitters: start once when a scout begins building ---
    if (params.addEffectEmitter) {
        for (const unit of params.units) {
            if (!unit.isAlive()) continue;
            if (unit.lanterniteRole !== 'scout') continue;
            if (unit.lanterniteConstructionCompleteAtGameTime == null) continue;
            if (unit.lanterniteConstructionEmitterStarted) continue;

            unit.lanterniteConstructionEmitterStarted = true;
            const targetPos = unit.lanternPatrolFarWorld;
            if (!targetPos) continue;

            const targetX = targetPos.x;
            const targetY = targetPos.y;
            const unitId = unit.id;
            const remaining = Math.max(0, unit.lanterniteConstructionCompleteAtGameTime - params.gameTime);

            // Emit ~2-3 green arc particles per second for the remaining construction duration.
            const emitter = new IntervalEmitter({
                x: unit.x,
                y: unit.y,
                attachedToUnitId: unitId,
                lifetime: remaining + 0.5, // slight buffer so last particles finish
                intervalSeconds: 0.38,
                fireImmediately: true,
                factory: (em, engine) => {
                    const sourceUnit = engine.getUnit(unitId);
                    if (!sourceUnit?.isAlive()) {
                        em.active = false;
                        return [];
                    }
                    const sx = sourceUnit.x;
                    const sy = sourceUnit.y;
                    const dx = targetX - sx;
                    const dy = targetY - sy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 4) return [];

                    // Quadratic bezier control point: perpendicular offset for a gentle arc
                    const arcMag = Math.min(dist * 0.3, 40);
                    const controlX = (sx + targetX) / 2 + (-dy / dist) * arcMag;
                    const controlY = (sy + targetY) / 2 + (dx / dist) * arcMag;

                    // Travel speed ~150 px/s
                    const travelDuration = Math.max(0.3, dist / 150);

                    return [
                        new Effect({
                            x: sx,
                            y: sy,
                            duration: travelDuration,
                            effectType: 'LanterniteConstParticle',
                            effectData: {
                                startX: sx,
                                startY: sy,
                                controlX,
                                controlY,
                                endX: targetX,
                                endY: targetY,
                            },
                        }),
                    ];
                },
            });
            params.addEffectEmitter(emitter);
        }
    }
}
