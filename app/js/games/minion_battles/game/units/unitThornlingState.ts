import type { ThornlingNestMissionConfig } from '../../storylines/types';
import type { Unit } from './Unit';

export interface UnitThornlingState {
    /** Runtime config for `thornling_nest`. */
    nestConfig: ThornlingNestMissionConfig | null;
    /** Spawn pacing + bookkeeping for thornlings created by this nest. */
    nestSpawnState: { spawnedIds: string[]; nextSpawnAtGameTime: number } | null;
}

export function createThornlingState(): UnitThornlingState {
    return {
        nestConfig: null,
        nestSpawnState: null,
    };
}

export function thornlingStateToJSON(unit: Unit): Record<string, unknown> {
    return {
        ...(unit.thornlingState.nestConfig != null
            ? {
                  thornlingNestConfig: JSON.parse(JSON.stringify(unit.thornlingState.nestConfig)) as ThornlingNestMissionConfig,
              }
            : {}),
        ...(unit.thornlingState.nestSpawnState != null
            ? {
                  thornlingNestSpawnState: {
                      spawnedIds: [...unit.thornlingState.nestSpawnState.spawnedIds],
                      nextSpawnAtGameTime: unit.thornlingState.nestSpawnState.nextSpawnAtGameTime,
                  },
              }
            : {}),
    };
}

export function applyThornlingStateFromJSON(unit: Unit, data: Record<string, unknown>): void {
    if (data.thornlingNestConfig != null) {
        unit.thornlingState.nestConfig = data.thornlingNestConfig as ThornlingNestMissionConfig;
    }
    if (data.thornlingNestSpawnState != null) {
        const s = data.thornlingNestSpawnState as { spawnedIds?: unknown; nextSpawnAtGameTime?: number };
        const ids = Array.isArray(s.spawnedIds)
            ? (s.spawnedIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : [];
        if (typeof s.nextSpawnAtGameTime === 'number') {
            unit.thornlingState.nestSpawnState = { spawnedIds: ids, nextSpawnAtGameTime: s.nextSpawnAtGameTime };
        }
    }
}
