/**
 * Punch and the Training replacements that occupy the same slot.
 * Dodge restores a use to whichever of these the unit currently has.
 */
import { CARD_ID as DOUBLE_PUNCH_ABILITY_ID } from './0116_DoublePunch/0116Ability';
import { CARD_ID as STRONG_PUNCH_ABILITY_ID } from './0117_StrongPunch/0117Ability';
import { CARD_ID as SNEAKY_PUNCH_ABILITY_ID } from './0118_SneakyPunch/0118Ability';
import { CARD_ID as CHARGING_PUNCH_ABILITY_ID } from './0119_ChargingPunch/0119Ability';
import { CARD_ID as PUNCH_ABILITY_ID } from './0120_PunchNEW/0120Ability';

export const PUNCH_FAMILY_ABILITY_IDS = [
    PUNCH_ABILITY_ID,
    DOUBLE_PUNCH_ABILITY_ID,
    STRONG_PUNCH_ABILITY_ID,
    SNEAKY_PUNCH_ABILITY_ID,
    CHARGING_PUNCH_ABILITY_ID,
] as const;
