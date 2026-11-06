/**
 * courtMagician tree AI context.
 */

import type { UnitAIContextBase } from '../contextBase';
import type { AbilityRotationState } from '../abilityRotation';

export type CourtMagicianNodeId = 'courtMagician_idle' | 'courtMagician_attack';

export interface CourtMagicianAITreeContext extends UnitAIContextBase, AbilityRotationState {
    aiTree: 'courtMagician';
    aiState?: CourtMagicianNodeId;
    /** Where he first noticed the party; Blink retreats stay within reach of it. */
    homeX?: number;
    homeY?: number;
    /** Game time a player first got within contact range (cleared after a Blink or when they back off). */
    contactSince?: number;
    /** His HP when that contact started, to count the hits he has taken since. */
    hpAtContact?: number;
    /** Last game time a player was within contact range. */
    lastContactAt?: number;
    /** Earliest game time he may Blink again. */
    nextBlinkAt?: number;
}
