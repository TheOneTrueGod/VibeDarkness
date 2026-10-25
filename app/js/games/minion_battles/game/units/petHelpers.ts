import type { Unit } from './Unit';
import { peekPetState } from './components/petComponent';

/** All pets linked to the owner (living or dead). */
export function getPetsOfUnit(owner: Unit, units: readonly Unit[]): Unit[] {
    return units.filter((u) => peekPetState(u)?.ownerUnitId === owner.id);
}

/** All living pets belonging to the given owner unit. */
export function getLivingPetsOfUnit(owner: Unit, units: readonly Unit[]): Unit[] {
    return getPetsOfUnit(owner, units).filter((u) => u.isAlive());
}

/** The living owner of a pet unit, or undefined if the owner is dead/missing. */
export function getPetOwner(pet: Unit, units: readonly Unit[]): Unit | undefined {
    const ownerUnitId = peekPetState(pet)?.ownerUnitId;
    if (!ownerUnitId) return undefined;
    const owner = units.find((u) => u.id === ownerUnitId);
    return owner?.isAlive() ? owner : undefined;
}
