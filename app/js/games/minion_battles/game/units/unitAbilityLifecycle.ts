import type { Unit } from './Unit';
import type { ActiveAbility, ResolvedTarget } from '../types';
import type { EngineContext } from '../EngineContext';
import type { CastBehaviourInterruptContext } from '../../abilities/castBehaviourTypes';
import {
    AbilityPhase,
    getCoveringAbilityPhaseAtElapsed,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
    type AbilityTimingInterval,
} from '../../abilities/abilityTimings';
import { getAbility } from '../../abilities/AbilityRegistry';
import {
    refundAbilityCost,
    resolveAbilityInterruptPolicy,
    spendAbilityCost,
    AbilityEventType,
    type AbilityStatic,
} from '../../abilities/Ability';
import { triggerAbilityEvent } from '../../abilities/events';
import { resolveCastBehaviourTarget } from '../../abilities/resolveCastBehaviourTarget';
import {
    canUseAbilityNow,
    consumeAbilityUse,
    ensureAbilityRuntimeState,
    syncNestedCardAbilityState,
} from '../../abilities/abilityUses';
import { initTelegraphCastPayload } from '../../abilities/telegraphTracking';
import { resolveActiveAbilityMode } from '../../abilities/resolveAbilityMode';

function findCooldownInterval(intervals: AbilityTimingInterval[]): AbilityTimingInterval | undefined {
    return intervals.find(
        (it) => it.abilityPhase === AbilityPhase.Cooldown || it.abilityPhase === AbilityPhase.CoopCooldown,
    );
}

function isCooldownPhase(phase: AbilityPhase | null): boolean {
    return phase === AbilityPhase.Cooldown || phase === AbilityPhase.CoopCooldown;
}

/** Fires ON_CAST_END for a cast that is being ended early (cancel, skip-to-cooldown or end). */
function fireCastEndEarly(unit: Unit, active: ActiveAbility, ability: AbilityStatic, engine: EngineContext): void {
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

/**
 * Snap an in-progress cast to the start of its cooldown interval (no refund).
 * Runs behaviour cleanup first, then clears cast payload / behaviours so windup/active effects
 * do not continue.
 */
function skipActiveAbilityToCooldown(
    unit: Unit,
    active: ActiveAbility,
    ability: AbilityStatic,
    engine: EngineContext,
): boolean {
    const intervals = normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(ability, unit, engine));
    const cooldown = findCooldownInterval(intervals);
    if (!cooldown) return false;
    cleanupCastBehavioursForAbility(unit, active, engine);
    active.startTime = engine.gameTime - cooldown.start;
    active.castPayload = undefined;
    active.castBehaviourPayloads = {};
    // The timeline moved, so any select-gate resume point is stale. Left set, the next tick would
    // process (processedElapsed, cooldown start + dt] and fire every interval in between.
    delete active.processedElapsed;
    delete active.pendingSelectGate;
    return true;
}

export function cleanupCastBehavioursForAbility(unit: Unit, active: ActiveAbility, engine: EngineContext): void {
    const ability = getAbility(active.abilityId);
    for (const [key, rec] of unit.activeCastBehaviours) {
        if (rec.active !== active) continue;
        const intervalForTarget = rec.targetDef
            ? ({ targetDef: rec.targetDef } as AbilityTimingInterval)
            : ({} as AbilityTimingInterval);
        const target = rec.targetDef && ability
            ? resolveCastBehaviourTarget(rec.entry, intervalForTarget, active, unit, ability, engine)
            : active.targets[rec.entry.targetIndex ?? 0] ??
              active.targets[0] ??
              ({ type: 'pixel' as const, position: { x: unit.x, y: unit.y } });
        const ctx: CastBehaviourInterruptContext = {
            caster: unit,
            abilityId: active.abilityId,
            abilityMode: resolveActiveAbilityMode(active, ability),
            target,
            allTargets: active.targets,
            castPayload: active.castPayload,
            behaviourPayload: active.castBehaviourPayloads?.[key],
            setBehaviourPayload: (data) => {
                if (!active.castBehaviourPayloads) active.castBehaviourPayloads = {};
                active.castBehaviourPayloads[key] = data;
            },
            engine,
        };
        rec.entry.behaviour.onInterrupt?.(ctx);
        unit.activeCastBehaviours.delete(key);
    }
}

