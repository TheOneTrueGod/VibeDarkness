import {
    AbilityState,
    type AbilityStatic,
    type AbilityStateEntry,
    type AttackBlockedInfo,
    type ResourceCost,
    type AbilityAISettings,
} from './Ability';
import {
    AbilityPhase,
    type AbilityTimingEntry,
    type AbilityTimingInterval,
    normalizeAbilityTimingsToIntervals,
} from './abilityTimings';
import type { Unit } from '../game/units/Unit';
import type { TargetDef } from './targeting';
import type { ActiveAbility, ResolvedTarget } from '../game/types';

export abstract class AbilityBase<TNote = never> implements AbilityStatic {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly image: string;
    abstract readonly prefireTime: number;
    abstract readonly targets: TargetDef[];

    abstract doCardEffect(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
        active?: ActiveAbility,
    ): void;

    abstract getTooltipText(gameState?: unknown): string[];

    readonly resourceCost: ResourceCost | null = null;
    readonly rechargeTurns: number = 0;
    readonly aiSettings?: AbilityAISettings;
    abstract readonly abilityTimings: AbilityTimingEntry[];

    // -- Typed note management ------------------------------------------------

    protected getAbilityNote(caster: Unit): TNote | null {
        const raw = caster.abilityNote;
        if (!raw || raw.abilityId !== this.id) return null;
        return raw.abilityNote as TNote;
    }

    protected setAbilityNote(caster: Unit, note: TNote): void {
        caster.setAbilityNote({ abilityId: this.id, abilityNote: note });
    }

    protected clearAbilityNote(caster: Unit): void {
        caster.clearAbilityNote();
    }

    // -- Phase utilities ------------------------------------------------------

    /** Resolved half-open intervals (legacy rows expanded in declaration order). */
    protected getAbilityTimingIntervals(): AbilityTimingInterval[] {
        return normalizeAbilityTimingsToIntervals(this.abilityTimings);
    }

    /**
     * Which phase wins at the given elapsed time when intervals overlap?
     * Uses the earliest-declared covering interval (same rule as battle timeline merge).
     */
    getPhaseAtTime(elapsed: number): AbilityPhase | null {
        const intervals = this.getAbilityTimingIntervals();
        if (intervals.length === 0) return null;
        let bestIdx = Number.POSITIVE_INFINITY;
        let bestPhase: AbilityPhase | null = null;
        for (let i = 0; i < intervals.length; i++) {
            const it = intervals[i];
            if (it.start <= elapsed && elapsed < it.end && i < bestIdx) {
                bestIdx = i;
                bestPhase = it.abilityPhase;
            }
        }
        return bestPhase;
    }

    /**
     * Did we cross into this phase between prevTime and currentTime? (one-shot triggers)
     * For the first phase (start === 0), the engine clamps prevTime to 0 via
     * Math.max(0, prevTime), so we detect entry when prevTime is still 0 and
     * currentTime has advanced past 0.
     */
    didEnterPhase(phase: AbilityPhase, prevTime: number, currentTime: number): boolean {
        const start = this.getPhaseStartTime(phase);
        if (start === 0) {
            return prevTime === 0 && currentTime > 0;
        }
        return prevTime < start && currentTime >= start;
    }

    /** Start time of the first declared interval with this phase. */
    getPhaseStartTime(phase: AbilityPhase): number {
        const intervals = this.getAbilityTimingIntervals();
        for (const it of intervals) {
            if (it.abilityPhase === phase) return it.start;
        }
        return 0;
    }

    /** End time of the first declared interval with this phase. */
    getPhaseEndTime(phase: AbilityPhase): number {
        const intervals = this.getAbilityTimingIntervals();
        for (const it of intervals) {
            if (it.abilityPhase === phase) return it.end;
        }
        return 0;
    }

    /** Progress through the first declared interval of this phase (0..1), clamped. */
    getPhaseProgress(phase: AbilityPhase, elapsed: number): number {
        const intervals = this.getAbilityTimingIntervals();
        for (const it of intervals) {
            if (it.abilityPhase === phase) {
                const len = it.end - it.start;
                if (len <= 0) return 0;
                const phaseElapsed = elapsed - it.start;
                return Math.max(0, Math.min(1, phaseElapsed / len));
            }
        }
        return 0;
    }

    // -- Default implementations (overridable) --------------------------------

    /** Default: full movement penalty (amount: 0 = no movement) before prefireTime. */
    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < this.prefireTime) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    }

    /** Default: no-op. Override for charging (knockback) or projectile (deactivate) abilities. */
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // no-op
    }
}
