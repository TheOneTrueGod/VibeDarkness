import type { AbilityStatic } from '../../abilities/Ability';
import type { BattleOrder, ResolvedTarget } from '../types';
import type { Unit } from '../units/Unit';
import { NinjutsuPool } from './NinjutsuPool';
import type { NinjutsuUIState } from './NinjutsuPool';
import type { NinjutsuPoolConfig } from './ninjutsuConfig';

export type { NinjutsuUIState };

export class NinjutsuManager {
    private pools = new Map<string, NinjutsuPool>();

    constructor(poolConfigs: Partial<Record<string, NinjutsuPoolConfig>>) {
        for (const [type, config] of Object.entries(poolConfigs)) {
            if (config) this.pools.set(type, new NinjutsuPool(type, config));
        }
    }

    getPool(type: string): NinjutsuPool | undefined {
        return this.pools.get(type);
    }

    onRoundStart(roundNumber: number): void {
        for (const pool of this.pools.values()) pool.onRoundStart(roundNumber);
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
    ): void {
        for (const pool of this.pools.values()) {
            pool.resolveRequests(gameTime, queueOrder, random);
        }
    }

    getUIState(): NinjutsuUIState[] {
        return [...this.pools.values()].map((p) => p.getUIState());
    }
}
