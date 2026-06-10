import type { Unit } from './Unit';

/** All living pets belonging to the given owner unit. */
export function getLivingPetsOfUnit(owner: Unit, units: readonly Unit[]): Unit[] {
    return units.filter((u) => u.petOwnerUnitId === owner.id && u.isAlive());
}

/** The living owner of a pet unit, or undefined if the owner is dead/missing. */
export function getPetOwner(pet: Unit, units: readonly Unit[]): Unit | undefined {
    if (!pet.petOwnerUnitId) return undefined;
    const owner = units.find((u) => u.id === pet.petOwnerUnitId);
    return owner?.isAlive() ? owner : undefined;
}
