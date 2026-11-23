import type { Unit } from './Unit';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../buffs/ShieldBuff';

export interface ShieldDamageResult {
    /** Damage absorbed by shield buffs before reaching armour/HP. */
    shieldAbsorbed: number;
    /** Damage left over after shields, to continue through armour/HP. */
    remainingDamage: number;
    /** Shields that absorbed part of this hit, in consumption order. */
    absorbingShields: ShieldBuff[];
}

/**
 * Consume incoming damage against a unit's active `ShieldBuff`s (array order), mirroring
 * `applyDamageToEarthCoreArmour`'s shape. Depleted shields need no explicit removal here —
 * `ShieldBuff.isExpired` returning true once `remainingHp<=0` means the existing per-tick
 * sweep in `unitMovementTick.ts` removes them naturally.
 */
export function applyDamageToShields(unit: Unit, incomingDamage: number): ShieldDamageResult {
    let remaining = Math.max(0, incomingDamage);
    let shieldAbsorbed = 0;
    const absorbingShields: ShieldBuff[] = [];
    if (remaining <= 0) {
        return { shieldAbsorbed, remainingDamage: remaining, absorbingShields };
    }

    for (const buff of unit.buffs) {
        if (remaining <= 0) break;
        if (buff._type !== SHIELD_BUFF_TYPE) continue;
        const shield = buff as ShieldBuff;
        const consumed = Math.min(shield.remainingHp, remaining);
        if (consumed <= 0) continue;
        shield.remainingHp -= consumed;
        // A refilling shield (Guard) tops straight back up inside the same hit. The loop has already moved past
        // it, so a hit is reduced once per shield; floors of several shields add, and shields without a floor
        // keep their own HP, so extra shield is never reset down.
        if (shield.refillFloor > 0) shield.remainingHp = Math.max(shield.remainingHp, shield.refillFloor);
        remaining -= consumed;
        shieldAbsorbed += consumed;
        absorbingShields.push(shield);
    }

    return { shieldAbsorbed, remainingDamage: remaining, absorbingShields };
}

/** Sum of `remainingHp` across all active `ShieldBuff`s on a unit (0 when none). */
export function getTotalShieldHp(unit: Unit): number {
    let total = 0;
    for (const buff of unit.buffs) {
        if (buff._type !== SHIELD_BUFF_TYPE) continue;
        total += (buff as ShieldBuff).remainingHp;
    }
    return total;
}
