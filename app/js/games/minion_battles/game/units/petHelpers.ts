import type { Unit } from './Unit';

/** All pets linked to the owner (living or dead). */
export function getPetsOfUnit(owner: Unit, units: readonly Unit[]): Unit[] {
    return units.filter((u) => u.petState.ownerUnitId === owner.id);
}

/** All living pets belonging to the given owner unit. */
export function getLivingPetsOfUnit(owner: Unit, units: readonly Unit[]): Unit[] {
    return getPetsOfUnit(owner, units).filter((u) => u.isAlive());
}

/** The living owner of a pet unit, or undefined if the owner is dead/missing. */
export function getPetOwner(pet: Unit, units: readonly Unit[]): Unit | undefined {
    if (!pet.petState.ownerUnitId) return undefined;
    const owner = units.find((u) => u.id === pet.petState.ownerUnitId);
    return owner?.isAlive() ? owner : undefined;
}
