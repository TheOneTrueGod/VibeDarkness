import type { Unit } from './Unit';
import { peekPetState } from './components/petComponent';
import type { AbilityModifier } from '../../../../researchTrees/types';
import { mergeAbilityModifierInto } from '../../../../researchTrees/abilityModifierMerge';
import { isUnitLingering } from './ephemeralExpiry';
import { isCloneUnit } from './unitTag';

/** All pets linked to the owner (living or dead). */
export function getPetsOfUnit(owner: Unit, units: readonly Unit[]): Unit[] {
    return units.filter((u) => peekPetState(u)?.ownerUnitId === owner.id);
}

/** All living pets belonging to the given owner unit. */
export function getLivingPetsOfUnit(owner: Unit, units: readonly Unit[]): Unit[] {
    return getPetsOfUnit(owner, units).filter((u) => u.isAlive());
}

/**
 * Living pets a command may pick: lingering pets (past their ephemeral time, finishing a cast; see
 * `ephemeralExpiry.ts`) are left out. Without `gameTime` the lingering check cannot run and every living pet counts.
 */
export function getCommandablePetsOfUnit(owner: Unit, units: readonly Unit[], gameTime?: number): Unit[] {
    const pets = getLivingPetsOfUnit(owner, units);
    return gameTime === undefined ? pets : pets.filter((p) => !isUnitLingering(p, gameTime));
}

/**
 * Whether a dead pet may be brought back (e.g. by a heel's revive). Illusions (`UnitTag.Clone`) and pets with an
 * ephemeral lifetime never are.
 */
export function isPetRevivable(pet: Unit): boolean {
    return !isCloneUnit(pet) && pet.ephemeralDespawnAtGameTime == null;
}

/**
 * Drop a pet that is gone for good (dead and not revivable, see {@link isPetRevivable}) from its owner's
 * `petState.unitIds`, so short-lived pets (spirit clones) do not pile up there. Called on `unit_died`.
 */
export function releaseDeadPetFromOwner(pet: Unit, getUnit: (id: string) => Unit | undefined): void {
    if (pet.isAlive() || isPetRevivable(pet)) return;
    const ownerUnitId = peekPetState(pet)?.ownerUnitId;
    if (!ownerUnitId) return;
    const owner = getUnit(ownerUnitId);
    const ownerState = owner ? peekPetState(owner) : undefined;
    if (!ownerState) return;
    const idx = ownerState.unitIds.indexOf(pet.id);
    if (idx >= 0) ownerState.unitIds.splice(idx, 1);
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
