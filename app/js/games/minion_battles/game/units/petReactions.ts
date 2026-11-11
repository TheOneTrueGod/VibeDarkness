/**
 * Pet reactions - pets casting in answer to their owner's actions, declared as data on the pet def
 * (`PetDefEntry.reactions`). Wired once in `wireCoreEventListeners`.
 *
 * - `ownerWeaponHit`: the owner landed a hit (`attack_hit`) with one of its weapon abilities
 *   (`Unit.weaponAbilityIds`). Each living pet of that owner that a `Minor` order can preempt (no cast
 *   running, its cooldown included, and not held by a cast; see `castPriority.ts`) is ordered to cast the
 *   reaction's ability at the hit unit on the next tick, at `Minor` priority, with a commandCharge granted
 *   so the use is always there. The spirit animal answers with Spirit Strike (0710).
 *
 * Deterministic: runs inside the simulation tick from an EventBus event, like any other order source.
 */
import type { AttackHitEvent } from '../EventBus';
import { getLivingPetsOfUnit } from './petHelpers';
import { petStateOf } from './components/petComponent';
import { getPetDef } from './pet_defs/petDef';
import { commandPetAbility } from '../../abilities/petCommands';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import { CAST_PRIORITY, canPreempt } from './castPriority';

/** Handle one `attack_hit`: fire every matching `ownerWeaponHit` reaction. */
export function handlePetReactionsOnAttackHit(engine: AbilityEngineContext, event: AttackHitEvent): void {
    const owner = engine.getUnit(event.sourceUnitId);
    if (!owner || !owner.weaponAbilityIds.includes(event.abilityId)) return;
    const target = engine.getUnit(event.targetUnitId);
    if (!target?.isAlive()) return;
    for (const pet of getLivingPetsOfUnit(owner, engine.units)) {
        // Reactions are Minor: a pet running any cast (its cooldown included) or held by a cast is skipped.
        if (!canPreempt(pet, CAST_PRIORITY.Minor, engine.units, engine)) continue;
        const defId = petStateOf(pet).defId;
        const reactions = defId ? getPetDef(defId)?.reactions ?? [] : [];
        for (const reaction of reactions) {
            if (reaction.on !== 'ownerWeaponHit') continue;
            if (!pet.abilities.includes(reaction.abilityId)) continue;
            commandPetAbility([pet], reaction.abilityId, [{ type: 'unit', unitId: target.id }], engine, {
                preGrantCharge: { chargeType: 'commandCharge', amount: 1 },
                priority: CAST_PRIORITY.Minor,
            });
            break;
        }
    }
}
