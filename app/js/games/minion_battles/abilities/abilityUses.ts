import {
    abilityHasTag,
    type AbilityRecoveryRule,
    type AbilityStatic,
    type AbilityTag,
    type RecoveryChargeType,
} from './Ability';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import {
    STICK_SWORD_NODE_EXTRA_USES,
    STICK_SWORD_TREE_ID,
} from '../../../researchTrees/trees/stick_sword';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';
import { getAbility } from './AbilityRegistry';
import type { AbilityModifier } from '../../../researchTrees/types';
import { evaluateSwapTriggers } from './abilitySwap';

export type { RecoveryChargeType, AbilityRecoveryRule };

export interface AbilityUseConfig {
    maxUses: number;
    startingUses?: number;
    recoveries: AbilityRecoveryRule[];
}

const DEFAULT_USE_CONFIG: AbilityUseConfig = {
    maxUses: 1,
    recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
};

export function getAbilityUseConfig(abilityId: string): AbilityUseConfig {
    const ability = getAbility(abilityId);
    if (!ability) return DEFAULT_USE_CONFIG;
    return {
        maxUses: ability.getMaxUses?.() ?? ability.maxUses ?? DEFAULT_USE_CONFIG.maxUses,
        startingUses: ability.startingUses,
        recoveries: [...(ability.recoveries ?? DEFAULT_USE_CONFIG.recoveries)],
    };
}

export function ensureAbilityRuntimeState(unit: Unit, abilityId: string): void {
    if (unit.abilityRuntime[abilityId]) return;
    const config = getAbilityUseConfig(abilityId);
    const ability = getAbility(abilityId);
    unit.abilityRuntime[abilityId] = {
        maxUses: config.maxUses,
        currentUses: config.startingUses ?? config.maxUses,
        recoveryChargesByType: {},
        active: !ability?.swapConfig,   // abilities with swapConfig start hidden
        replacedAbilityId: null,
    };
}

const SWING_SWORD_ABILITY_ID = '0112';
const SWING_BAT_ABILITY_ID = '0115';
export const SWING_EXTRA_USES = 2;
const THROW_ROCK_ABILITY_ID = 'throw_rock';
const CRYSTAL_ROCKS_NODE_CHARGED_ROCKS = 'charged_rocks';
const THROW_ROCK_USES_PENALTY_WITH_CHARGED = 3;
/** Iron Wrists research: +max uses for whichever weapon the unit carries (sword or bat path). */
export function applyStickSwordResearchToAbilityRuntime(
    unit: Unit,
    getResearchNodes: (treeId: string) => string[],
): void {
    const nodes = getResearchNodes(STICK_SWORD_TREE_ID);
    if (!nodes.includes(STICK_SWORD_NODE_EXTRA_USES)) return;

    for (const abilityId of [SWING_SWORD_ABILITY_ID, SWING_BAT_ABILITY_ID]) {
        if (!unit.abilities.includes(abilityId)) continue;
        ensureAbilityRuntimeState(unit, abilityId);
        const runtime = unit.abilityRuntime[abilityId];
        if (!runtime) continue;
        runtime.maxUses += SWING_EXTRA_USES;
        runtime.currentUses += SWING_EXTRA_USES;
    }
}

/** Charged Rocks research: Throw Rock has fewer max uses. */
export function applyCrystalRocksResearchToAbilityRuntime(
    unit: Unit,
    getResearchNodes: (treeId: string) => string[],
): void {
    const nodes = getResearchNodes(CRYSTAL_ROCKS_TREE_ID);
    if (!nodes.includes(CRYSTAL_ROCKS_NODE_CHARGED_ROCKS)) return;
    if (!unit.abilities.includes(THROW_ROCK_ABILITY_ID)) return;
    ensureAbilityRuntimeState(unit, THROW_ROCK_ABILITY_ID);
    const runtime = unit.abilityRuntime[THROW_ROCK_ABILITY_ID];
    if (!runtime) return;
    runtime.maxUses = Math.max(0, runtime.maxUses - THROW_ROCK_USES_PENALTY_WITH_CHARGED);
    runtime.currentUses = Math.min(runtime.currentUses, runtime.maxUses);
}


