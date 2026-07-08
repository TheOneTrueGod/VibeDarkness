import type { AbilityStatic } from '../../abilities/Ability';
import type { BattleOrder, ResolvedTarget } from '../types';
import type { Unit } from '../units/Unit';
import { NinjutsuPool } from './NinjutsuPool';
import type { NinjutsuUIState, SerializedNinjutsuPool } from './NinjutsuPool';
import type { NinjutsuPoolConfig } from './ninjutsuConfig';

export type { NinjutsuUIState, SerializedNinjutsuPool };

export function countNinjutsuEnemyUnits(units: readonly Unit[]): number {
    return units.filter((u) => u.active && u.isAlive() && !u.isPlayerControlled()).length;
}

export class NinjutsuManager {
    private pools = new Map<string, NinjutsuPool>();

    constructor(poolConfigs: Partial<Record<string, NinjutsuPoolConfig>>, enemyUnitCount = 0) {
        for (const [type, config] of Object.entries(poolConfigs)) {
            if (config) this.pools.set(type, new NinjutsuPool(type, config, enemyUnitCount));
        }
    }

    getPool(type: string): NinjutsuPool | undefined {
        return this.pools.get(type);
    }

    onRoundStart(roundNumber: number, enemyUnitCount: number): void {
        for (const pool of this.pools.values()) pool.onRoundStart(roundNumber, enemyUnitCount);
    }

    registerRequest(
        type: string,
        unit: Unit,
        ability: AbilityStatic,
        resolvedTargets: ResolvedTarget[],
        movePath: { col: number; row: number }[] | undefined,
        gameTick: number,
    ): void {
        this.pools.get(type)?.registerRequest(unit, ability, resolvedTargets, movePath, gameTick);
    }

    resolveRequests(
        gameTime: number,
        queueOrder: (tick: number, order: BattleOrder) => void,
        random: (min: number, max: number) => number,
        enemyUnitCount: number,
    ): void {
        for (const pool of this.pools.values()) {
            pool.resolveRequests(gameTime, queueOrder, random, enemyUnitCount);
        }
    }

    getUIState(enemyUnitCount: number): NinjutsuUIState[] {
        return [...this.pools.values()].map((p) => p.getUIState(enemyUnitCount));
    }

    toJSON(): SerializedNinjutsuPool[] {
        return [...this.pools.values()].map((p) => p.toJSON());
    }

    static fromJSON(data: SerializedNinjutsuPool[]): NinjutsuManager {
        const mgr = new NinjutsuManager({});
        for (const poolData of data) {
            mgr.pools.set(poolData.type, NinjutsuPool.fromJSON(poolData));
        }
        return mgr;
    }
}
