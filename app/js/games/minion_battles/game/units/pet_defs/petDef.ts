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
}

const PET_DEFS: Record<string, PetDefEntry> = {
    dog: {
        id: 'dog',
        name: 'Dog',
        unitCharacterId: 'dog',
        engageLeashRange: 150,
        returnLeashRange: 300,
        abilityIds: ['0701', '0702'],
        basicAttackAbilityId: '0701',
    },
};

export function getPetDef(petId: string): PetDefEntry | undefined {
    return PET_DEFS[petId];
}