/** Applies maxUsesFlat from ability research modifiers to an already-initialized abilityRuntime. Call after initializeAbilityRuntimeForUnit. */
export function applyAbilityResearchModifiersToRuntime(
    unit: Unit,
    abilityModifiers: Record<string, AbilityModifier>,
): void {
    for (const [abilityId, modifier] of Object.entries(abilityModifiers)) {
        if (!modifier.maxUsesFlat) continue;
        if (!unit.abilityRuntime[abilityId]) continue;
        const runtime = unit.abilityRuntime[abilityId];
        const delta = modifier.maxUsesFlat;
        runtime.maxUses = Math.max(0, runtime.maxUses + delta);
        runtime.currentUses = Math.max(0, runtime.currentUses + delta);
    }
}

/** Like abilityHasTag but also checks tags added via the unit's abilityModifiers (e.g. from research). */
export function unitAbilityHasTag(unit: Unit, abilityId: string, tag: string): boolean {
    if (abilityHasTag(abilityId, tag as AbilityTag)) return true;
    return unit.abilityModifiers[abilityId]?.addTags?.includes(tag) ?? false;
}

export function initializeAbilityRuntimeForUnit(unit: Unit): void {
    for (const abilityId of unit.abilities) {
        ensureAbilityRuntimeState(unit, abilityId);
    }
    syncNestedCardAbilityState(unit);
}

export function canUseAbilityNow(unit: Unit, ability: AbilityStatic): boolean {
    ensureAbilityRuntimeState(unit, ability.id);
    return (unit.abilityRuntime[ability.id]?.currentUses ?? 0) > 0;
}

/** Returns false if the unit is missing any requiredTags or has any forbiddenTags for this ability. */
export function meetsTagRequirements(unit: Unit, ability: AbilityStatic): boolean {
    if (ability.requiredTags?.some((t) => !unit.tags.includes(t))) return false;
    if (ability.forbiddenTags?.some((t) => unit.tags.includes(t))) return false;
    return true;
}

export function consumeAbilityUse(unit: Unit, abilityId: string, eventBus?: EventBus): boolean {
    if (abilityHasTag(abilityId, 'free')) return true;
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime || runtime.currentUses <= 0) return false;
    runtime.currentUses -= 1;
    if (runtime.currentUses === 0) {
        evaluateSwapTriggers(unit, { type: 'abilityExhausted', abilityId }, eventBus);
    }
    syncNestedCardAbilityState(unit);
    return true;
}

/** Restore one use when a cast is cancelled before natural completion (e.g. conditional-cancel switch). */
export function refundAbilityUse(unit: Unit, abilityId: string): void {
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime) return;
    runtime.currentUses = Math.min(runtime.maxUses, runtime.currentUses + 1);
    syncNestedCardAbilityState(unit);
}

export function addRecoveryChargeToUnitAbilities(
    unit: Unit,
    chargeType: RecoveryChargeType,
    amount: number,
    generateRandomInteger: (min: number, max: number) => number,
    eventBus?: EventBus,
): string[] {
    if (amount <= 0) return [];

    const notedAbilities = getAbilityIdsEligibleForRecovery(unit)
        .map((abilityId) => ({
            abilityId,
            canAcceptRecoveryCharge: (type: RecoveryChargeType): boolean =>
                canAbilityReceiveRecoveryCharge(unit, abilityId, type),
        }))
        .filter((ability) => ability.canAcceptRecoveryCharge(chargeType));

    if (notedAbilities.length === 0) return [];
    const selectedAbilityIds: string[] = [];

    for (let count = 1; count <= amount; count++) {
        if (notedAbilities.length === 0) break;
        const idx = pickRecoveryChargeRecipientIndex(notedAbilities, generateRandomInteger);
        const selected = notedAbilities[idx];
        if (!selected) break;
        const changed = applyRecoveryChargeToAbility(unit, selected.abilityId, chargeType, 1);
        if (!changed) {
            notedAbilities.splice(idx, 1);
            continue;
        }
        selectedAbilityIds.push(selected.abilityId);

        if (!selected.canAcceptRecoveryCharge(chargeType)) {
            notedAbilities.splice(idx, 1);
        }
    }

    syncNestedCardAbilityState(unit);
    const unique = Array.from(new Set(selectedAbilityIds));
    if (unique.length > 0 && eventBus) {
        eventBus.emit('recovery_charge_granted', { unitId: unit.id, chargeType, amount: selectedAbilityIds.length });
    }
    return unique;
}