export function cancelUnitActiveAbility(unit: Unit, abilityId: string, engine: EngineContext): void {
    const idx = unit.activeAbilities.findIndex((a) => a.abilityId === abilityId);
    if (idx < 0) return;
    const active = unit.activeAbilities[idx];
    if (!active) return;
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
    cleanupCastBehavioursForAbility(unit, active, engine);
    unit.activeAbilities.splice(idx, 1);
}

/**
 * The single interrupt pipeline. Used by stun (`Unit.interruptAllAbilities`), knockback
 * (`Unit.interruptAndRefundAbilities`, via `engine.interruptUnitAndRefundAbilities`) and the
 * controlled wall-unstick slingshot. For each active cast:
 *
 * 1. Cooldown phase: `duringCooldown: 'ignore'` keeps the cast; `'end'` ends it (no refund).
 * 2. Before cooldown, `beforeCooldown: 'skipToCooldown'` (when the ability has a cooldown
 *    interval) snaps it to cooldown with no refund.
 * 3. Otherwise `beforeCooldown: 'cancel'`: refund the cost and remove the cast.
 *
 * World-state cleanup (such as a held projectile) belongs to the cast behaviours' `onInterrupt`,
 * which `cleanupCastBehavioursForAbility` runs on every removal or snap.
 *
 * Every cast that is removed or snapped fires `ON_CAST_END` and runs
 * `cleanupCastBehavioursForAbility` (so behaviour `onInterrupt` always fires). The ability note is
 * cleared when at least one cast was interrupted.
 */
export function interruptUnitAbilities(unit: Unit, engine: EngineContext): void {
    const kept: ActiveAbility[] = [];
    let interruptedAny = false;
    for (const active of unit.activeAbilities) {
        const ability = getAbility(active.abilityId);
        if (!ability) continue;
        const elapsed = Math.max(0, engine.gameTime - active.startTime);
        const intervals = normalizeAbilityTimingsToIntervals(
            resolveAbilityTimingEntries(ability, unit, engine),
        );
        const phase = getCoveringAbilityPhaseAtElapsed(elapsed, intervals);
        const policy = resolveAbilityInterruptPolicy(ability);

        if (isCooldownPhase(phase)) {
            if (policy.duringCooldown === 'ignore') {
                kept.push(active);
                continue;
            }
            interruptedAny = true;
            fireCastEndEarly(unit, active, ability, engine);
            cleanupCastBehavioursForAbility(unit, active, engine);
            continue;
        }

        interruptedAny = true;
        if (policy.beforeCooldown === 'skipToCooldown' && findCooldownInterval(intervals)) {
            fireCastEndEarly(unit, active, ability, engine);
            skipActiveAbilityToCooldown(unit, active, ability, engine);
            kept.push(active);
            continue;
        }

        refundAbilityCost(unit, ability, elapsed);
        fireCastEndEarly(unit, active, ability, engine);
        cleanupCastBehavioursForAbility(unit, active, engine);
    }
    unit.activeAbilities = kept;
    if (interruptedAny) unit.clearAbilityNote();
}

/**
 * Ends a cast whose select pick became illegal before its interval entered (a fizzle, detected by
 * `validatePick` in the tick). It follows the before-cooldown rules of the interrupt pipeline:
 * `beforeCooldown: 'skipToCooldown'` (when the ability has a cooldown) snaps the cast to cooldown with
 * no refund; otherwise the cost is refunded and the cast is removed. `ON_CAST_END` and behaviour
 * cleanup always run. A snap to cooldown clears the gate state (see `skipActiveAbilityToCooldown`).
 *
 * Removes the cast from `unit.activeAbilities`, so call it only after the tick loop has finished.
 */
