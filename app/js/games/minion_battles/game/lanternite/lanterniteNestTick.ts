/**
 * Lanternite nest — pacing spawns toward a patrol corridor or networked nest expansion;
 * per-nest child id tracking; construction completion for scout-built nests.
 */

import type { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import type { Unit } from '../units/Unit';
import type { MapSegmentPOI } from '../../terrain/segmentSchema';
import type { LanterniteNestMissionConfig } from '../../storylines/types';
import type { MapNetworkManager } from '../managers/mapNetwork/MapNetworkManager';
import type { NetworkNode } from '../managers/mapNetwork/types';
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
import { spawnUnit } from '../units/spawning/spawnUnit';
import type { SpawnAiHookup } from '../units/spawning/spawnDefinition';
import type { LanterniteNetworkAITreeContext } from '../units/unitAI/lanterniteNetwork/context';
import {
    isLanterniteCreature,
    isLanterniteNest,
    lanterniteStateOf,
    peekLanterniteState,
} from '../units/components/lanterniteComponent';
import {
    buildNestSpawnContext,
    poolSharedConstruction,
    tickSpawner,
    type SpawnerEnv,
    type SpawnerSpec,
} from '../units/components/spawnerCore';

/**
 * Golden angle in radians (~137.5°). Used to distribute scout stand angles so each
 * scout in a nest occupies a distinct direction around the build site.
 */
const GOLDEN_ANGLE = 2.399963229728653;

const ROUND_DURATION_SEC = 8;

/** Read-only query surface `processLanterniteNests` needs — mirrors `AIContext.mapNetwork`'s `Pick<...>` restriction (query only, no `tick`/`loadFromSegments`). */
type MapNetworkQuery = Pick<MapNetworkManager, 'getNeighborIds' | 'getNode'>;

function resolvePatrolFarWorld(nest: Unit, units: readonly Unit[]): { x: number; y: number } | null {
    const cfg = lanterniteStateOf(nest).nestConfig;
    if (!cfg) return null;
    const dest = cfg.patrolDestination;
    if (dest.kind === 'world') return { x: dest.x, y: dest.y };
    const other = units.find((u) => u.id === dest.unitId && u.isAlive());
    return other ? { x: other.x, y: other.y } : null;
}

/** Extra px beyond the nest's own radius that lanternites may spawn within. */
const NEST_SPAWN_EXTRA_RADIUS = 70;

/**
 * The lanternite nest as a spawner (see `units/components/spawnerCore.ts`). The shared core owns pacing, cap, burst and
 * placement; this spec supplies the child's static shape plus the two lanternite-specific decisions:
 * - legacy patrol nests wait (without rescheduling) until their patrol destination resolves,
 * - networked nests assign each child a role (scout toward an unclaimed neighbor POI, or defender), a unique golden-angle
 *   stand angle and a staggered attack offset; legacy children just patrol to the far point.
 */
export const LANTERNITE_SPAWNER: SpawnerSpec<LanterniteNestMissionConfig> = {
    child: {
        characterId: LANTERNITE_CHARACTER_ID,
        name: 'Lanternite',
        abilities: ['0010'],
        team: 'nature',
        aiSettings: { minRange: 0, maxRange: 600 },
        spawnRadiusExtraPx: NEST_SPAWN_EXTRA_RADIUS,
        inheritInvulnerability: true,
        spawnSource: 'nestSpawn',
    },
    maxChildren: (cfg) => cfg.maxLanternites,
    intervalSec: (cfg) => cfg.spawnIntervalSec,
    burstCount: (cfg) => cfg.spawnCount ?? 1,
    canSpawn(nest, env) {
        // Legacy (non-networked) mode: resolve the patrol destination once before the burst loop. If unavailable, skip
        // this tick entirely (retry next tick).
        const cfg = lanterniteStateOf(nest).nestConfig;
        return Boolean(cfg?.networked) || resolvePatrolFarWorld(nest, env.units) != null;
    },
    describeChild(nest, aliveKids, env) {
        const nestState = lanterniteStateOf(nest);
        const cfg = nestState.nestConfig!;
        const spawnedIds = nestState.nestSpawnState!.spawnedIds;

        if (!cfg.networked) {
            // Legacy patrol behavior
            const far = resolvePatrolFarWorld(nest, env.units);
            if (!far) return null;
            return {
                unitAITreeId: 'lanternitePatrol',
                aiHookup: {
                    kind: 'lanternite',
                    patrolFarWorld: { ...far },
                    patrolLeg: 'toFar',
                    nestOwnerUnitId: nest.id,
                },
            };
        }

        // Network mode: assign roles, resolve scout target, stagger attack offset.
        // Favor spawning a scout whenever scouts haven't caught up to defenders (so a
        // scout that died en route gets promptly retried) or once the defender quota is
        // met; otherwise spawn a defender.
        const defenderCount = countAliveChildrenByRole(spawnedIds, env.units, 'defender');
        const scoutCount = countAliveChildrenByRole(spawnedIds, env.units, 'scout');
        const targetDefenders = Math.floor(cfg.maxLanternites / 2);
        const nestPoiId = nestState.homeNestPoiId ?? cfg.nestPoiId;

        let role: 'scout' | 'defender' = 'defender';
        let targetNode: NetworkNode | null = null;

        if (scoutCount <= defenderCount || defenderCount >= targetDefenders) {
            if (nestPoiId && env.mapNetwork) {
                targetNode = findUnoccupiedConnectedNestPoi(nestPoiId, env.mapNetwork, env.units);
            }
            role = targetNode ? 'scout' : 'defender';
        }

        // Assign a unique stand angle using the golden angle so each scout
        // in a nest stands at a distinct direction around the build site.
        const constructionAngle = (aliveKids * GOLDEN_ANGLE) % (Math.PI * 2);

        let patrolFarWorld: { x: number; y: number } | undefined;
        let targetNestPoiId: string | undefined;
        let nestConfig: LanterniteNestMissionConfig | undefined;
        if (role === 'scout' && targetNode) {
            // The manager already stores mission-global px — no `terrainGrid.gridToWorld`
            // conversion needed (unlike the old POI-tag path).
            patrolFarWorld = { x: targetNode.x, y: targetNode.y };
            targetNestPoiId = targetNode.id;
            nestConfig = cfg;
        }

        const numPhases = Math.max(1, cfg.maxLanternites);
        const phaseOffsetSec = (aliveKids % numPhases) * (ROUND_DURATION_SEC / numPhases);
        const attackReadyAtGameTime = env.gameTime + phaseOffsetSec;

        const aiHookup: SpawnAiHookup = {
            kind: 'lanternite',
            role,
            patrolFarWorld,
            targetNestPoiId,
            nestConfig,
            constructionAngle,
            attackReadyAtGameTime,
            nestOwnerUnitId: nest.id,
        };
        return { unitAITreeId: 'lanterniteNetwork', aiHookup };
    },
};

/**
 * Advances nest spawn timers once per simulation tick (host).
 * Also handles scout construction completion — spawns a new nest and removes the scout.
 */

export function processLanterniteNests(params: {
    gameTime: number;
    /** Seconds elapsed this simulation tick — drives shared-construction acceleration below. */
    dt: number;
    units: Unit[];
    eventBus: EventBus;
    addUnit: (unit: Unit, spawnSource?: import('../types').SpawnSource) => void;
    idSource?: Pick<EngineContext, 'allocateObjectId'> | EngineContext;
    mapPOIs?: readonly MapSegmentPOI[];
    /** Read-only map-network query surface — resolves scout targets via the node graph instead of `connects:` POI tags. Optional, matching `mapPOIs`'s convention. */
    mapNetwork?: MapNetworkQuery;
    lightLevelEnabled?: boolean;
    addLightSource?: (ls: LightSource) => void;
    lightSources?: LightSource[];
    addEffectEmitter?: (emitter: EffectEmitter) => void;
    /** Seeded RNG source — must be passed from the engine so spawn positions are deterministic across clients. */
    generateRandomInteger: (min: number, max: number) => number;
}): void {
    const spawnCtx = buildNestSpawnContext(params);

    // --- Shared construction: scouts building at the same POI pool their effort, so N scouts
    // at one site finish N times faster than a lone scout. Each additional scout beyond the
    // first pulls the group's (already-synced, see lnet_scout_travel.ts's join logic) shared
    // completion time closer by one extra `dt` this tick.
    poolSharedConstruction({
        units: params.units,
        gameTime: params.gameTime,
        dt: params.dt,
        siteOf: (u) => peekLanterniteState(u)?.targetNestPoiId,
        completeAtOf: (u) => peekLanterniteState(u)?.constructionCompleteAtGameTime,
        setCompleteAt: (u, t) => {
            lanterniteStateOf(u).constructionCompleteAtGameTime = t;
        },
    });

    // --- Construction completion: scouts that have finished building ---
    for (const unit of params.units) {
        const scoutState = peekLanterniteState(unit);
        if (
            !unit.isAlive() ||
            scoutState?.constructionCompleteAtGameTime == null ||
            params.gameTime < scoutState.constructionCompleteAtGameTime
        ) {
            continue;
        }

        // Skip if another scout already built a nest at this POI. Deliberately left as an explicit
        // `homeNestPoiId === targetNestPoiId` check rather than migrated to
        // `mapNetwork.getOwnerCharacterId` — that generic query answers "who currently occupies
        // this node by position," while this check needs the narrower "is there a live
        // `lanternite_nest` whose *home* is this exact POI id" fact; replicating that exactly
        // through the generic method would need extra plumbing, not worth the churn here.
        if (lanterniteStateOf(unit).targetNestPoiId != null) {
            const alreadyOccupied = params.units.some(
                (u) =>
                    isLanterniteNest(u) &&
                    u.isAlive() &&
                    lanterniteStateOf(u).homeNestPoiId === lanterniteStateOf(unit).targetNestPoiId,
            );
            if (alreadyOccupied) {
                unit.hp = 0;
                unit.active = false;
                params.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
                continue;
            }
        }

        const parentNestId = lanterniteStateOf(unit).nestOwnerUnitId;
        const parentNest = parentNestId
            ? params.units.find((u) => u.id === parentNestId)
            : null;

        // Remove scout from parent's spawn tracking
        const parentNestState = parentNest ? lanterniteStateOf(parentNest) : null;
        if (parentNestState?.nestSpawnState) {
            parentNestState.nestSpawnState.spawnedIds = parentNestState.nestSpawnState.spawnedIds.filter(
                (id) => id !== unit.id,
            );
        }

        const parentCfg = parentNestState?.nestConfig;
        const nestPos = lanterniteStateOf(unit).patrolFarWorld ?? { x: unit.x, y: unit.y };
        const newNestCfg: LanterniteNestMissionConfig = {
            maxLanternites: parentCfg?.maxLanternites ?? 3,
            spawnIntervalSec: parentCfg?.spawnIntervalSec ?? 14,
            ...(parentCfg?.spawnCount != null ? { spawnCount: parentCfg.spawnCount } : {}),
            patrolDestination: { kind: 'world', x: nestPos.x, y: nestPos.y },
            networked: true,
            nestPoiId: lanterniteStateOf(unit).targetNestPoiId ?? undefined,
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
                homeNestPoiId: lanterniteStateOf(unit).targetNestPoiId ?? undefined,
            },
        });
        prepareLanterniteNestForMissionStart(newNest, params.gameTime);

        if (params.lightLevelEnabled && params.addLightSource && params.lightSources) {
            upsertNestLightSource({ nest: newNest, addLightSource: params.addLightSource, lightSources: params.lightSources });
        }

        // Claim the scout as owned by the new nest before killing it so the global
        // respawn manager (which only respawns ownerless lanternites) does not queue
        // a replacement. Pre-spawned scouts start with no owner.
        lanterniteStateOf(unit).nestOwnerUnitId = newNest.id;
        unit.hp = 0;
        unit.active = false;
        params.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
    }

    // --- Nest spawning (pacing, cap, burst and placement are the shared spawner core; see LANTERNITE_SPAWNER) ---
    const spawnerEnv: SpawnerEnv = { units: params.units, gameTime: params.gameTime, mapNetwork: params.mapNetwork };
    for (const nest of params.units) {
        if (!nest.isAlive() || !isLanterniteNest(nest)) continue;
        const nestState = lanterniteStateOf(nest);
        tickSpawner({
            spawner: nest,
            cfg: nestState.nestConfig,
            state: nestState.nestSpawnState,
            spec: LANTERNITE_SPAWNER,
            spawnCtx,
            env: spawnerEnv,
        });
    }

    // --- Defender promotion: a networked nest with an unclaimed neighbor and no spare spawn
    // capacity would otherwise never send a scout (spawns only resolve a role at spawn time, and a
    // full nest doesn't spawn). E.g. quest_thorn_march: nest_49_52 fills with defenders while a
    // swarm_nest's site is unreachable, then sits idle once it's freed. Promote one of its
    // defenders per tick instead. `findUnoccupiedConnectedNestPoi` excludes nodes any living unit
    // already targets, so this never doubles up with a freshly spawned or traveling scout.
    if (params.mapNetwork) {
        for (const nest of params.units) {
            if (!nest.isAlive() || !isLanterniteNest(nest)) continue;
            const cfg = lanterniteStateOf(nest).nestConfig;
            if (!cfg?.networked) continue;
            const nestPoiId = lanterniteStateOf(nest).homeNestPoiId ?? cfg.nestPoiId;
            if (!nestPoiId) continue;

            const defenders = params.units.filter(
                (u) =>
                    u.isAlive() &&
                    isLanterniteCreature(u) &&
                    lanterniteStateOf(u).nestOwnerUnitId === nest.id &&
                    lanterniteStateOf(u).role === 'defender',
            );
            if (defenders.length === 0) continue;

            const targetNode = findUnoccupiedConnectedNestPoi(nestPoiId, params.mapNetwork, params.units);
            if (!targetNode) continue;

            // Prefer a defender that isn't mid-chase so the nest's active fight isn't abandoned.
            const promoted =
                defenders.find(
                    (u) => (u.aiContext as Partial<LanterniteNetworkAITreeContext>).aiState !== 'lnet_chase',
                ) ?? defenders[0];
            lanterniteStateOf(promoted).role = 'scout';
            lanterniteStateOf(promoted).targetNestPoiId = targetNode.id;
            lanterniteStateOf(promoted).patrolFarWorld = { x: targetNode.x, y: targetNode.y };
            lanterniteStateOf(promoted).nestConfig = cfg;
        }
    }

    // --- Construction particle emitters: start once when a scout begins building ---
    if (params.addEffectEmitter) {
        for (const unit of params.units) {
            if (!unit.isAlive()) continue;
            const emitterState = peekLanterniteState(unit);
            if (emitterState?.role !== 'scout') continue;
            if (emitterState.constructionCompleteAtGameTime == null) continue;
            if (emitterState.constructionEmitterStarted) continue;

            emitterState.constructionEmitterStarted = true;
            const targetPos = emitterState.patrolFarWorld;
            if (!targetPos) continue;

            const targetX = targetPos.x;
            const targetY = targetPos.y;
            const unitId = unit.id;
            const remaining = Math.max(0, emitterState.constructionCompleteAtGameTime - params.gameTime);

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