/**
 * Grant the same charge amount to every ability that can accept it (not pooled or randomly split).
 * Used for surge effects where every ability benefits simultaneously.
 */
export function applyChargeSurgeToUnit(unit: Unit, chargeType: RecoveryChargeType, amount: number, eventBus?: EventBus): void {
    if (amount <= 0) return;
    const abilityIds = getAbilityIdsEligibleForRecovery(unit);
    let anyGranted = false;
    for (const abilityId of abilityIds) {
        if (!canAbilityReceiveRecoveryCharge(unit, abilityId, chargeType)) continue;
        const changed = applyRecoveryChargeToAbility(unit, abilityId, chargeType, amount);
        if (changed) anyGranted = true;
    }
    syncNestedCardAbilityState(unit);
    if (anyGranted && eventBus) {
        eventBus.emit('recovery_charge_granted', { unitId: unit.id, chargeType, amount });
    }
}

/** Round-start stamina surge: grant the same stamina charge amount to every eligible ability. */
export function applyStaminaSurgeToUnit(unit: Unit, surgeAmount: number): void {
    applyChargeSurgeToUnit(unit, 'staminaCharge', surgeAmount);
}

/**
 * Prefer abilities tagged `priority` when several can accept the same recovery charge.
 */
function pickRecoveryChargeRecipientIndex(
    notedAbilities: { abilityId: string }[],
    pickRandomInteger: (min: number, max: number) => number,
): number {
    const priorityIndices: number[] = [];
    const otherIndices: number[] = [];
    for (let i = 0; i < notedAbilities.length; i++) {
        const { abilityId } = notedAbilities[i]!;
        if (abilityHasTag(abilityId, 'priority')) priorityIndices.push(i);
        else otherIndices.push(i);
    }
    const pool = priorityIndices.length > 0 ? priorityIndices : otherIndices;
    if (pool.length === 1) return pool[0]!;
    const j = pickRandomInteger(0, pool.length - 1);
    return pool[j]!;
}

function getRelevantRulesForCharge(abilityId: string, chargeType: RecoveryChargeType): AbilityRecoveryRule[] {
    return getAbilityUseConfig(abilityId).recoveries.filter((r) => r.chargeType === chargeType);
}

function getMaxChargeBufferForType(abilityId: string, chargeType: RecoveryChargeType): number {
    const rules = getRelevantRulesForCharge(abilityId, chargeType);
    return Math.max(0, ...rules.map((rule) => Math.max(0, rule.chargesPerRecovery - 1)));
}

