import type { AbilityStatic } from '../../abilities/Ability';
import type { BattleOrder, ResolvedTarget } from '../types';
import type { Unit } from '../units/Unit';
import { ROUND_DURATION } from '../gameConstants';
import type { NinjutsuPoolConfig } from './ninjutsuConfig';

interface NinjutsuRequest {
    unit: Unit;
    ability: AbilityStatic;
    resolvedTargets: ResolvedTarget[];
    movePath: { col: number; row: number }[] | undefined;
    gameTick: number;
    priority: number;
}

export interface NinjutsuUIState {
    type: string;
    current: number;
    max: number;
    enabled: boolean;
}

export interface SerializedNinjutsuPool {
    type: string;
    config: NinjutsuPoolConfig;
    current: number;
    nextGrantAllowedAt: number;
}

export class NinjutsuPool {
    readonly type: string;
    readonly config: NinjutsuPoolConfig;
    current: number;
    nextGrantAllowedAt = 0;
    private pendingRequests: NinjutsuRequest[] = [];

    constructor(type: string, config: NinjutsuPoolConfig) {
        this.type = type;
        this.config = config;
        this.current = config.maxPool;
    }

    onRoundStart(roundNumber: number): void {
        // rechargeInterval > 1 is supported but intentionally unused by current tier presets.
        // It allows missions to configure longer droughts between attack flurries.
        if ((roundNumber - 1) % this.config.rechargeInterval === 0) {
            this.current = this.config.maxPool;
        }
    }

    registerRequest(
        unit: Unit,
        ability: AbilityStatic,
        resolvedTargets: ResolvedTarget[],
        movePath: { col: number; row: number }[] | undefined,
        gameTick: number,
    ): void {
        if (this.pendingRequests.some((r) => r.unit.id === unit.id)) return;
        this.pendingRequests.push({
            unit,
            ability,
            resolvedTargets,
            movePath,
            gameTick,
            priority: ability.aiSettings?.priority ?? 0,
        });
    }

    resolveRequests(
        gameTime: number,
        queueOrder: (tick: number, order: BattleOrder) => void,
        random: (min: number, max: number) => number,
    ): void {
        if (!this.config.enabled || this.pendingRequests.length === 0) {
            this.pendingRequests = [];
            return;
        }

        const pool = [...this.pendingRequests];
        this.pendingRequests = [];

        while (pool.length > 0 && this.current > 0) {
            if (gameTime < this.nextGrantAllowedAt) break;

            const maxPriority = Math.max(...pool.map((r) => r.priority));
            const tied = pool.filter((r) => r.priority === maxPriority);
            const pickIdx = random(0, tied.length - 1);
            const pick = tied[pickIdx]!;
            pool.splice(pool.indexOf(pick), 1);

            const cost = pick.ability.aiSettings?.ninjutsu?.cost ?? 1;
            this.current -= cost;

            queueOrder(pick.gameTick, {
                unitId: pick.unit.id,
                abilityId: pick.ability.id,
                targets: pick.resolvedTargets,
                movePath: pick.movePath,
            });

            const delay =
                pick.ability.aiSettings?.ninjutsu?.overrideDelay ?? this.config.pauseBetweenUses;
            this.nextGrantAllowedAt = gameTime + delay * ROUND_DURATION;
        }
    }

    getUIState(): NinjutsuUIState {
        return {
            type: this.type,
            current: this.current,
            max: this.config.maxPool,
            enabled: this.config.enabled,
        };
    }

    toJSON(): SerializedNinjutsuPool {
        return {
            type: this.type,
            config: { ...this.config },
            current: this.current,
            nextGrantAllowedAt: this.nextGrantAllowedAt,
        };
    }

    static fromJSON(data: SerializedNinjutsuPool): NinjutsuPool {
        const pool = new NinjutsuPool(data.type, data.config);
        pool.current = data.current;
        pool.nextGrantAllowedAt = data.nextGrantAllowedAt;
        return pool;
    }
}
