/**
 * One entry point for putting a pet on the field for an owner: the mission-start spirit animal and any pet
 * spawned mid-battle (e.g. Displacement Strike's spirit clones) go through `spawnPetForOwner`.
 */
import type { AbilityModifier } from '../../../../researchTrees/types';
import { mergeAbilityModifierInto } from '../../../../researchTrees/abilityModifierMerge';
import { initializeAbilityRuntimeForUnit } from '../../abilities/abilityUses';
import type { SpawnSource } from '../types';
import type { EphemeralExpiryPolicy, Unit } from './Unit';
import type { SpawnDefinition } from './spawning/spawnDefinition';
import type { UnitTag } from './unitTag';
import { getPetDef } from './pet_defs/petDef';
import { inheritOwnerAbilityModifiers, inheritOwnerAttack } from './petHelpers';

/** Default pet AI ranges (melee pets). */
const DEFAULT_PET_AI_SETTINGS = { minRange: 0, maxRange: 50 };

export interface SpawnPetOptions {
    /** Pet def id (`PET_DEFS`), e.g. 'dog' or 'spirit_clone'. Sets the character, name and pet AI tuning. */
    petDefId: string;
    /** World position to spawn at. */
    at: { x: number; y: number };
    /** Full ability list of the pet (usually the def's list plus research grants, or a copy of another pet's). */
    abilityIds: readonly string[];
    maxHp: number;
    /**
     * Extra modifiers merged on top (flats add, see `mergeAbilityModifierInto`), after the owner's are
     * inherited, e.g. a passive's bite damage, or every modifier of the pet being copied.
     */
    abilityModifiers?: Readonly<Record<string, AbilityModifier>>;
    /**
     * Inherit the owner's research modifiers for the pet's abilities (`inheritOwnerAbilityModifiers`).
     * Default true. Pass false when `abilityModifiers` is a full copy of another pet's (already inherited),
     * so the owner's research is not counted twice.
     */
    inheritOwnerModifiers?: boolean;
    unitTags?: UnitTag[];
    /** Absolute gameTime after which the pet despawns (ephemeral pets). */
    ephemeralDespawnAtGameTime?: number | null;
    /** What happens at `ephemeralDespawnAtGameTime` (e.g. `'finishCast'` for clones; see `ephemeralExpiry.ts`). */
    ephemeralExpiryPolicy?: EphemeralExpiryPolicy;
    spawnSource: SpawnSource;
}

export interface PetSpawnEngine {
    spawnUnit(def: SpawnDefinition, spawnSource?: SpawnSource): Unit[];
}

/**
 * Spawn a pet of `owner` at `at`: pet AI hooked to the owner, owner's modifiers and Attack inherited, extra modifiers
 * applied, hp set and ability runtime initialized. Returns the pet, or undefined when the def is unknown or
 * placement failed.
 */
export function spawnPetForOwner(engine: PetSpawnEngine, owner: Unit, options: SpawnPetOptions): Unit | undefined {
    const petDef = getPetDef(options.petDefId);
    if (!petDef) return undefined;
    const [pet] = engine.spawnUnit(
        {
            characterId: petDef.unitCharacterId,
            name: petDef.name,
            teamId: owner.teamId,
            abilities: [...options.abilityIds],
            unitAITreeId: 'pet',
            aiSettings: { ...DEFAULT_PET_AI_SETTINGS },
            placement: { kind: 'fixedWorld', x: options.at.x, y: options.at.y },
            aiHookup: { kind: 'pet', ownerUnitId: owner.id, defId: petDef.id },
            hp: options.maxHp,
            ...(options.unitTags ? { unitTags: [...options.unitTags] } : {}),
            ...(options.ephemeralDespawnAtGameTime != null
                ? { ephemeralDespawnAtGameTime: options.ephemeralDespawnAtGameTime }
                : {}),
            ...(options.ephemeralExpiryPolicy ? { ephemeralExpiryPolicy: options.ephemeralExpiryPolicy } : {}),
        },
        options.spawnSource,
    );
    if (!pet) return undefined;
    // Research on the pet's abilities (e.g. Thorn Volley, Frenzied Flurry) lives on the owner.
    if (options.inheritOwnerModifiers !== false) inheritOwnerAbilityModifiers(pet, owner);
    // The owner's Attack (Mighty, Core Training) scales every pet's damage. Always from the owner, never a copy.
    inheritOwnerAttack(pet, owner);
    if (options.abilityModifiers) {
        const merged: Record<string, AbilityModifier> = { ...pet.abilityModifiers };
        for (const [abilityId, modifier] of Object.entries(options.abilityModifiers)) {
            const entry: AbilityModifier = { ...(merged[abilityId] ?? {}) };
            mergeAbilityModifierInto(entry, modifier);
            merged[abilityId] = entry;
        }
        pet.abilityModifiers = merged;
    }
    pet.maxHp = options.maxHp;
    pet.hp = options.maxHp;
    initializeAbilityRuntimeForUnit(pet);
    return pet;
}
