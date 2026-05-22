import type { Unit } from '../game/units/Unit';
import type { ResolvedTarget } from '../game/types';
import type { AbilityEngineContext } from './AbilityEngineContext';

// ---- Timing refs ----
export type BehaviourTimingRef = 'start' | 'end' | `${number}%` | number;
// 'start' = interval.start, 'end' = interval.end
// '25%'   = interval.start + 0.25 * (interval.end - interval.start)
// 0.25    = interval.start + 0.25 seconds (absolute from window start)

export function resolveBehaviourTimingRef(
    ref: BehaviourTimingRef,
    windowStart: number,
    windowEnd: number,
): number {
    if (ref === 'start') return windowStart;
    if (ref === 'end') return windowEnd;
    if (typeof ref === 'string' && ref.endsWith('%')) {
        const pct = parseFloat(ref) / 100;
        return windowStart + pct * (windowEnd - windowStart);
    }
    // absolute offset from window start
    return windowStart + (ref as number);
}

// ---- Entry ----
export interface CastBehaviourEntry {
    timingStart: BehaviourTimingRef;
    timingEnd?: BehaviourTimingRef; // absent = one-shot at timingStart
    targetIndex?: number;           // which target in targets[] (default: 0)
    behaviour: CastBehaviour;
}

// ---- Context types ----
export interface CastBehaviourBaseContext {
    caster: Unit;
    target: ResolvedTarget;
    allTargets: ResolvedTarget[];
    castPayload: unknown;
    behaviourPayload: unknown;
    setBehaviourPayload: (data: unknown) => void;
}

export interface CastBehaviourSetupContext extends CastBehaviourBaseContext {
    engine: AbilityEngineContext;
}

export interface CastBehaviourTickContext extends CastBehaviourBaseContext {
    engine: AbilityEngineContext;
    windowProgress: number;     // 0→1, CLAMPED
    prevWindowProgress: number; // 0→1, CLAMPED
    isFirstTick: boolean;
    isLastTick: boolean;
}

export interface CastBehaviourInterruptContext extends CastBehaviourBaseContext {
    engine: AbilityEngineContext;
}

export interface CastBehaviourRenderContext extends CastBehaviourBaseContext {
    gameTime: number;
    windowProgress: number; // 0→1, CLAMPED
    // setBehaviourPayload is a no-op in render context
}

// ---- Behaviour interface ----
export interface CastBehaviour {
    onSetup?(context: CastBehaviourSetupContext): void;
    onTick?(context: CastBehaviourTickContext): void;
    onInterrupt?(context: CastBehaviourInterruptContext): void;
    onTargetEvade?(
        unitId: string,
        snapshot: { x: number; y: number },
        context: CastBehaviourBaseContext,
    ): void;
    getCasterRenderOffset?(context: CastBehaviourRenderContext): { x: number; y: number } | null;
}
