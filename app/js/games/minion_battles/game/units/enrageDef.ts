import type { UnitTag } from './unitTag';

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
