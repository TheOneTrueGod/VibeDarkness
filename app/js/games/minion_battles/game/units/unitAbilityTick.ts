/**
 * Per-unit active ability tick — extracted from GameEngine.processActiveAbilities.
 *
 * Called once per game tick per unit by Unit.tickActiveAbilities, which is
 * invoked from UnitManager.gameTick (phase 1).
 */

import type { Unit } from './Unit';
import type { EngineContext } from '../EngineContext';
import { getAbility } from '../../abilities/AbilityRegistry';
import {
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
    enteredTimingIds,
    exitedTimingIds,
    getTotalAbilityDurationForCast,
    AbilityPhase,
    getEffectiveCastBehaviours,
} from '../../abilities/abilityTimings';
import { createEmitterFromDef } from '../../abilities/createEmitterFromDef';
import { getBodyColorForUnit, getCharacterSpriteKey } from './unit_defs/unitDef';
import { AbilityEventType, abilityHasTag } from '../../abilities/Ability';
import {
    resolveBehaviourTimingRef,
    type CastBehaviourBaseContext,
    type CastBehaviourEntry,
} from '../../abilities/castBehaviourTypes';
import { isSelectTargetDef, isHitTargetDef } from '../../abilities/timingTargetDef';
import { triggerAbilityEvent } from '../../abilities/events';

/**
 * Resolve the `target` for a castBehaviour entry, preferring `targetsByLabel`
 * when the parent timing interval has a `targetDef`.
 *
 * Falls back to `active.targets[targetIdx]` → `active.targets[0]` → pixel at
 * the caster position (same as the legacy path).
 */
function resolveTargetForBehaviour(
    entry: CastBehaviourEntry,
    interval: import('../../abilities/abilityTimings').AbilityTimingInterval,
    active: import('../types').ActiveAbility,
    unit: Unit,
): import('../types').ResolvedTarget {
    const fallback =
        active.targets[entry.targetIndex ?? 0] ??
        active.targets[0] ??
        ({ type: 'pixel' as const, position: { x: unit.x, y: unit.y } });

    const { targetDef } = interval;
    if (!targetDef) return fallback;

    if (isSelectTargetDef(targetDef)) {
        return active.targetsByLabel?.[targetDef.label] ?? fallback;
    }
    if (isHitTargetDef(targetDef)) {
        for (const label of targetDef.labels) {
            const resolved = active.targetsByLabel?.[label];
            if (resolved !== undefined) return resolved;
        }
        return fallback;
    }
    return fallback;
}

/**
 * Advance all active abilities for `unit` by `dt` seconds.
 * Invokes cast behaviour hooks, emitter lifecycle, evade-break notifications,
 * and fires ON_CAST_TICK / ON_CAST_END ability events.
 *
 * @param onNaturalCompletion - called when an ability completes by duration (not cancel/interrupt).
 */
