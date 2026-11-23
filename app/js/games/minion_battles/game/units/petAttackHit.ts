/**
 * `pet_attack_hit`: one engine-level event for "a pet hit an enemy", so owner-side systems (the Kinship
 * resource, future pet passives) can react without each looking up pets and teams themselves.
 * Emitted from `attack_hit` (one per landed hit) in `game/engineEventWiring.ts`.
 */
import type { AttackHitEvent, EventBus } from '../EventBus';
import { areEnemies } from '../teams';
import type { Unit } from './Unit';
import { peekPetState } from './components/petComponent';

export function emitPetAttackHit(
    engine: { eventBus: EventBus; getUnit(id: string): Unit | undefined | null },
    event: AttackHitEvent,
): void {
    const pet = engine.getUnit(event.sourceUnitId);
    const ownerUnitId = pet ? peekPetState(pet)?.ownerUnitId : undefined;
    if (!pet || !ownerUnitId) return;
    const target = engine.getUnit(event.targetUnitId);
    if (!target || !areEnemies(pet.teamId, target.teamId)) return;
    engine.eventBus.emit('pet_attack_hit', {
        ownerUnitId,
        petUnitId: pet.id,
        targetUnitId: target.id,
        abilityId: event.abilityId,
    });
}
