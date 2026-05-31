import type { UnitTag } from './unitTag';

// TODO: Once units can look up their associated unitDef at runtime, move enrageDef
// off the Unit instance and onto the unitDef instead. Units would resolve it on demand
// rather than carrying (and serializing) a copy. Unit.toJSON/fromJSON can drop the field at that point.

export type EnrageConditionType = 'health_below_percent';

export interface EnrageDef {
    conditionType: EnrageConditionType;
    /** Fraction of max HP (0–1) at or below which the condition triggers. E.g. 0.5 = 50%. */
    threshold: number;
    /** Which tag to apply when enraged. */
    tag: UnitTag;
    /** If true (default), the tag is never removed once applied. */
    oneShot?: boolean;
}
