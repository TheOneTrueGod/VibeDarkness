import type { Unit } from '../../../game/units/Unit';

const EARTH_CORE_ARMOUR_KEY = 'earthCoreArmour';

export function getEarthCoreArmour(unit: Unit): number {
    const raw = unit.aiContext?.[EARTH_CORE_ARMOUR_KEY];
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

export function addEarthCoreArmour(unit: Unit, amount: number): number {
    if (amount <= 0) return getEarthCoreArmour(unit);
    const next = getEarthCoreArmour(unit) + Math.floor(amount);
    unit.aiContext[EARTH_CORE_ARMOUR_KEY] = next;
    return next;
}

export function spendEarthCoreArmour(unit: Unit, amount: number): number {
    const current = getEarthCoreArmour(unit);
    const spent = Math.max(0, Math.min(current, Math.floor(amount)));
    unit.aiContext[EARTH_CORE_ARMOUR_KEY] = current - spent;
    return spent;
}

export function spendAllEarthCoreArmour(unit: Unit): number {
    const current = getEarthCoreArmour(unit);
    unit.aiContext[EARTH_CORE_ARMOUR_KEY] = 0;
    return current;
}
