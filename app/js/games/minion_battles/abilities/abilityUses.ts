import type { AbilityStatic } from './Ability';
import type { Unit } from '../game/units/Unit';
import { STICK_SWORD_NODE_EXTRA_USES, STICK_SWORD_TREE_ID } from '../../../researchTrees/trees/stick_sword';

export type RecoveryChargeType = 'staminaCharge' | 'lightCharge';

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
    '0101': { maxUses: 1, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 }] }, // Dodge
    '0102': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Punch
    '0103': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 2 }] }, // Swing Bat
    throw_rock: { maxUses: 3, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] },
    '0501': { maxUses: 1, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 }] }, // Throw Torch
    throw_charged_rock: { maxUses: 3, recoveries: [{ chargeType: 'lightCharge', chargesPerRecovery: 1, usesRecovered: 1 }] },
    '0110': { maxUses: 1, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Shining Block
    '0105': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Laser Sword
    '0112': { maxUses: 2, recoveries: [{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 }] }, // Swing Sword
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

export function initializeAbilityRuntimeForUnit(unit: Unit): void {
    for (const abilityId of unit.abilities) {
        ensureAbilityRuntimeState(unit, abilityId);
    }
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

    const notedAbilities = unit.abilities
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
        const idx = notedAbilities.length === 1 ? 0 : pickRandomInteger(0, notedAbilities.length - 1);
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

    return Array.from(new Set(selectedAbilityIds));
}

function getRelevantRulesForCharge(abilityId: string, chargeType: RecoveryChargeType): AbilityRecoveryRule[] {
    return getAbilityUseConfig(abilityId).recoveries.filter((r) => r.chargeType === chargeType);
}

function applyRecoveryChargeToAbility(unit: Unit, abilityId: string, chargeType: RecoveryChargeType, amount: number): boolean {
    if (amount <= 0) return false;
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime) return false;
    const relevantRules = getRelevantRulesForCharge(abilityId, chargeType);
    if (relevantRules.length === 0) return false;

    if (chargeType === 'staminaCharge' && runtime.currentUses >= runtime.maxUses) {
        return false;
    }

    const prevUses = runtime.currentUses;
    const prevCharge = runtime.recoveryChargesByType[chargeType] ?? 0;
    let chargePool = prevCharge + amount;
    const maxChargeBuffer = Math.max(0, ...relevantRules.map((rule) => Math.max(0, rule.chargesPerRecovery - 1)));

    if (runtime.currentUses >= runtime.maxUses) {
        runtime.recoveryChargesByType[chargeType] = Math.min(maxChargeBuffer, chargePool);
        return runtime.recoveryChargesByType[chargeType] !== prevCharge;
    }

    for (const rule of relevantRules) {
        if (rule.chargesPerRecovery <= 0 || rule.usesRecovered <= 0) continue;
        const recoverSteps = Math.floor(chargePool / rule.chargesPerRecovery);
        if (recoverSteps <= 0) continue;
        chargePool -= recoverSteps * rule.chargesPerRecovery;
        const recoveredUses = recoverSteps * rule.usesRecovered;
        runtime.currentUses = Math.min(runtime.maxUses, runtime.currentUses + recoveredUses);
    }

    runtime.recoveryChargesByType[chargeType] = Math.min(maxChargeBuffer, chargePool);
    return runtime.currentUses !== prevUses || runtime.recoveryChargesByType[chargeType] !== prevCharge;
}

export function canAbilityReceiveRecoveryCharge(unit: Unit, abilityId: string, chargeType: RecoveryChargeType): boolean {
    const rules = getRelevantRulesForCharge(abilityId, chargeType);
    if (rules.length === 0) return false;
    ensureAbilityRuntimeState(unit, abilityId);
    const runtime = unit.abilityRuntime[abilityId];
    if (!runtime) return false;
    if (chargeType === 'staminaCharge' && runtime.currentUses >= runtime.maxUses) return false;
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
    const eligible = unit.abilities.filter((abilityId) => {
        if (opts?.excludeAbilityId && abilityId === opts.excludeAbilityId) return false;
        return canAbilityReceiveRecoveryCharge(unit, abilityId, chargeType);
    });
    if (eligible.length === 0) return false;
    const idx = eligible.length === 1 ? 0 : generateRandomInteger(0, eligible.length - 1);
    const selected = eligible[idx];
    if (!selected) return false;
    return applyRecoveryChargeToAbility(unit, selected, chargeType, 1);
}
