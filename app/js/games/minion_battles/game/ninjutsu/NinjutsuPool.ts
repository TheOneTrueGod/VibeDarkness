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
    /** Only present when config.rechargeInterval < 1 (mid-round recharge). */
    nextRechargeAt?: number;
}

export function effectiveNinjutsuMaxPool(config: NinjutsuPoolConfig, enemyUnitCount: number): number {
    const perUnit = config.ninjutsuPerUnit ?? 0;
    return config.maxPool + perUnit * enemyUnitCount;
}

export class NinjutsuPool {
    readonly type: string;
    readonly config: NinjutsuPoolConfig;
    current: number;
    nextGrantAllowedAt = 0;
    nextRechargeAt: number;
    private pendingRequests: NinjutsuRequest[] = [];

    constructor(type: string, config: NinjutsuPoolConfig, enemyUnitCount = 0) {
        this.type = type;
        this.config = config;
        this.current = effectiveNinjutsuMaxPool(config, enemyUnitCount);
        // For sub-round recharges: schedule first refill after one interval.
        this.nextRechargeAt = config.rechargeInterval < 1 ? config.rechargeInterval * ROUND_DURATION : 0;
    }

    onRoundStart(roundNumber: number, enemyUnitCount: number): void {
        // Sub-round recharges (rechargeInterval < 1) are handled via interpolation in
        // resolveRequests — skip here to avoid double-refill.
        if (this.config.rechargeInterval < 1) return;
        // rechargeInterval > 1 is supported but intentionally unused by current tier presets.
        // It allows missions to configure longer droughts between attack flurries.
        if ((roundNumber - 1) % this.config.rechargeInterval === 0) {
            this.current = effectiveNinjutsuMaxPool(this.config, enemyUnitCount);
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
        enemyUnitCount: number,
    ): void {
        // Mid-round interpolated recharge: fires every rechargeInterval rounds regardless of
        // whether there are pending requests, so the pool is ready when units next attack.
        if (this.config.enabled && this.config.rechargeInterval < 1 && gameTime >= this.nextRechargeAt) {
            this.current = effectiveNinjutsuMaxPool(this.config, enemyUnitCount);
            this.nextRechargeAt = gameTime + this.config.rechargeInterval * ROUND_DURATION;
        }

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

    getUIState(enemyUnitCount: number): NinjutsuUIState {
        return {
            type: this.type,
            current: this.current,
            max: effectiveNinjutsuMaxPool(this.config, enemyUnitCount),
            enabled: this.config.enabled,
        };
    }

    toJSON(): SerializedNinjutsuPool {
        return {
            type: this.type,
            config: { ...this.config },
            current: this.current,
            nextGrantAllowedAt: this.nextGrantAllowedAt,
            ...(this.config.rechargeInterval < 1 ? { nextRechargeAt: this.nextRechargeAt } : {}),
        };
    }

    static fromJSON(data: SerializedNinjutsuPool): NinjutsuPool {
        const pool = new NinjutsuPool(data.type, data.config);
        pool.current = data.current;
        pool.nextGrantAllowedAt = data.nextGrantAllowedAt;
        if (data.nextRechargeAt !== undefined) pool.nextRechargeAt = data.nextRechargeAt;
        return pool;
    }
}
