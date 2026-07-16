/**
 * Thornling nest — periodically spawns thornlings near the nest.
 * Simple analogue to processLanterniteNests; no patrol, no network, no light sources.
 */

import type { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import type { Unit } from '../units/Unit';
import { spawnUnit, type SpawnUnitContext } from '../units/spawning/spawnUnit';

export const THORNLING_NEST_CHARACTER_ID = 'thornling_nest';
export const THORNLING_CHARACTER_ID = 'thornling';

const NEST_SPAWN_EXTRA_RADIUS = 60;

function pruneSpawnedThornlingIds(nest: Unit, units: readonly Unit[]): void {
    const state = nest.thornlingState.nestSpawnState;
    if (!state) return;
    state.spawnedIds = state.spawnedIds.filter((id) => {
        const u = units.find((x) => x.id === id);
        return u != null && u.isAlive();
    });
}

export function initializeThornlingNestSpawnState(nest: Unit, gameTime: number): void {
    const cfg = nest.thornlingState.nestConfig;
    if (!cfg) return;
    nest.thornlingState.nestSpawnState = {
        spawnedIds: [],
        nextSpawnAtGameTime: gameTime + Math.max(0.5, cfg.spawnIntervalSec),
    };
}

export function processThornlingNests(params: {
    gameTime: number;
    units: Unit[];
    eventBus: EventBus;
    addUnit: (unit: Unit) => void;
    idSource?: Pick<EngineContext, 'allocateObjectId'>;
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
        mapPOIs: [],
        getLightAt: () => null,
        getZoneById: () => undefined,
        generateRandomInteger: params.generateRandomInteger,
        allocateObjectId: params.idSource?.allocateObjectId?.bind(params.idSource),
    };

    for (const nest of params.units) {
        if (!nest.isAlive() || nest.characterId !== THORNLING_NEST_CHARACTER_ID) continue;

        const cfg = nest.thornlingState.nestConfig;
        const state = nest.thornlingState.nestSpawnState;
        if (!cfg || !state) continue;

        pruneSpawnedThornlingIds(nest, params.units);

        if (state.spawnedIds.length >= cfg.maxThornlings) continue;
        if (params.gameTime < state.nextSpawnAtGameTime) continue;

        const burstCount = cfg.spawnCount ?? 1;
        const spawnCharacterId = cfg.spawnCharacterId ?? THORNLING_CHARACTER_ID;
        const spawnAbilities = cfg.spawnAbilities ?? ['0002'];
        const spawnAITreeId = cfg.spawnAITreeId ?? 'hunt';

        for (let burst = 0; burst < burstCount; burst++) {
            if (state.spawnedIds.length >= cfg.maxThornlings) break;

            const [child] = spawnUnit(spawnCtx, {
                characterId: spawnCharacterId,
                name: spawnCharacterId.charAt(0).toUpperCase() + spawnCharacterId.slice(1).replace(/_/g, ' '),
                abilities: spawnAbilities,
                teamId: nest.teamId,
                unitAITreeId: spawnAITreeId,
                aiSettings: { minRange: 0, maxRange: 80 },
                placement: {
                    kind: 'relativeToUnit',
                    anchorUnitId: nest.id,
                    maxRadiusPx: nest.radius + NEST_SPAWN_EXTRA_RADIUS,
                },
            });
            state.spawnedIds.push(child.id);
        }

        state.nextSpawnAtGameTime = params.gameTime + Math.max(0.5, cfg.spawnIntervalSec);
    }
}
