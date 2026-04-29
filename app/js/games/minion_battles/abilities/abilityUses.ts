import { abilityHasTag, type AbilityStatic } from './Ability';
import type { Unit } from '../game/units/Unit';
import { STICK_SWORD_NODE_EXTRA_USES, STICK_SWORD_TREE_ID } from '../../../researchTrees/trees/stick_sword';
import { TRAINING_NODE_CHARGING_PUNCH, TRAINING_TREE_ID } from '../../../researchTrees/trees/training';
import { getAbility } from './AbilityRegistry';

export type RecoveryChargeType = 'staminaCharge' | 'lightCharge' | 'energyCharge' | 'roundCharge';

export interface AbilityRecoveryRule {
    chargeType: RecoveryChargeType;
    chargesPerRecovery: number;
    usesRecovered: number;
}

export interface AbilityUseConfig {
    maxUses: number;
    startingUses?: number;
    recoveries: AbilityRecoveryRule[];
}

const DEFAULT_USE_CONFIG: AbilityUseConfig = {
    maxUses: 1,
    recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
};

const ABILITY_USE_CONFIGS: Record<string, AbilityUseConfig> = {
    '0003': { maxUses: 4, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Dark Wolf Bite
    '0101': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 }] }, // Dodge
    '0102': { maxUses: 4, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 }] }, // Punch
    '0103': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 2 }] }, // Swing Bat
    throw_rock: { maxUses: 6, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] },
    throw_knife: { maxUses: 5, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] },
    '0501': { maxUses: 1, recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Throw Torch
    throw_charged_rock: { maxUses: 3, recoveries: [{ chargeType: 'lightCharge', chargesPerRecovery: 1, usesRecovered: 1 }] },
    '0110': { maxUses: 1, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Shining Block
    '0105': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Laser Sword
    '0112': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Swing Sword
    '0113': { maxUses: 1, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Absorption Shield
    '0114': { maxUses: 2, startingUses: 0, recoveries: [{ chargeType: 'energyCharge', chargesPerRecovery: 3, usesRecovered: 1 }] }, // Energy Blast
    '0203': { maxUses: 3, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Pistol
    '0204': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // SMG
    '0205': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Shotgun
};

export function getAbilityUseConfig(abilityId: string): AbilityUseConfig {
    return ABILITY_USE_CONFIGS[abilityId] ?? DEFAULT_USE_CONFIG;
}

export function ensureAbilityRuntimeState(unit: Unit, abilityId: string): void {
    if (unit.abilityRuntime[abilityId]) return;
    const config = getAbilityUseConfig(abilityId);
    unit.abilityRuntime[abilityId] = {
        maxUses: config.maxUses,
        currentUses: config.startingUses ?? config.maxUses,
        recoveryChargesByType: {},
    };
}

const SWING_SWORD_ABILITY_ID = '0112';
const SWING_SWORD_EXTRA_USES = 2;
const THROW_ROCK_ABILITY_ID = 'throw_rock';
const THROW_CHARGED_ROCK_ABILITY_ID = 'throw_charged_rock';
const THROW_ROCK_USES_PENALTY_WITH_CHARGED = 3;
const PUNCH_ABILITY_ID = '0102';
const PUNCH_CHARGING_RESEARCH_USES_PENALTY = 1;

/** Sword Conditioning research: +max uses for Swing Sword (base config is still 2). */
export function applyStickSwordResearchToAbilityRuntime(
    unit: Unit,
    getResearchNodes: (treeId: string) => string[],
): void {
    const nodes = getResearchNodes(STICK_SWORD_TREE_ID);
    if (!nodes.includes(STICK_SWORD_NODE_EXTRA_USES)) return;
    if (!unit.abilities.includes(SWING_SWORD_ABILITY_ID)) return;
    ensureAbilityRuntimeState(unit, SWING_SWORD_ABILITY_ID);
    const runtime = unit.abilityRuntime[SWING_SWORD_ABILITY_ID];
    if (!runtime) return;
    runtime.maxUses += SWING_SWORD_EXTRA_USES;
    runtime.currentUses += SWING_SWORD_EXTRA_USES;
}

/** Throw Rock loses max uses while Throw Charged Rock is equipped. */
function applyThrowRockUsePenaltyForChargedRock(unit: Unit): void {
    if (!unit.abilities.includes(THROW_CHARGED_ROCK_ABILITY_ID)) return;
    if (!unit.abilities.includes(THROW_ROCK_ABILITY_ID)) return;
    ensureAbilityRuntimeState(unit, THROW_ROCK_ABILITY_ID);
    const runtime = unit.abilityRuntime[THROW_ROCK_ABILITY_ID];
    if (!runtime) return;
    runtime.maxUses = Math.max(0, runtime.maxUses - THROW_ROCK_USES_PENALTY_WITH_CHARGED);
    runtime.currentUses = Math.min(runtime.currentUses, runtime.maxUses);
}

/** Training(Charging Punch): Punch has fewer max uses. */
export function applyTrainingResearchToAbilityRuntime(
    unit: Unit,
    getResearchNodes: (treeId: string) => string[],
): void {
    const nodes = getResearchNodes(TRAINING_TREE_ID);
    if (!nodes.includes(TRAINING_NODE_CHARGING_PUNCH)) return;
    if (!unit.abilities.includes(PUNCH_ABILITY_ID)) return;
    ensureAbilityRuntimeState(unit, PUNCH_ABILITY_ID);
    const runtime = unit.abilityRuntime[PUNCH_ABILITY_ID];
    if (!runtime) return;
    runtime.maxUses = Math.max(0, runtime.maxUses - PUNCH_CHARGING_RESEARCH_USES_PENALTY);
    runtime.currentUses = Math.min(runtime.currentUses, runtime.maxUses);
}

export function initializeAbilityRuntimeForUnit(unit: Unit): void {
    for (const abilityId of unit.abilities) {
        ensureAbilityRuntimeState(unit, abilityId);
    }
    applyThrowRockUsePenaltyForChargedRock(unit);
    syncNestedCardAbilityState(unit);
}

export function canUseAbilityNow(unit: Unit, ability: AbilityStatic): boolean {
    ensureAbilityRuntimeState(unit, ability.id);
    return (unit.abilityRuntime[ability.id]?.currentUses ?? 0) > 0;
}

export function consumeAbilityUse(unit: Unit, abilityId: string): boolean {
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime || runtime.currentUses <= 0) return false;
    runtime.currentUses -= 1;
    syncNestedCardAbilityState(unit);
    return true;
}

export function addRecoveryChargeToUnitAbilities(
    unit: Unit,
    chargeType: RecoveryChargeType,
    amount: number,
    generateRandomInteger?: (min: number, max: number) => number,
): string[] {
    if (amount <= 0) return [];
    const pickRandomInteger =
        generateRandomInteger ??
        ((min: number, max: number): number => {
            if (max < min) return min;
            const span = max - min + 1;
            return min + Math.floor(Math.random() * span);
        });

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
        const idx = pickRecoveryChargeRecipientIndex(notedAbilities, pickRandomInteger);
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
    return Array.from(new Set(selectedAbilityIds));
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
    opts?: { excludeAbilityId?: string },
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
    return applyRecoveryChargeToAbility(unit, selected, chargeType, 1);
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

/** One roundCharge per eligible ability at round start (not random pool distribution). */
export function grantRoundChargesToEligibleAbilities(unit: Unit): void {
    const roundChargeAbilityIds = unit.abilities.filter((abilityId) =>
        getAbilityUseConfig(abilityId).recoveries.some((r) => r.chargeType === 'roundCharge'),
    );
    for (const abilityId of roundChargeAbilityIds) {
        if (!canAbilityReceiveRecoveryCharge(unit, abilityId, 'roundCharge')) continue;
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
