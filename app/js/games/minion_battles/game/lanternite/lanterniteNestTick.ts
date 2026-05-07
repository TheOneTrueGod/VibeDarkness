/**
 * Lanternite nest — pacing spawns toward a patrol corridor; per-nest child id tracking.
 */

import type { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import type { Unit } from '../units/Unit';
import { createUnitFromSpawnConfig } from '../units/index';
import { LANTERNITE_CHARACTER_ID } from './lanternitePulse';

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

/**
 * Advances nest spawn timers once per simulation tick (host).
 */
export function processLanterniteNests(params: {
    gameTime: number;
    units: Unit[];
    eventBus: EventBus;
    addUnit: (unit: Unit) => void;
    idSource?: Pick<EngineContext, 'allocateObjectId'> | EngineContext;
}): void {
    for (const nest of params.units) {
        if (!nest.isAlive() || nest.characterId !== 'lanternite_nest') continue;

        const cfg = nest.lanterniteNestConfig;
        const state = nest.lanterniteNestSpawnState;
        if (!cfg || !state) continue;

        pruneSpawnedLanternIds(nest, params.units);

        const aliveKids = nest.lanterniteNestSpawnState!.spawnedIds.length;
        if (aliveKids >= cfg.maxLanternites) continue;
        if (params.gameTime < state.nextSpawnAtGameTime) continue;

        const far = resolvePatrolFarWorld(nest, params.units);
        if (!far) continue;

        const j = nest.lanterniteNestSpawnState!.spawnedIds.length === 0 ? 0 : 16;
        const lan = createUnitFromSpawnConfig(
            {
                x: nest.x + j,
                y: nest.y,
                teamId: 'allied',
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
        lan.lanternPatrolFarWorld = { ...far };
        lan.lanternPatrolLeg = 'toFar';

        params.addUnit(lan);

        nest.lanterniteNestSpawnState!.spawnedIds.push(lan.id);
        nest.lanterniteNestSpawnState!.nextSpawnAtGameTime =
            params.gameTime + Math.max(0.5, cfg.spawnIntervalSec);
    }
}
