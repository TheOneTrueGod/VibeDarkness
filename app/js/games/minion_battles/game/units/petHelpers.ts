import type { Unit } from './Unit';
import { peekPetState } from './components/petComponent';
import type { AbilityModifier } from '../../../../researchTrees/types';
import { mergeAbilityModifierInto } from '../../../../researchTrees/abilityModifierMerge';

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

/**
 * Give a pet its owner's research modifiers for the abilities the pet has (e.g. Thorn Volley on Fling
 * Thorns, Frenzied Flurry on Spirit Flurry), merged on top of the pet's own. Call once when the pet spawns.
 */
export function inheritOwnerAbilityModifiers(pet: Unit, owner: Unit): void {
    const merged: Record<string, AbilityModifier> = { ...pet.abilityModifiers };
    for (const abilityId of pet.abilities) {
        const fromOwner = owner.abilityModifiers[abilityId];
        if (!fromOwner) continue;
        const entry: AbilityModifier = { ...(merged[abilityId] ?? {}) };
        mergeAbilityModifierInto(entry, fromOwner);
        merged[abilityId] = entry;
    }
    pet.abilityModifiers = merged;
}
