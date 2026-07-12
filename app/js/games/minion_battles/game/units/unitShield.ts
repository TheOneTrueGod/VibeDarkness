import type { Unit } from './Unit';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../buffs/ShieldBuff';

export interface ShieldDamageResult {
    /** Damage absorbed by shield buffs before reaching armour/HP. */
    shieldAbsorbed: number;
    /** Damage left over after shields, to continue through armour/HP. */
    remainingDamage: number;
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
    if (remaining <= 0) {
        return { shieldAbsorbed, remainingDamage: remaining };
    }

    for (const buff of unit.buffs) {
        if (remaining <= 0) break;
        if (buff._type !== SHIELD_BUFF_TYPE) continue;
        const shield = buff as ShieldBuff;
        const consumed = Math.min(shield.remainingHp, remaining);
        if (consumed <= 0) continue;
        shield.remainingHp -= consumed;
        remaining -= consumed;
        shieldAbsorbed += consumed;
    }

    return { shieldAbsorbed, remainingDamage: remaining };
}
