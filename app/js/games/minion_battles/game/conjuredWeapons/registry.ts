/**
 * Conjured weapons swap a unit's weapon abilities for a held strike and a release ability.
 * The held record is instance state and is serialized on the unit.
 */
export interface ConjuredWeaponDef {
    id: string;
    conjureAbilityId: string;
    heldAbilityId: string;
    releaseAbilityId: string;
    /** Dropped-weapon kind left on the ground when the weapon is discarded. */
    tokenKind: string;
    heldUses: number;
}

export interface HeldConjuredWeaponState {
    defId: string;
    /** Weapon-origin abilities hidden while this weapon is held. Their uses stay on the runtime. */
    stowedAbilityIds: string[];
}

const CONJURED_WEAPONS = new Map<string, ConjuredWeaponDef>();

export function registerConjuredWeapon(def: ConjuredWeaponDef): void {
    CONJURED_WEAPONS.set(def.id, def);
}

export function getConjuredWeaponDef(id: string): ConjuredWeaponDef | undefined {
    return CONJURED_WEAPONS.get(id);
}
