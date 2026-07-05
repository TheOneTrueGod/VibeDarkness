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
    type AbilityTimingInterval,
} from '../../abilities/abilityTimings';
import { advanceWindupLunge, type WindupLungePayload } from '../../abilities/WindupLunge';
import { createEmitterFromDef } from '../../abilities/createEmitterFromDef';
import { applyVisualEffectDefs } from '../effects/applyVisualEffectDefs';
import { getBodyColorForUnit, getCharacterSpriteKey } from './unit_defs/unitDef';
import { AbilityEventType, abilityHasTag, type AbilityStatic } from '../../abilities/Ability';
import {
    resolveBehaviourTimingRef,
    type CastBehaviourBaseContext,
    type CastBehaviourEntry,
} from '../../abilities/castBehaviourTypes';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import type { ActiveAbility, ResolvedTarget } from '../types';
import { isSelectTargetDef, isHitTargetDef } from '../../abilities/timingTargetDef';
import { resolveCastBehaviourTarget } from '../../abilities/resolveCastBehaviourTarget';
import { resolveActiveAbilityMode } from '../../abilities/resolveAbilityMode';
import { triggerAbilityEvent } from '../../abilities/events';
import {
    detectAndFreezeTelegraphDistanceBreak,
    lockTelegraphOnTargetEvade,
    updateTelegraphTracking,
} from '../../abilities/telegraphTracking';

/**
 * Fire all entry-time side effects for a single timing interval:
 * creates the emitter (if any) and runs castBehaviour onSetup / activeCastBehaviours registration.
 */
