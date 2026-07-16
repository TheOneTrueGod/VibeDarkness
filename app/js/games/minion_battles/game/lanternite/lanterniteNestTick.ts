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
import { spawnUnit, type SpawnUnitContext } from '../units/spawning/spawnUnit';
import type { SpawnAiHookup } from '../units/spawning/spawnDefinition';

/**
 * Golden angle in radians (~137.5°). Used to distribute scout stand angles so each
 * scout in a nest occupies a distinct direction around the build site.
 */
const GOLDEN_ANGLE = 2.399963229728653;

const ROUND_DURATION_SEC = 8;

function pruneSpawnedLanternIds(nest: Unit, units: readonly Unit[]): void {
    const state = nest.lanterniteState.nestSpawnState;
    if (!state) return;
    state.spawnedIds = state.spawnedIds.filter((id) => {
        const u = units.find((x) => x.id === id);
        return u != null && u.isAlive();
    });
}

function resolvePatrolFarWorld(nest: Unit, units: readonly Unit[]): { x: number; y: number } | null {
    const cfg = nest.lanterniteState.nestConfig;
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
    /** Seeded RNG source — must be passed from the engine so spawn positions are deterministic across clients. */
    generateRandomInteger: (min: number, max: number) => number;
}): void {
    const spawnCtx: SpawnUnitContext = {
        units: params.units,
        eventBus: params.eventBus,
        addUnit: params.addUnit,
        terrainManager: null,
        lightLevelEnabled: false,
        aiControllerId: null,
        mapPOIs: params.mapPOIs ?? [],
        getLightAt: () => null,
        getZoneById: () => undefined,
        generateRandomInteger: params.generateRandomInteger,
        allocateObjectId: params.idSource?.allocateObjectId?.bind(params.idSource),
    };

    // --- Construction completion: scouts that have finished building ---
    for (const unit of params.units) {
        if (
            !unit.isAlive() ||
            unit.lanterniteState.constructionCompleteAtGameTime == null ||
            params.gameTime < unit.lanterniteState.constructionCompleteAtGameTime
        ) {
            continue;
        }

        // Skip if another scout already built a nest at this POI
        if (unit.lanterniteState.targetNestPoiId != null) {
            const alreadyOccupied = params.units.some(
                (u) =>
                    u.characterId === LANTERNITE_NEST_CHARACTER_ID &&
                    u.isAlive() &&
                    u.lanterniteState.homeNestPoiId === unit.lanterniteState.targetNestPoiId,
            );
            if (alreadyOccupied) {
                unit.hp = 0;
                unit.active = false;
                params.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
                continue;
            }
        }

        const parentNestId = unit.lanterniteState.nestOwnerUnitId;
        const parentNest = parentNestId
            ? params.units.find((u) => u.id === parentNestId)
            : null;

        // Remove scout from parent's spawn tracking
        if (parentNest?.lanterniteState.nestSpawnState) {
            parentNest.lanterniteState.nestSpawnState.spawnedIds =
                parentNest.lanterniteState.nestSpawnState.spawnedIds.filter((id) => id !== unit.id);
        }

        const parentCfg = parentNest?.lanterniteState.nestConfig;
        const nestPos = unit.lanterniteState.patrolFarWorld ?? { x: unit.x, y: unit.y };
        const newNestCfg: LanterniteNestMissionConfig = {
            maxLanternites: parentCfg?.maxLanternites ?? 3,
            spawnIntervalSec: parentCfg?.spawnIntervalSec ?? 14,
            ...(parentCfg?.spawnCount != null ? { spawnCount: parentCfg.spawnCount } : {}),
            patrolDestination: { kind: 'world', x: nestPos.x, y: nestPos.y },
            networked: true,
            nestPoiId: unit.lanterniteState.targetNestPoiId ?? undefined,
            scoutConstructionSec: parentCfg?.scoutConstructionSec ?? 10,
        };

        const [newNest] = spawnUnit(spawnCtx, {
            characterId: LANTERNITE_NEST_CHARACTER_ID,
            name: 'Lanternite Nest',
            abilities: ['0014'],
            teamId: 'nature',
            unitAITreeId: 'lanterniteNestIdle',
            aiSettings: { minRange: 0, maxRange: 0 },
            placement: { kind: 'fixedWorld', x: nestPos.x, y: nestPos.y },
            unitTags: unit.tags.includes(UnitTag.Invincible) ? [UnitTag.Invincible] : undefined,
            invulnerabilityGenerations:
                unit.invulnerabilityGenerations != null ? Math.max(0, unit.invulnerabilityGenerations - 1) : undefined,
            aiHookup: {
                kind: 'lanterniteNest',
                nestConfig: newNestCfg,
                homeNestPoiId: unit.lanterniteState.targetNestPoiId ?? undefined,
            },
        });
        prepareLanterniteNestForMissionStart(newNest, params.gameTime);

        if (params.lightLevelEnabled && params.addLightSource && params.lightSources) {
            upsertNestLightSource({ nest: newNest, addLightSource: params.addLightSource, lightSources: params.lightSources });
        }

        // Claim the scout as owned by the new nest before killing it so the global
        // respawn manager (which only respawns ownerless lanternites) does not queue
        // a replacement. Pre-spawned scouts start with no owner.
        unit.lanterniteState.nestOwnerUnitId = newNest.id;
        unit.hp = 0;
        unit.active = false;
        params.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
    }

    // --- Nest spawning ---
    for (const nest of params.units) {
        if (!nest.isAlive() || nest.characterId !== LANTERNITE_NEST_CHARACTER_ID) continue;

        const cfg = nest.lanterniteState.nestConfig;
        const state = nest.lanterniteState.nestSpawnState;
        if (!cfg || !state) continue;

        pruneSpawnedLanternIds(nest, params.units);

        if (state.spawnedIds.length >= cfg.maxLanternites) continue;
        if (params.gameTime < state.nextSpawnAtGameTime) continue;

        // For legacy (non-networked) mode, resolve patrol destination once before the burst loop.
        // If unavailable, skip this tick entirely (matches original behaviour: retry next tick).
        if (!cfg.networked) {
            const far = resolvePatrolFarWorld(nest, params.units);
            if (!far) continue;
        }

        const burstCount = cfg.spawnCount ?? 1;

        for (let burst = 0; burst < burstCount; burst++) {
            // Re-check cap each iteration — previous burst may have filled the nest.
            if (state.spawnedIds.length >= cfg.maxLanternites) break;

            // aliveKids is the count before this unit is added.
            const aliveKids = state.spawnedIds.length;

            let unitAITreeId = 'lanternitePatrol';
            let aiHookup: SpawnAiHookup;

            if (cfg.networked) {
                // Network mode: assign roles, resolve scout target, stagger attack offset.
                // Favor spawning a scout whenever scouts haven't caught up to defenders (so a
                // scout that died en route gets promptly retried) or once the defender quota is
                // met; otherwise spawn a defender.
                const defenderCount = countAliveChildrenByRole(state.spawnedIds, params.units, 'defender');
                const scoutCount = countAliveChildrenByRole(state.spawnedIds, params.units, 'scout');
                const targetDefenders = Math.floor(cfg.maxLanternites / 2);
                const nestPoiId = nest.lanterniteState.homeNestPoiId ?? cfg.nestPoiId;

                let role: 'scout' | 'defender' = 'defender';
                let targetPoi: MapSegmentPOI | null = null;

                if (scoutCount <= defenderCount || defenderCount >= targetDefenders) {
                    if (nestPoiId && params.mapPOIs) {
                        targetPoi = findUnoccupiedConnectedNestPoi(nestPoiId, params.mapPOIs, params.units);
                    }
                    role = targetPoi ? 'scout' : 'defender';
                }

                unitAITreeId = 'lanterniteNetwork';

                // Assign a unique stand angle using the golden angle so each scout
                // in a nest stands at a distinct direction around the build site.
                const constructionAngle = (aliveKids * GOLDEN_ANGLE) % (Math.PI * 2);

                let patrolFarWorld: { x: number; y: number } | undefined;
                let targetNestPoiId: string | undefined;
                let nestConfig: LanterniteNestMissionConfig | undefined;
                if (role === 'scout' && targetPoi) {
                    const worldPos = params.terrainGrid
                        ? params.terrainGrid.gridToWorld(targetPoi.col, targetPoi.row)
                        : { x: targetPoi.col * CELL_SIZE + CELL_SIZE / 2, y: targetPoi.row * CELL_SIZE + CELL_SIZE / 2 };
                    patrolFarWorld = worldPos;
                    targetNestPoiId = targetPoi.id;
                    nestConfig = cfg;
                }

                const numPhases = Math.max(1, cfg.maxLanternites);
                const phaseOffsetSec = (aliveKids % numPhases) * (ROUND_DURATION_SEC / numPhases);
                const attackReadyAtGameTime = params.gameTime + phaseOffsetSec;

                aiHookup = {
                    kind: 'lanternite',
                    role,
                    patrolFarWorld,
                    targetNestPoiId,
                    nestConfig,
                    constructionAngle,
                    attackReadyAtGameTime,
                    nestOwnerUnitId: nest.id,
                };
            } else {
                // Legacy patrol behavior
                const far = resolvePatrolFarWorld(nest, params.units);
                if (!far) break;
                aiHookup = {
                    kind: 'lanternite',
                    patrolFarWorld: { ...far },
                    patrolLeg: 'toFar',
                    nestOwnerUnitId: nest.id,
                };
            }

            const [lan] = spawnUnit(
                spawnCtx,
                {
                    characterId: LANTERNITE_CHARACTER_ID,
                    name: 'Lanternite',
                    abilities: ['0010'],
                    teamId: 'nature',
                    unitAITreeId,
                    aiSettings: { minRange: 0, maxRange: 600 },
                    placement: {
                        kind: 'relativeToUnit',
                        anchorUnitId: nest.id,
                        maxRadiusPx: nest.radius + NEST_SPAWN_EXTRA_RADIUS,
                    },
                    unitTags: nest.tags.includes(UnitTag.Invincible) ? [UnitTag.Invincible] : undefined,
                    invulnerabilityGenerations:
                        nest.invulnerabilityGenerations != null
                            ? Math.max(0, nest.invulnerabilityGenerations - 1)
                            : undefined,
                    aiHookup,
                },
                'nestSpawn',
            );
            state.spawnedIds.push(lan.id);
        }

        state.nextSpawnAtGameTime = params.gameTime + Math.max(0.5, cfg.spawnIntervalSec);
    }

    // --- Construction particle emitters: start once when a scout begins building ---
    if (params.addEffectEmitter) {
        for (const unit of params.units) {
            if (!unit.isAlive()) continue;
            if (unit.lanterniteState.role !== 'scout') continue;
            if (unit.lanterniteState.constructionCompleteAtGameTime == null) continue;
            if (unit.lanterniteState.constructionEmitterStarted) continue;

            unit.lanterniteState.constructionEmitterStarted = true;
            const targetPos = unit.lanterniteState.patrolFarWorld;
            if (!targetPos) continue;

            const targetX = targetPos.x;
            const targetY = targetPos.y;
            const unitId = unit.id;
            const remaining = Math.max(0, unit.lanterniteState.constructionCompleteAtGameTime - params.gameTime);

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
