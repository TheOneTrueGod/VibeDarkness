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
import { refundAbilityCost, spendAbilityCost, AbilityEventType, type AbilityStatic } from '../../abilities/Ability';
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

/**
 * Snap an in-progress cast to the start of its cooldown interval (no refund).
 * Clears cast payload / behaviours so windup/active effects do not continue.
 */
function skipActiveAbilityToCooldown(
    unit: Unit,
    active: ActiveAbility,
    ability: AbilityStatic,
    engine: { gameTime: number },
    engineForCleanup?: EngineContext,
): boolean {
    const intervals = normalizeAbilityTimingsToIntervals(
        resolveAbilityTimingEntries(ability, unit, engineForCleanup ?? engine),
    );
    const cooldown = findCooldownInterval(intervals);
    if (!cooldown) return false;
    if (engineForCleanup) {
        cleanupCastBehavioursForAbility(unit, active, engineForCleanup);
    }
    active.startTime = engine.gameTime - cooldown.start;
    active.castPayload = undefined;
    active.castBehaviourPayloads = {};
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

export function interruptAndRefundUnitAbilities(unit: Unit, engine: EngineContext): void {
    const kept: ActiveAbility[] = [];
    for (const active of unit.activeAbilities) {
        const ability = getAbility(active.abilityId);
        if (!ability) continue;
        const elapsed = Math.max(0, engine.gameTime - active.startTime);
        const intervals = normalizeAbilityTimingsToIntervals(
            resolveAbilityTimingEntries(ability, unit, engine),
        );
        const phase = getCoveringAbilityPhaseAtElapsed(elapsed, intervals);

        if (isCooldownPhase(phase)) {
            kept.push(active);
            continue;
        }

        if (
            ability.skipToCooldownOnInterrupt
            && findCooldownInterval(intervals)
        ) {
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
            skipActiveAbilityToCooldown(unit, active, ability, engine, engine);
            kept.push(active);
            continue;
        }

        refundAbilityCost(unit, ability, elapsed);
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
        cleanupCastBehavioursForAbility(unit, active, engine);
    }
    unit.activeAbilities = kept;
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

/** Interrupt all active abilities (e.g. when stunned). Refunds resource costs unless skipped to cooldown. */
export function interruptAllUnitAbilities(unit: Unit, engine: { gameTime: number }): void {
    const kept: ActiveAbility[] = [];
    for (const active of unit.activeAbilities) {
        const ability = getAbility(active.abilityId);
        if (!ability) continue;
        const elapsed = Math.max(0, engine.gameTime - active.startTime);
        const intervals = normalizeAbilityTimingsToIntervals(
            resolveAbilityTimingEntries(ability, unit, engine),
        );
        const phase = getCoveringAbilityPhaseAtElapsed(elapsed, intervals);

        if (isCooldownPhase(phase)) {
            kept.push(active);
            continue;
        }

        if (ability.skipToCooldownOnInterrupt && skipActiveAbilityToCooldown(unit, active, ability, engine)) {
            kept.push(active);
            continue;
        }

        refundAbilityCost(unit, ability, elapsed);
    }
    unit.activeAbilities = kept;
    unit.clearAbilityNote();
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