export function tickUnitActiveAbilities(
    unit: Unit,
    dt: number,
    engine: EngineContext,
    onNaturalCompletion: () => void,
): void {
    if (unit.activeAbilities.length === 0) return;

    const completed: number[] = [];

    for (let i = 0; i < unit.activeAbilities.length; i++) {
        const active = unit.activeAbilities[i];
        const ability = getAbility(active.abilityId);
        if (!ability) {
            completed.push(i);
            continue;
        }

        const currentTime = engine.gameTime - active.startTime;
        const prevTime = currentTime - dt;
        const safePrevTime = Math.max(0, prevTime);

        const intervals = normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(ability, unit, engine));
        // Use unclamped prevTime for entry/exit detection so intervals starting at t=0
        // are correctly detected as "entered" on the first tick (safePrevTime would be 0,
        // making a [0, end) interval appear already active and suppressing emitter creation).
        const entered = enteredTimingIds(prevTime, currentTime, intervals);
        const exited = exitedTimingIds(prevTime, currentTime, intervals);

        for (const interval of intervals) {
            if (interval.emitterDef && entered.has(interval.id)) {
                let emitterDef = interval.emitterDef;
                if (emitterDef.useCasterVisualData) {
                    const visualData = {
                        bodyColor: getBodyColorForUnit(unit),
                        radius: unit.radius,
                        characterSpriteKey: getCharacterSpriteKey(unit.characterId),
                    };
                    emitterDef = {
                        ...emitterDef,
                        effectData: { ...visualData, ...emitterDef.effectData },
                    };
                }
                const emitter = createEmitterFromDef(emitterDef, {
                    x: unit.x,
                    y: unit.y,
                    attachedToUnitId: unit.id,
                    lifetime: interval.end - interval.start,
                });
                const key = interval.id;
                unit.activeTimingEmitters.set(key, emitter);
                engine.addEffectEmitter(emitter);
            }
            if (interval.emitterDef && exited.has(interval.id)) {
                const key = interval.id;
                const emitter = unit.activeTimingEmitters.get(key);
                if (emitter) {
                    emitter.active = false;
                    unit.activeTimingEmitters.delete(key);
                }
            }
        }

        // castBehaviours: interval enter
        for (const interval of intervals) {
            const effectiveBehaviours = getEffectiveCastBehaviours(interval);
            if (!effectiveBehaviours) continue;
            for (let bIdx = 0; bIdx < effectiveBehaviours.length; bIdx++) {
                const entry = effectiveBehaviours[bIdx]!;
                if (!entered.has(interval.id)) continue;
                const behaviourKey = `${interval.id}_${bIdx}`;
                const resolvedStart = resolveBehaviourTimingRef(entry.timingStart, interval.start, interval.end);
                const resolvedEnd = entry.timingEnd !== undefined
                    ? resolveBehaviourTimingRef(entry.timingEnd, interval.start, interval.end)
                    : null;

                const target = resolveTargetForBehaviour(entry, interval, active, unit);

                if (!active.castBehaviourPayloads) active.castBehaviourPayloads = {};

                const setupCtx: import('../../abilities/castBehaviourTypes').CastBehaviourSetupContext = {
                    caster: unit,
                    abilityId: active.abilityId,
                    target,
                    allTargets: active.targets,
                    castPayload: active.castPayload,
                    behaviourPayload: active.castBehaviourPayloads[behaviourKey],
                    setBehaviourPayload: (data) => { active.castBehaviourPayloads![behaviourKey] = data; },
                    engine,
                };
                entry.behaviour.onSetup?.(setupCtx);

                if (resolvedEnd !== null) {
                    unit.activeCastBehaviours.set(behaviourKey, {
                        entry,
                        intervalStart: resolvedStart,
                        intervalEnd: resolvedEnd,
                        caster: unit,
                        active,
                        targetDef: interval.targetDef,
                    });
                } else {
                    const tickCtx: import('../../abilities/castBehaviourTypes').CastBehaviourTickContext = {
                        caster: unit,
                        abilityId: active.abilityId,
                        target,
                        allTargets: active.targets,
                        castPayload: active.castPayload,
                        behaviourPayload: active.castBehaviourPayloads[behaviourKey],
                        setBehaviourPayload: (data) => { active.castBehaviourPayloads![behaviourKey] = data; },
                        engine,
                        windowProgress: 0,
                        prevWindowProgress: 0,
                        isFirstTick: true,
                        isLastTick: true,
                    };
                    entry.behaviour.onTick?.(tickCtx);
                }
            }
        }

        // castBehaviours: interval exit (sustained)
        for (const interval of intervals) {
            const effectiveBehavioursExit = getEffectiveCastBehaviours(interval);
            if (!effectiveBehavioursExit) continue;
            for (let bIdx = 0; bIdx < effectiveBehavioursExit.length; bIdx++) {
                const entry = effectiveBehavioursExit[bIdx]!;
                if (!exited.has(interval.id)) continue;
                const behaviourKey = `${interval.id}_${bIdx}`;
                const rec = unit.activeCastBehaviours.get(behaviourKey);
                if (!rec) continue;
                const target = resolveTargetForBehaviour(entry, interval, active, unit);
                const tickCtx: import('../../abilities/castBehaviourTypes').CastBehaviourTickContext = {
                    caster: unit,
                    abilityId: active.abilityId,
                    target,
                    allTargets: active.targets,
                    castPayload: active.castPayload,
                    behaviourPayload: active.castBehaviourPayloads?.[behaviourKey],
                    setBehaviourPayload: (data) => { if (!active.castBehaviourPayloads) active.castBehaviourPayloads = {}; active.castBehaviourPayloads[behaviourKey] = data; },
                    engine,
                    windowProgress: 1,
                    prevWindowProgress: Math.max(0, Math.min(1, (rec.intervalEnd - rec.intervalStart) > 0 ? ((currentTime - rec.intervalStart) / (rec.intervalEnd - rec.intervalStart) - dt / (rec.intervalEnd - rec.intervalStart)) : 1)),
                    isFirstTick: false,
                    isLastTick: true,
                };
                entry.behaviour.onTick?.(tickCtx);
                unit.activeCastBehaviours.delete(behaviourKey);
            }
        }

        // conditionalCancel: evaluated on interval exit (after cast behaviour exit hooks)
        if (!active.conditionalCancelPaused) {
            for (const interval of intervals) {
                if (!exited.has(interval.id)) continue;
                const cc = interval.conditionalCancel;
                if (!cc) continue;
                if (cc.condition({
                    caster: unit,
                    engine,
                    targets: active.targets,
                    abilityId: active.abilityId,
                })) {
                    active.conditionalCancelPaused = true;
                    active.conditionalCancelTagFilter = cc.abilityTagFilter ? [...cc.abilityTagFilter] : undefined;
                    engine.requestConditionalCancelPause(unit);
                    break;
                }
            }
        }

        if (active.conditionalCancelPaused) {
            continue;
        }

        // castBehaviours: evade-break on interval enter (declarative and legacy paths)
        for (const interval of intervals) {
            if (!entered.has(interval.id)) continue;
            const isDeclarativeEvade = interval.evadeEffect === true;
            const isLegacyEvade =
                !active.evadeFired &&
                abilityHasTag(active.abilityId, 'evade') &&
                (interval.abilityPhase === AbilityPhase.Active || interval.tags?.includes('iframe') === true);
            if (!isDeclarativeEvade && !isLegacyEvade) continue;

            active.evadeFired = true;
            const snapshot = { x: unit.x, y: unit.y };
            for (const otherUnit of engine.units) {
                if (otherUnit.id === unit.id) continue;
                for (const [behaviourKey, rec] of otherUnit.activeCastBehaviours) {
                    // Resolve the target for this behaviour, checking targetsByLabel first.
                    const evadeFallback = rec.active.targets[rec.entry.targetIndex ?? 0];
                    let behaviourTarget = evadeFallback;
                    const evadeTargetDef = rec.targetDef;
                    if (evadeTargetDef) {
                        if (isSelectTargetDef(evadeTargetDef)) {
                            behaviourTarget = rec.active.targetsByLabel?.[evadeTargetDef.label] ?? evadeFallback;
                        } else if (isHitTargetDef(evadeTargetDef)) {
                            for (const label of evadeTargetDef.labels) {
                                const r = rec.active.targetsByLabel?.[label];
                                if (r !== undefined) { behaviourTarget = r; break; }
                            }
                        }
                    }
                    if (behaviourTarget?.type !== 'unit' || behaviourTarget.unitId !== unit.id) continue;
                    const baseCtx: CastBehaviourBaseContext = {
                        caster: otherUnit,
                        abilityId: rec.active.abilityId,
                        target: behaviourTarget,
                        allTargets: rec.active.targets,
                        castPayload: rec.active.castPayload,
                        behaviourPayload: rec.active.castBehaviourPayloads?.[behaviourKey],
                        setBehaviourPayload: (data) => {
                            if (!rec.active.castBehaviourPayloads) rec.active.castBehaviourPayloads = {};
                            rec.active.castBehaviourPayloads[behaviourKey] = data;
                        },
                    };
                    rec.entry.behaviour.onTargetEvade?.(unit.id, snapshot, baseCtx);
                }
            }
        }

        // castBehaviours: per-tick for active sustained behaviours belonging to this cast
        for (const [behaviourKey, rec] of unit.activeCastBehaviours) {
            if (rec.active !== active) continue;
            const windowLen = rec.intervalEnd - rec.intervalStart;
            const rawProgress = windowLen > 0 ? (currentTime - rec.intervalStart) / windowLen : 1;
            const rawPrevProgress = windowLen > 0 ? (safePrevTime - rec.intervalStart) / windowLen : 0;
            const fallbackTarget =
                active.targets[rec.entry.targetIndex ?? 0] ??
                active.targets[0] ??
                ({ type: 'pixel' as const, position: { x: unit.x, y: unit.y } });
            let target = fallbackTarget;
            const recTargetDef = rec.targetDef;
            if (recTargetDef) {
                if (isSelectTargetDef(recTargetDef)) {
                    target = active.targetsByLabel?.[recTargetDef.label] ?? fallbackTarget;
                } else if (isHitTargetDef(recTargetDef)) {
                    for (const label of recTargetDef.labels) {
                        const resolved = active.targetsByLabel?.[label];
                        if (resolved !== undefined) { target = resolved; break; }
                    }
                }
            }
            const tickCtx: import('../../abilities/castBehaviourTypes').CastBehaviourTickContext = {
                caster: unit,
                abilityId: active.abilityId,
                target,
                allTargets: active.targets,
                castPayload: active.castPayload,
                behaviourPayload: active.castBehaviourPayloads?.[behaviourKey],
                setBehaviourPayload: (data) => {
                    if (!active.castBehaviourPayloads) active.castBehaviourPayloads = {};
                    active.castBehaviourPayloads[behaviourKey] = data;
                },
                engine,
                windowProgress: Math.max(0, Math.min(1, rawProgress)),
                prevWindowProgress: Math.max(0, Math.min(1, rawPrevProgress)),
                isFirstTick: rawPrevProgress <= 0 && rawProgress > 0,
                isLastTick: false,
            };
            rec.entry.behaviour.onTick?.(tickCtx);
        }

        ability.doCardEffect?.(engine, unit, active.targets, safePrevTime, currentTime, active);
        triggerAbilityEvent({
            engine,
            caster: unit,
            ability,
            activeAbility: active,
            targets: active.targets,
            eventType: AbilityEventType.ON_CAST_TICK,
            prevTime: safePrevTime,
            currentTime,
        });

        const totalDuration = getTotalAbilityDurationForCast(ability, unit, engine);
        if (currentTime >= totalDuration) {
            completed.push(i);
        }
    }

    for (let i = completed.length - 1; i >= 0; i--) {
        const completedIndex = completed[i];
        if (completedIndex === undefined) continue;
        const active = unit.activeAbilities[completedIndex];
        if (!active) continue;
        const ability = getAbility(active.abilityId);
        if (ability) {
            const elapsed = Math.max(0, engine.gameTime - active.startTime);
            triggerAbilityEvent({
                engine,
                caster: unit,
                ability,
                activeAbility: active,
                targets: active.targets,
                eventType: AbilityEventType.ON_CAST_END,
                prevTime: elapsed,
                currentTime: elapsed,
            });
        }
        onNaturalCompletion();
        unit.activeAbilities.splice(completedIndex, 1);
    }
}