export function fizzleUnitActiveAbility(unit: Unit, active: ActiveAbility, engine: EngineContext): void {
    const ability = getAbility(active.abilityId);
    if (!ability) {
        const idx = unit.activeAbilities.indexOf(active);
        if (idx >= 0) unit.activeAbilities.splice(idx, 1);
        return;
    }
    const elapsed = Math.max(0, engine.gameTime - active.startTime);
    const intervals = normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(ability, unit, engine));
    const policy = resolveAbilityInterruptPolicy(ability);
    if (policy.beforeCooldown === 'skipToCooldown' && findCooldownInterval(intervals)) {
        fireCastEndEarly(unit, active, ability, engine);
        skipActiveAbilityToCooldown(unit, active, ability, engine);
        return;
    }
    refundAbilityCost(unit, ability, elapsed);
    fireCastEndEarly(unit, active, ability, engine);
    cleanupCastBehavioursForAbility(unit, active, engine);
    const idx = unit.activeAbilities.indexOf(active);
    if (idx >= 0) unit.activeAbilities.splice(idx, 1);
    unit.clearAbilityNote();
}

export function executeUnitAbility(
    unit: Unit,
    ability: AbilityStatic,
    targets: ResolvedTarget[],
    engine: EngineContext,
    orderAbilityMode?: string,
): void {
    ensureAbilityRuntimeState(unit, ability.id);
    if (!canUseAbilityNow(unit, ability)) return;
    if (!spendAbilityCost(unit, ability)) return;
    if (!consumeAbilityUse(unit, ability.id, engine.eventBus)) return;
    syncNestedCardAbilityState(unit);

    const existing = unit.activeAbilities.findIndex((a) => a.abilityId === ability.id);
    if (existing >= 0) {
        const existingActive = unit.activeAbilities[existing];
        if (existingActive) {
            const existingElapsed = Math.max(0, engine.gameTime - existingActive.startTime);
            triggerAbilityEvent({
                engine,
                caster: unit,
                ability,
                activeAbility: existingActive,
                targets: existingActive.targets,
                eventType: AbilityEventType.ON_CAST_END,
                prevTime: existingElapsed,
                currentTime: existingElapsed,
            });
            cleanupCastBehavioursForAbility(unit, existingActive, engine);
        }
        unit.activeAbilities.splice(existing, 1);
        unit.clearAbilityNote();
    }

    const active: ActiveAbility = {
        abilityId: ability.id,
        startTime: engine.gameTime,
        targets: targets.map((t) => ({ ...t })),
        castBehaviourPayloads: {},
        evadeFired: false,
        comboCount: unit.pendingComboCount ?? 1,
        ...(orderAbilityMode !== undefined || ability.abilityModes?.defaultMode !== undefined
            ? { abilityMode: orderAbilityMode ?? ability.abilityModes!.defaultMode }
            : {}),
    };
    unit.pendingComboCount = undefined;
    ability.beginActiveCast?.(engine, unit, active.targets, active);
    // Generic telegraph: capture primary target position when no beginActiveCast set it.
    if (ability.telegraph && active.castPayload == null) {
        const telegraphPayload = initTelegraphCastPayload(ability, active.targets, engine);
        if (telegraphPayload) {
            active.castPayload = telegraphPayload;
        }
    }
    unit.activeAbilities.push(active);
    triggerAbilityEvent({
        engine,
        caster: unit,
        ability,
        activeAbility: active,
        targets: active.targets,
        eventType: AbilityEventType.ON_CAST_START,
        prevTime: 0,
        currentTime: 0,
    });

    engine.trackAbilityUse(unit.id, ability.id);
    engine.eventBus.emit('ability_used', { unitId: unit.id, abilityId: ability.id });
}

export function unitRoundStart(unit: Unit, engine: EngineContext): void {
    if (!unit.isAlive()) return;
    unit.applyStaminaSurge(Math.max(0, Math.floor(unit.stamina)));
    unit.grantRoundCharges();
    const movement = unit.getResource('movement_points');
    if (movement) {
        const recovery = Math.max(0, unit.getMovementRecoveryPerRound() - unit.getMovementSlowStacks(engine));
        movement.add(recovery);
    }
    for (const resource of unit.resources) {
        resource.onRoundStart?.(unit, engine);
    }
    for (const abilityId of unit.abilities) {
        getAbility(abilityId)?.onRoundStart?.(unit, engine);
    }
    unit.syncNestedCardState();
}
