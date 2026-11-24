/**
 * Kinship - Command Core resource: how in touch the character is with their spirit companion.
 *
 * Gains {@link KINSHIP_PER_SPIRIT_HIT} each time one of the unit's permanent pets (the spirit; not a
 * temporary pet such as a Displacement Strike clone) hits an enemy (`pet_attack_hit`, emitted from `attack_hit` in
 * `game/units/petAttackHit.ts`). Guard trickles some back over its duration (`ShieldBuff.resourceTrickle`).
 * The Command Core item attaches it with its own max and starting amount (`resourceGrants`).
 * Spent by the Command Core's player command cards (never by the pet's copies of their abilities).
 *
 * Drawn as ten paw prints (option C of the Kinship bar artbook): lit lime as earned, unlit in pine.
 */

import { Resource } from './Resource';
import type { EventBus, PetAttackHitEvent } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import { ResourceId } from './resourceIds';
import { COMMAND_THEME } from '../themes/abilityThemes';

export const KINSHIP_MAX = 10;
export const KINSHIP_STARTING_AMOUNT = 4;
export const KINSHIP_PER_SPIRIT_HIT = 1;
/** Lit paw prints: the Command theme's lime. */
export const KINSHIP_RESOURCE_COLOR = COMMAND_THEME.primary;
/** Unlit paw prints: the Command theme's pine. */
export const KINSHIP_EMPTY_COLOR = COMMAND_THEME.secondary ?? '#0f766e';
export const KINSHIP_TOOLTIP_LINES: readonly string[] = [`+${KINSHIP_PER_SPIRIT_HIT} when your spirit hits an enemy`];

export class Kinship extends Resource {
    readonly id = ResourceId.Kinship;
    readonly name = 'Kinship';
    readonly color = KINSHIP_RESOURCE_COLOR;
    readonly iconName = 'PawPrint';
    readonly tooltipLines = KINSHIP_TOOLTIP_LINES;
    readonly barStyle = 'pips' as const;
    readonly pipShape = 'paw' as const;
    readonly pipEmptyColor = KINSHIP_EMPTY_COLOR;

    private boundOnPetAttackHit: ((data: PetAttackHitEvent) => void) | null = null;

    constructor() {
        super(KINSHIP_STARTING_AMOUNT, KINSHIP_MAX);
    }

    protected subscribe(_unit: Unit, eventBus: EventBus): void {
        this.boundOnPetAttackHit = (data: PetAttackHitEvent) => {
            // Only permanent pets deepen the bond; temporary ones (clones) do not.
            if (data.ownerUnitId !== this.unitId || data.temporaryPet) return;
            this.add(KINSHIP_PER_SPIRIT_HIT);
        };
        eventBus.on('pet_attack_hit', this.boundOnPetAttackHit);
    }

    protected unsubscribe(eventBus: EventBus): void {
        if (this.boundOnPetAttackHit) {
            eventBus.off('pet_attack_hit', this.boundOnPetAttackHit);
            this.boundOnPetAttackHit = null;
        }
    }
}
