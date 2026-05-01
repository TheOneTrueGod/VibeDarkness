import type { Unit } from '../game/units/Unit';

const EARTH_CORE_ARMOUR_SOURCES_KEY = 'earthCoreArmourSources';

type ArmourSources = Record<string, number>;

export interface ArmourGrantResult {
    granted: number;
    blockedByCap: number;
    sourceTotal: number;
    totalArmour: number;
}

export interface ArmourDamageResult {
    incomingDamage: number;
    absorbedDamage: number;
    remainingDamage: number;
    armourRemoved: number;
    totalArmourAfter: number;
}

function getArmourSources(unit: Unit): ArmourSources {
    const existing = unit.aiContext[EARTH_CORE_ARMOUR_SOURCES_KEY];
    if (!existing || typeof existing !== 'object') {
        unit.aiContext[EARTH_CORE_ARMOUR_SOURCES_KEY] = {};
    }
    return unit.aiContext[EARTH_CORE_ARMOUR_SOURCES_KEY] as ArmourSources;
}

export function getEarthCoreArmour(unit: Unit): number {
    const sources = getArmourSources(unit);
    return Object.values(sources).reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function computeDiminishedArmourGain(currentArmourFromSource: number, requestedGain: number, sourceMax: number): number {
    // TODO: Replace with shared armour-source helper once available.
    if (sourceMax <= currentArmourFromSource) return 0;
    return Math.max(0, Math.min(requestedGain, sourceMax - currentArmourFromSource));
}

export function grantEarthCoreArmourFromSource(
    unit: Unit,
    sourceId: string,
    amount: number,
    sourceMax: number,
): ArmourGrantResult {
    const sources = getArmourSources(unit);
    const current = Math.max(0, sources[sourceId] ?? 0);
    const granted = computeDiminishedArmourGain(current, amount, sourceMax);
    sources[sourceId] = current + granted;
    const sourceTotal = sources[sourceId];
    return {
        granted,
        blockedByCap: Math.max(0, amount - granted),
        sourceTotal,
        totalArmour: getEarthCoreArmour(unit),
    };
}

export function consumeEarthCoreArmour(unit: Unit, amount: number): number {
    let remaining = Math.max(0, amount);
    if (remaining <= 0) return 0;
    const sources = getArmourSources(unit);
    for (const sourceId of Object.keys(sources)) {
        if (remaining <= 0) break;
        const current = Math.max(0, sources[sourceId] ?? 0);
        const spent = Math.min(current, remaining);
        if (spent <= 0) continue;
        sources[sourceId] = current - spent;
        remaining -= spent;
    }
    return Math.max(0, amount - remaining);
}

export function applyDamageToEarthCoreArmour(unit: Unit, incomingDamage: number): ArmourDamageResult {
    const damage = Math.max(0, incomingDamage);
    const absorbedDamage = consumeEarthCoreArmour(unit, damage);
    const remainingDamage = Math.max(0, damage - absorbedDamage);
    return {
        incomingDamage: damage,
        absorbedDamage,
        remainingDamage,
        armourRemoved: absorbedDamage,
        totalArmourAfter: getEarthCoreArmour(unit),
    };
}