function fireIntervalEntry(
    interval: AbilityTimingInterval,
    active: ActiveAbility,
    unit: Unit,
    ability: AbilityStatic,
    engine: EngineContext,
    _dt: number,
): void {
    // --- emitter ---
    if (interval.emitterDef) {
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
        let emitX = unit.x;
        let emitY = unit.y;
        let attachedToUnitId: string | undefined = unit.id;
        if (emitterDef.effectPosition === 'target') {
            const primaryTarget = resolveCastBehaviourTarget(
                { targetIndex: 0 } as CastBehaviourEntry,
                interval,
                active,
                unit,
                ability,
                engine,
            );
            if (primaryTarget?.type === 'pixel' && primaryTarget.position) {
                emitX = primaryTarget.position.x;
                emitY = primaryTarget.position.y;
                attachedToUnitId = undefined;
            } else if (primaryTarget?.type === 'unit' && primaryTarget.unitId) {
                const targetUnit = engine.getUnit(primaryTarget.unitId);
                if (targetUnit) {
                    emitX = targetUnit.x;
                    emitY = targetUnit.y;
                    attachedToUnitId = undefined;
                }
            }
        }

        let resolvedEmitterDef = emitterDef;
        if (emitterDef.resolveEffectData) {
            resolvedEmitterDef = {
                ...emitterDef,
                effectData: {
                    ...emitterDef.effectData,
                    ...emitterDef.resolveEffectData({ abilityMode: active.abilityMode }),
                },
            };
        }

        const emitter = createEmitterFromDef(resolvedEmitterDef, {
            x: emitX,
            y: emitY,
            attachedToUnitId,
            lifetime: interval.end - interval.start,
        });
        const key = interval.id;
        unit.activeTimingEmitters.set(key, emitter);
        engine.addEffectEmitter(emitter);

        // Apply declarative VisualEffectDefs at window-entry time.
        if (emitterDef.visualEffects?.length) {
            const useTarget = emitterDef.effectPosition === 'target';
            const primaryTarget = useTarget
                ? resolveCastBehaviourTarget(
                    { targetIndex: 0 } as CastBehaviourEntry,
                    interval,
                    active,
                    unit,
                    ability,
                    engine,
                )
                : active.targets[0];
            const targetUnit =
                useTarget && primaryTarget?.type === 'unit'
                    ? engine.getUnit(primaryTarget.unitId!)
                    : undefined;
            const positionUnit =
                targetUnit ??
                (useTarget && primaryTarget?.type === 'pixel'
                    ? { x: primaryTarget.position!.x, y: primaryTarget.position!.y, radius: 0, characterId: '' }
                    : null) ??
                unit;
            const contextTargetUnit =
                primaryTarget?.type === 'unit'
                    ? engine.getUnit(primaryTarget.unitId!)
                    : undefined;
            const contextTarget: { x: number; y: number; radius: number } | undefined =
                contextTargetUnit ??
                (primaryTarget?.type === 'pixel'
                    ? { x: primaryTarget.position!.x, y: primaryTarget.position!.y, radius: 0 }
                    : undefined);
            applyVisualEffectDefs(emitterDef.visualEffects, positionUnit, engine, contextTarget ? { target: contextTarget } : undefined);
        }
    }

    // --- castBehaviours onSetup / activeCastBehaviours registration ---
    const effectiveBehaviours = getEffectiveCastBehaviours(interval);
    if (effectiveBehaviours) {
        for (let bIdx = 0; bIdx < effectiveBehaviours.length; bIdx++) {
            const entry = effectiveBehaviours[bIdx]!;
            const behaviourKey = `${interval.id}_${bIdx}`;
            const resolvedStart = resolveBehaviourTimingRef(entry.timingStart, interval.start, interval.end);
            const resolvedEnd = entry.timingEnd !== undefined
                ? resolveBehaviourTimingRef(entry.timingEnd, interval.start, interval.end)
                : null;

            const target = resolveCastBehaviourTarget(entry, interval, active, unit, ability, engine);

            if (!active.castBehaviourPayloads) active.castBehaviourPayloads = {};

            const setupCtx: import('../../abilities/castBehaviourTypes').CastBehaviourSetupContext = {
                caster: unit,
                abilityId: active.abilityId,
                abilityMode: resolveActiveAbilityMode(active, ability),
                target,
                allTargets: active.targets,
                castPayload: active.castPayload,
                behaviourPayload: active.castBehaviourPayloads[behaviourKey],
                setBehaviourPayload: (data) => { active.castBehaviourPayloads![behaviourKey] = data; },
                engine,
                onProjectileHit: interval.onProjectileHit,
            };
            if (!active.setupFiredBehaviourKeys) active.setupFiredBehaviourKeys = new Set();
            if (!active.setupFiredBehaviourKeys.has(behaviourKey)) {
                active.setupFiredBehaviourKeys.add(behaviourKey);
                entry.behaviour.onSetup?.(setupCtx);
            }

            if (resolvedEnd !== null) {
                unit.activeCastBehaviours.set(behaviourKey, {
                    entry,
                    intervalStart: resolvedStart,
                    intervalEnd: resolvedEnd,
                    caster: unit,
                    active,
                    targetDef: interval.targetDef,
                    onProjectileHit: interval.onProjectileHit,
                    fireOnHitAtFirstTick: !entry.behaviour.handlesOnProjectileHit && (interval.onProjectileHit?.length ?? 0) > 0,
                });
            } else {
                const tickCtx: import('../../abilities/castBehaviourTypes').CastBehaviourTickContext = {
                    caster: unit,
                    abilityId: active.abilityId,
                    abilityMode: resolveActiveAbilityMode(active, ability),
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

        // Emitter entry/exit loop + castBehaviour entry (via fireIntervalEntry).
        for (const interval of intervals) {
            if (entered.has(interval.id)) {
                if (interval.targetDef?.kind === 'select' && active.targetsByLabel !== undefined) {
                    const label = interval.targetDef.label;
                    if (active.targetsByLabel[label] === undefined) {
                        console.error(
                            `[unitAbilityTick] Select-target interval "${interval.id}" entered without resolved label "${label}" during interactive preview (ability ${active.abilityId}). Lookahead invariant violated.`,
                        );
                        continue;
                    }
                }
                // Apply per-label movement re-input when a select interval fires.
                if (interval.targetDef?.kind === 'select' && active.movementByLabel) {
                    const enteredLabel = interval.targetDef.label;
                    const enteredMov = active.movementByLabel[enteredLabel];
                    if (enteredMov && enteredMov.movePath.length > 0) {
                        unit.setMovement(enteredMov.movePath, enteredMov.moveTargetUnitId, engine.gameTick, enteredMov.moveTargetPixel);
                        delete active.movementByLabel[enteredLabel];
                    }
                }
                fireIntervalEntry(interval, active, unit, ability, engine, dt);
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
                const target = resolveCastBehaviourTarget(entry, interval, active, unit, ability, engine);
                const tickCtx: import('../../abilities/castBehaviourTypes').CastBehaviourTickContext = {
                    caster: unit,
                    abilityId: active.abilityId,
                    abilityMode: resolveActiveAbilityMode(active, ability),
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

        // Distance-break: detect target moving out of tether range and notify behaviours.
        // Must run before updateTelegraphTracking so the ability payload is the first thing updated.
        // Evade-break (evade ability) is handled by the loop below.
        const distBreak = detectAndFreezeTelegraphDistanceBreak(unit, active, ability, currentTime, engine);
        if (distBreak) {
            for (const [behaviourKey, rec] of unit.activeCastBehaviours) {
                if (rec.active !== active) continue;
                const fallback = rec.active.targets[rec.entry.targetIndex ?? 0];
                if (fallback?.type !== 'unit' || fallback.unitId !== distBreak.unitId) continue;
                const baseCtx: CastBehaviourBaseContext = {
                    caster: unit,
                    abilityId: active.abilityId,
                    abilityMode: resolveActiveAbilityMode(active, ability),
                    target: fallback,
                    allTargets: active.targets,
                    castPayload: active.castPayload,
                    behaviourPayload: active.castBehaviourPayloads?.[behaviourKey],
                    setBehaviourPayload: (data) => {
                        if (!active.castBehaviourPayloads) active.castBehaviourPayloads = {};
                        active.castBehaviourPayloads[behaviourKey] = data;
                    },
                    engine: engine as unknown as AbilityEngineContext,
                };
                rec.entry.behaviour.onTargetEvade?.(distBreak.unitId, distBreak.frozenAt, baseCtx);
            }
            // Downgrade active.targets / targetsByLabel to a pixel target at the frozen position.
            // Mirrors the evade-break downgrade below — both events must produce a pixel target so
            // MeleeAttack.onTick uses the frozen aim point rather than the unit's live position.
            const frozenPixel: ResolvedTarget = { type: 'pixel', position: distBreak.frozenAt };
            for (let ti = 0; ti < active.targets.length; ti++) {
                const t = active.targets[ti];
                if (t?.type === 'unit' && t.unitId === distBreak.unitId) {
                    active.targets[ti] = frozenPixel;
                }
            }
            if (active.targetsByLabel) {
                for (const label of Object.keys(active.targetsByLabel)) {
                    const t = active.targetsByLabel[label];
                    if (t?.type === 'unit' && t.unitId === distBreak.unitId) {
                        active.targetsByLabel[label] = frozenPixel;
                    }
                }
            }
        }

        updateTelegraphTracking(unit, active, ability, currentTime, engine);

        // castBehaviours: evade-break on interval enter (declarative and legacy paths)
        // TODO: remove isLegacyEvade branch when all evade abilities use declarative evadeEffect intervals
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
                        abilityMode: resolveActiveAbilityMode(rec.active, getAbility(rec.active.abilityId)),
                        target: behaviourTarget,
                        allTargets: rec.active.targets,
                        castPayload: rec.active.castPayload,
                        behaviourPayload: rec.active.castBehaviourPayloads?.[behaviourKey],
                        setBehaviourPayload: (data) => {
                            if (!rec.active.castBehaviourPayloads) rec.active.castBehaviourPayloads = {};
                            rec.active.castBehaviourPayloads[behaviourKey] = data;
                        },
                        engine: engine as unknown as AbilityEngineContext,
                    };
                    rec.entry.behaviour.onTargetEvade?.(unit.id, snapshot, baseCtx);

                    // Also downgrade active.targets / active.targetsByLabel so they become the
                    // single source of truth for evade state (pixel target at frozen position).
                    for (let ti = 0; ti < rec.active.targets.length; ti++) {
                        const t = rec.active.targets[ti];
                        if (t?.type === 'unit' && t.unitId === unit.id) {
                            rec.active.targets[ti] = { type: 'pixel', position: snapshot };
                        }
                    }
                    if (rec.active.targetsByLabel) {
                        for (const label of Object.keys(rec.active.targetsByLabel)) {
                            const t = rec.active.targetsByLabel[label];
                            if (t?.type === 'unit' && t.unitId === unit.id) {
                                rec.active.targetsByLabel[label] = { type: 'pixel', position: snapshot };
                            }
                        }
                    }
                }
                for (const otherActive of otherUnit.activeAbilities) {
                    const otherAbility = getAbility(otherActive.abilityId);
                    if (!otherAbility) continue;
                    lockTelegraphOnTargetEvade(
                        otherUnit,
                        otherActive,
                        otherAbility,
                        unit.id,
                        snapshot,
                        engine.gameTime - otherActive.startTime,
                        engine,
                    );
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
            const intervalForTarget = rec.targetDef
                ? ({ targetDef: rec.targetDef } as import('../../abilities/abilityTimings').AbilityTimingInterval)
                : ({} as import('../../abilities/abilityTimings').AbilityTimingInterval);
            const target = rec.targetDef
                ? resolveCastBehaviourTarget(rec.entry, intervalForTarget, active, unit, ability, engine)
                : fallbackTarget;
            const tickCtx: import('../../abilities/castBehaviourTypes').CastBehaviourTickContext = {
                caster: unit,
                abilityId: active.abilityId,
                abilityMode: resolveActiveAbilityMode(active, ability),
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
            if (rec.fireOnHitAtFirstTick && tickCtx.isFirstTick && rec.onProjectileHit?.length) {
                const contextTargetUnit =
                    target.type === 'unit' ? engine.getUnit(target.unitId!) : undefined;
                const contextTarget: { x: number; y: number; radius: number } | undefined =
                    contextTargetUnit ??
                    (target.type === 'pixel' && target.position
                        ? { x: target.position.x, y: target.position.y, radius: 0 }
                        : undefined);
                applyVisualEffectDefs(
                    rec.onProjectileHit,
                    unit,
                    engine,
                    contextTarget ? { target: contextTarget } : undefined,
                );
            }
        }

        // Windup lunge: physically advance caster toward lunge target during the windup phase.
        if (ability.lunge) {
            const windupInterval = intervals.find(i => i.abilityPhase === AbilityPhase.Windup);
            if (windupInterval && currentTime > 0 && currentTime <= windupInterval.end) {
                const lungePayload = active.castPayload as WindupLungePayload | undefined;
                if (lungePayload?.effectiveLungeDistance && lungePayload.effectiveLungeDistance > 0) {
                    advanceWindupLunge(unit, lungePayload, ability, currentTime, windupInterval.end, engine);
                }
            }
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
        if (ability?.clearMovementOnComplete) {
            unit.clearMovement();
        }
        onNaturalCompletion();
        unit.activeAbilities.splice(completedIndex, 1);
    }
}
