/**
 * Conjured weapons swap a unit's weapon abilities for a held strike and a release ability.
 * The held record is instance state and is serialized on the unit.
 */
/** Upright card picture for the orbit, the discard arc and the dropped token. */
export interface ConjuredWeaponArt {
    /** Pixi-loadable image URL (an imported `.svg`). */
    url: string;
    /** Added to a direction so the picture's tip points along it. Default `DEFAULT_WEAPON_TIP_OFFSET`. */
    tipOffsetRad?: number;
}

/** Card art points up, so a quarter turn makes the tip point along the angle. */
export const DEFAULT_WEAPON_TIP_OFFSET = Math.PI / 2;

export interface ConjuredWeaponDef {
    id: string;
    conjureAbilityId: string;
    heldAbilityId: string;
    releaseAbilityId: string;
    /** Dropped-weapon kind left on the ground when the weapon is discarded. Serialized on the token. */
    tokenKind: string;
    /** Picture drawn for this weapon and its token. */
    art: ConjuredWeaponArt;
    heldUses: number;
    /**
     * When the held ability's last use ends the weapon, leave a token at the caster.
     * Default true. A release that drops its own token, or that should leave nothing, sets this false.
     */
    leaveTokenWhenHeldUsesEnd?: boolean;
    /**
     * Every landed held strike drops a token, not just the last. The weapon stays in hand until its
     * uses run out; the last strike's token is the discarded weapon itself. See `landHeldWeaponStrike`.
     */
    dropTokenEachHeldUse?: boolean;
}

export interface HeldConjuredWeaponState {
    defId: string;
    /** Weapon-origin abilities hidden while this weapon is held. Their uses stay on the runtime. */
    stowedAbilityIds: string[];
}

const CONJURED_WEAPONS = new Map<string, ConjuredWeaponDef>();
const BY_TOKEN_KIND = new Map<string, ConjuredWeaponDef>();

export function registerConjuredWeapon(def: ConjuredWeaponDef): void {
    CONJURED_WEAPONS.set(def.id, def);
    BY_TOKEN_KIND.set(def.tokenKind, def);
}

export function getConjuredWeaponDef(id: string): ConjuredWeaponDef | undefined {
    return CONJURED_WEAPONS.get(id);
}

/** The weapon whose dropped token has this kind. */
export function getConjuredWeaponDefByTokenKind(kind: string): ConjuredWeaponDef | undefined {
    return BY_TOKEN_KIND.get(kind);
}

/** Tip offset for a token kind's art. Unknown kinds use the default. */
export function weaponTipOffset(kind: string): number {
    return BY_TOKEN_KIND.get(kind)?.art.tipOffsetRad ?? DEFAULT_WEAPON_TIP_OFFSET;
}
