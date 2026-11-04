/**
 * Iron Warden enemy family: shared ids, colours and spacing. The Warden is a hollowed castle gaoler
 * in plate, chained to a tower shield. Its kit is a combo: hook a straggler in (Gaoler's Hook),
 * then crush them (Execution Slam), shield raised against everyone else in between (Bulwark).
 */

import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';

const GROUP = formatGroupId(AbilityGroupId.EnemyWarden);

export const GAOLERS_HOOK_ABILITY_ID = `${GROUP}01`;
export const EXECUTION_SLAM_ABILITY_ID = `${GROUP}02`;
export const BULWARK_ABILITY_ID = `${GROUP}03`;

/** Telegraph red for every Warden attack. */
export const WARDEN_TELEGRAPH_RED = 0xff3b30;
/** Hot orange of the Warden's slam cracks and sparks (an ember glow in its hollow armour). */
export const WARDEN_EMBER = 0xff7a3d;
export const WARDEN_IRON = 0x9aa1ab;

/**
 * Where a hooked victim lands, measured from the Warden's centre. Kept inside the Execution Slam's
 * blast so the hook really does set up the slam (see `EXECUTION_SLAM_OFFSET_PX` / `RADIUS_PX`).
 */
export const HOOK_REEL_STANDOFF_PX = 46;
