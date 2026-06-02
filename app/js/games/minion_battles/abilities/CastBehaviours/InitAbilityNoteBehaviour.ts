import type { CastBehaviour, CastBehaviourSetupContext } from '../castBehaviourTypes';

/**
 * Reusable building block: sets the caster's ability note at window open.
 * Use via CastBehaviours.InitAbilityNote(noteData) as the `behaviour` on a
 * timing interval, replacing the old doCardEffect initialization pattern.
 *
 * Example — shield ability tracking block count:
 *   behaviour: CastBehaviours.InitAbilityNote({ retaliationCount: 0 })
 */
export class InitAbilityNoteBehaviour implements CastBehaviour {
    private readonly noteData: unknown;

    constructor(noteData: unknown) {
        this.noteData = noteData;
    }

    onSetup({ caster, abilityId }: CastBehaviourSetupContext): void {
        caster.setAbilityNote({ abilityId, abilityNote: this.noteData });
    }
}
