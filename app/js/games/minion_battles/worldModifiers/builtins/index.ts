import type { WorldModifierDef } from '../types';

/**
 * Built-in world modifiers active for every mission. Currently none: boss deaths moved to
 * `UnitDefEntry.deathSequence` (see game/deathSequences/).
 */
export const BUILTIN_WORLD_MODIFIERS: WorldModifierDef[] = [];
