/** Static definition of a pet kind. Registry keyed by pet id (e.g. 'dog'). */
export interface PetDefEntry {
    id: string;
    name: string;
    /** Character ID referencing UNIT_DEFS — determines HP, speed, sprite, etc. */
    unitCharacterId: string;
    /** Radius around the owner; enemies inside cause the pet to auto-engage. */
    engageLeashRange: number;
    /** Radius around the owner; pet beyond this disengages and returns to owner. */
    returnLeashRange: number;
    /** Full ability list given to the pet unit at spawn. */
    abilityIds: string[];
    /** Ability id the pet AI auto-uses when engaging (basic attack). */
    basicAttackAbilityId: string;
    /**
     * When false, the pet never chases enemies on its own: it stays around its anchor (the point it was
     * last ordered to, or its owner while guarding) and only fights through commands, reactions and
     * ranged abilities with `aiSettings` that reach an enemy from where it stands. Default true.
     */
    autoEngage?: boolean;
    /**
     * With `autoEngage: false`: while guarding (no ordered point, so the anchor is the owner), still engage
     * enemies within `engageLeashRange` of the owner. Sent to a point with Order: Move, the pet holds there
     * and does not chase. Default false.
     */
    engageWhileGuarding?: boolean;
    /** How far (px) the pet may wander from its anchor. Default 50. */
    anchorRadius?: number;
    /**
     * Abilities the pet casts in response to its owner's actions (see `game/units/petReactions.ts`).
     * Each fires only while the pet is not busy with another cast.
     */
    reactions?: readonly PetReactionDef[];
}

/** `ownerWeaponHit`: the owner landed a hit with one of its weapon abilities; the pet casts `abilityId` at the hit unit. */
export interface PetReactionDef {
    on: 'ownerWeaponHit';
    abilityId: string;
}

const PET_DEFS: Record<string, PetDefEntry> = {
    dog: {
        id: 'dog',
        name: 'Spirit Dog',
        unitCharacterId: 'dog',
        engageLeashRange: 150,
        returnLeashRange: 300,
        // Spirit Strike (0710) answers the owner's weapon hits; Spirit Flurry (0711) follows a Sic 'em pounce.
        abilityIds: ['0701', '0702', '0710', '0711'],
        basicAttackAbilityId: '0701',
        // Guarding (the mission start, or after Guard) it follows its owner and attacks enemies near them;
        // sent to a point with Order: Move it holds there instead.
        autoEngage: false,
        engageWhileGuarding: true,
        anchorRadius: 50,
        reactions: [{ on: 'ownerWeaponHit', abilityId: '0710' }],
    },
};

export function getPetDef(petId: string): PetDefEntry | undefined {
    return PET_DEFS[petId];
}