function applyRecoveryChargeToAbility(unit: Unit, abilityId: string, chargeType: RecoveryChargeType, amount: number): boolean {
    if (amount <= 0) return false;
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime) return false;
    const config = getAbilityUseConfig(abilityId);
    const relevantRules = config.recoveries.filter((r) => r.chargeType === chargeType);
    if (relevantRules.length === 0) return false;

    const prevUses = runtime.currentUses;
    const prevCharges = { ...runtime.recoveryChargesByType };
    const maxChargeBufferForType = getMaxChargeBufferForType(abilityId, chargeType);
    const currentForType = runtime.recoveryChargesByType[chargeType] ?? 0;
    runtime.recoveryChargesByType[chargeType] = Math.min(maxChargeBufferForType + amount, currentForType + amount);

    if (runtime.currentUses >= runtime.maxUses) {
        for (const rule of config.recoveries) {
            const type = rule.chargeType;
            const typeBuffer = getMaxChargeBufferForType(abilityId, type);
            const current = runtime.recoveryChargesByType[type] ?? 0;
            runtime.recoveryChargesByType[type] = Math.min(typeBuffer, current);
        }
        const changed =
            runtime.currentUses !== prevUses
            || JSON.stringify(runtime.recoveryChargesByType) !== JSON.stringify(prevCharges)
        ;
        if (changed) syncNestedCardAbilityState(unit);
        return changed;
    }

    if (config.recoveries.length === 1) {
        const onlyRule = config.recoveries[0];
        if (!onlyRule || onlyRule.chargesPerRecovery <= 0 || onlyRule.usesRecovered <= 0) {
            const changed = runtime.currentUses !== prevUses || JSON.stringify(runtime.recoveryChargesByType) !== JSON.stringify(prevCharges);
            if (changed) syncNestedCardAbilityState(unit);
            return changed;
        }
        const currentCharge = runtime.recoveryChargesByType[onlyRule.chargeType] ?? 0;
        const recoverSteps = Math.floor(currentCharge / onlyRule.chargesPerRecovery);
        if (recoverSteps > 0) {
            const recoveredUses = recoverSteps * onlyRule.usesRecovered;
            runtime.currentUses = Math.min(runtime.maxUses, runtime.currentUses + recoveredUses);
            const spentCharges = recoverSteps * onlyRule.chargesPerRecovery;
            runtime.recoveryChargesByType[onlyRule.chargeType] = Math.max(0, currentCharge - spentCharges);
        }
    } else {
        const validRules = config.recoveries.filter((rule) => rule.chargesPerRecovery > 0 && rule.usesRecovered > 0);
        if (validRules.length > 0) {
            const availableCycles = validRules.map((rule) => {
                const currentCharge = runtime.recoveryChargesByType[rule.chargeType] ?? 0;
                return Math.floor(currentCharge / rule.chargesPerRecovery);
            });
            const recoverCycles = Math.min(...availableCycles);
            if (recoverCycles > 0) {
                const usesRecoveredPerCycle = Math.min(...validRules.map((rule) => rule.usesRecovered));
                const totalRecovered = recoverCycles * usesRecoveredPerCycle;
                runtime.currentUses = Math.min(runtime.maxUses, runtime.currentUses + totalRecovered);
                for (const rule of validRules) {
                    const currentCharge = runtime.recoveryChargesByType[rule.chargeType] ?? 0;
                    const spent = recoverCycles * rule.chargesPerRecovery;
                    runtime.recoveryChargesByType[rule.chargeType] = Math.max(0, currentCharge - spent);
                }
            }
        }
    }

    for (const rule of config.recoveries) {
        const type = rule.chargeType;
        const typeBuffer = getMaxChargeBufferForType(abilityId, type);
        const current = runtime.recoveryChargesByType[type] ?? 0;
        if (runtime.currentUses >= runtime.maxUses) {
            runtime.recoveryChargesByType[type] = Math.min(typeBuffer, current);
        } else {
            runtime.recoveryChargesByType[type] = Math.min(typeBuffer + rule.chargesPerRecovery, current);
        }
    }
    const changed = runtime.currentUses !== prevUses || JSON.stringify(runtime.recoveryChargesByType) !== JSON.stringify(prevCharges);
    if (changed) syncNestedCardAbilityState(unit);
    return changed;
}

/** Grant a recovery charge directly to a specific ability on a unit (bypasses random distribution). */
export function grantRecoveryChargeToAbility(unit: Unit, abilityId: string, chargeType: RecoveryChargeType, amount: number): void {
    applyRecoveryChargeToAbility(unit, abilityId, chargeType, amount);
}

export function canAbilityReceiveRecoveryCharge(unit: Unit, abilityId: string, chargeType: RecoveryChargeType): boolean {
    const config = getAbilityUseConfig(abilityId);
    const rules = config.recoveries.filter((rule) => rule.chargeType === chargeType);
    if (rules.length === 0) return false;
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime) return false;
    const charge = runtime.recoveryChargesByType[chargeType] ?? 0;
    const maxChargeBuffer = Math.max(0, ...rules.map((rule) => Math.max(0, rule.chargesPerRecovery - 1)));
    if (runtime.currentUses < runtime.maxUses) return true;
    return charge < maxChargeBuffer;
}

