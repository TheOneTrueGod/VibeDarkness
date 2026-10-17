/**
 * Objective types — what a battle objective asks the player to do. Drives the default in-world
 * hints for the objective (e.g. footprint tiles only for "go here" objectives).
 */

import type { EffectImageKey } from '../game/effectImages';

export enum ObjectiveType {
    /** Move the party to a location (footprint tiles mark where to stand). */
    ReachLocation = 'reachLocation',
    /** Kill every enemy on the field. */
    EliminateAll = 'eliminateAll',
    /** Kill a specific unit or structure. */
    KillTarget = 'killTarget',
    /** Stay alive until a round or timer is reached. */
    Survive = 'survive',
    /** Keep allied/neutral units or structures safe while they act (e.g. lanternites building nests). */
    Protect = 'protect',
}

export interface ObjectiveTypeDef {
    /**
     * Default image drawn on the objective's tiles (`showObjectiveTiles`), or null for no tile
     * hints — those objectives rely on the "!" marker alone.
     */
    tileImage: EffectImageKey | null;
}

export const OBJECTIVE_TYPE_DEFS: Record<ObjectiveType, ObjectiveTypeDef> = {
    [ObjectiveType.ReachLocation]: { tileImage: 'footprint' },
    [ObjectiveType.EliminateAll]: { tileImage: null },
    [ObjectiveType.KillTarget]: { tileImage: null },
    [ObjectiveType.Survive]: { tileImage: null },
    [ObjectiveType.Protect]: { tileImage: null },
};

export function getObjectiveTypeDef(type: ObjectiveType): ObjectiveTypeDef {
    return OBJECTIVE_TYPE_DEFS[type];
}
