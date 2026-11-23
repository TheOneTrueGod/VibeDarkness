/**
 * Kinship costs of the Command Core's player command cards, in one place for tuning.
 * Only the player's cards cost Kinship; the spirit's own copies of these abilities (Pounce, Fling Thorns,
 * Bramble Patch, Displacement Strike's split) stay free, since the player already paid. Guard and
 * Order: Attack are free (Guard recovers Kinship instead). See `resources/Kinship.ts`.
 */
import type { AbilityStatic } from '../../abilities/Ability';
import { ResourceId } from '../../resources/resourceIds';

export const SIC_EM_KINSHIP_COST = 2;
export const FLING_THORNS_KINSHIP_COST = 2;
export const BRAMBLE_PATCH_KINSHIP_COST = 3;
export const SPIRIT_STORM_KINSHIP_COST = 4;
export const DISPLACEMENT_STRIKE_KINSHIP_COST = 5;

/** An Kinship `resourceCost`. */
export function kinshipCost(amount: number): NonNullable<AbilityStatic['resourceCost']> {
    return { resourceId: ResourceId.Kinship, amount };
}