export function grantRecoveryChargeToRandomAbility(
    unit: Unit,
    chargeType: RecoveryChargeType,
    generateRandomInteger: (min: number, max: number) => number,
    opts?: { excludeAbilityId?: string; eventBus?: EventBus },
): boolean {
    const eligible = getAbilityIdsEligibleForRecovery(unit).filter((abilityId) => {
        if (opts?.excludeAbilityId && abilityId === opts.excludeAbilityId) return false;
        return canAbilityReceiveRecoveryCharge(unit, abilityId, chargeType);
    });
    if (eligible.length === 0) return false;
    const priorityEligible = eligible.filter((abilityId) => abilityHasTag(abilityId, 'priority'));
    const pool = priorityEligible.length > 0 ? priorityEligible : eligible;
    const idx = pool.length === 1 ? 0 : generateRandomInteger(0, pool.length - 1);
    const selected = pool[idx];
    if (!selected) return false;
    const granted = applyRecoveryChargeToAbility(unit, selected, chargeType, 1);
    if (granted && opts?.eventBus) {
        opts.eventBus.emit('recovery_charge_granted', { unitId: unit.id, chargeType, amount: 1, abilityId: selected });
    }
    return granted;
}

function getAbilityIdsEligibleForRecovery(unit: Unit): string[] {
    const visibleAbilityIds = [...unit.abilities];
    const allAbilityIds = new Set<string>(visibleAbilityIds);
    const parentAbilityIds = Object.keys(unit.abilityRuntime);
    for (const abilityId of visibleAbilityIds) {
        for (const parentAbilityId of parentAbilityIds) {
            const parentAbility = getAbility(parentAbilityId);
            if (parentAbility?.keywords?.nestedCard?.fallbackAbilityId !== abilityId) continue;
            allAbilityIds.add(parentAbilityId);
        }
    }
    return [...allAbilityIds];
}

/** Abilities that will receive a roundCharge at round start (pre-recovery snapshot). */
export function getRoundChargeEligibleAbilityIds(unit: Unit): string[] {
    return unit.abilities.filter((abilityId) =>
        canAbilityReceiveRecoveryCharge(unit, abilityId, 'roundCharge'),
    );
}

/** Abilities that will receive stamina surge charges at round start (pre-recovery snapshot). */
export function getStaminaSurgeEligibleAbilityIds(unit: Unit): string[] {
    return getAbilityIdsEligibleForRecovery(unit).filter((abilityId) =>
        canAbilityReceiveRecoveryCharge(unit, abilityId, 'staminaCharge'),
    );
}

/** One roundCharge per eligible ability at round start (not random pool distribution). */
export function grantRoundChargesToEligibleAbilities(unit: Unit): void {
    const roundChargeAbilityIds = getRoundChargeEligibleAbilityIds(unit);
    for (const abilityId of roundChargeAbilityIds) {
        applyRecoveryChargeToAbility(unit, abilityId, 'roundCharge', 1);
    }
    syncNestedCardAbilityState(unit);
}

function canAbilityAppearAsNestedParent(unit: Unit, abilityId: string): boolean {
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    return (runtime?.currentUses ?? 0) > 0;
}

/**
 * Keep runtime nested-card slots synchronized with ability uses/charge recovery.
 * Parent abilities swap to fallback at 0 uses and swap back once parent is usable.
 */
export function syncNestedCardAbilityState(unit: Unit): void {
    for (let idx = 0; idx < unit.abilities.length; idx++) {
        const abilityId = unit.abilities[idx];
        if (!abilityId) continue;
        const ability = getAbility(abilityId);
        const fallbackAbilityId = ability?.keywords?.nestedCard?.fallbackAbilityId;
        if (fallbackAbilityId) {
            if (!canAbilityAppearAsNestedParent(unit, abilityId)) {
                unit.abilities[idx] = fallbackAbilityId;
                ensureAbilityRuntimeState(unit, fallbackAbilityId);
            }
            continue;
        }

        for (const parentAbilityId of Object.keys(unit.abilityRuntime)) {
            const parentAbility = getAbility(parentAbilityId);
            if (parentAbility?.keywords?.nestedCard?.fallbackAbilityId !== abilityId) continue;
            if (!canAbilityAppearAsNestedParent(unit, parentAbilityId)) continue;
            unit.abilities[idx] = parentAbilityId;
            break;
        }
    }
}
