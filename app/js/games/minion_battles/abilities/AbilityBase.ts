import {
    AbilityState,
    type AbilityStatic,
    type AbilityStateEntry,
    type AttackBlockedInfo,
    type ResourceCost,
    type AbilityAISettings,
} from './Ability';
import { AbilityPhase, type AbilityTiming } from './abilityTimings';
import type { Unit } from '../objects/Unit';
import type { TargetDef } from './targeting';
import type { ResolvedTarget } from '../engine/types';

export abstract class AbilityBase<TNote = never> implements AbilityStatic {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly image: string;
    abstract readonly prefireTime: number;
    abstract readonly cooldownTime: number;
    abstract readonly targets: TargetDef[];

    abstract doCardEffect(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
    ): void;

    abstract getTooltipText(gameState?: unknown): string[];

    readonly resourceCost: ResourceCost | null = null;
    readonly rechargeTurns: number = 0;
    readonly aiSettings?: AbilityAISettings;
    readonly abilityTimings?: AbilityTiming[];

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

    /** Which phase is active at the given elapsed time? Returns null if past all phases. */
    getPhaseAtTime(elapsed: number): AbilityPhase | null {
        if (!this.abilityTimings) return null;
        let t = 0;
        for (const timing of this.abilityTimings) {
            if (elapsed < t + timing.duration) return timing.abilityPhase;
            t += timing.duration;
        }
        return null;
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

    /** Absolute start time of a phase (sum of preceding durations). */
    getPhaseStartTime(phase: AbilityPhase): number {
        if (!this.abilityTimings) return 0;
        let t = 0;
        for (const timing of this.abilityTimings) {
            if (timing.abilityPhase === phase) return t;
            t += timing.duration;
        }
        return t;
    }

    /** Absolute end time of a phase (start + its duration). */
    getPhaseEndTime(phase: AbilityPhase): number {
        if (!this.abilityTimings) return 0;
        let t = 0;
        for (const timing of this.abilityTimings) {
            if (timing.abilityPhase === phase) return t + timing.duration;
            t += timing.duration;
        }
        return t;
    }

    /** Progress through a specific phase (0..1), clamped. */
    getPhaseProgress(phase: AbilityPhase, elapsed: number): number {
        if (!this.abilityTimings) return 0;
        let t = 0;
        for (const timing of this.abilityTimings) {
            if (timing.abilityPhase === phase) {
                const phaseElapsed = elapsed - t;
                return Math.max(0, Math.min(1, phaseElapsed / timing.duration));
            }
            t += timing.duration;
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
