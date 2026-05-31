export type { CcDefinition } from './ccDefinitions';
export { CC_DEFINITIONS } from './ccDefinitions';
export { CC_MIN_POTENCY_SEC } from './ccConstants';
export type { CcResistKey, CcTier, CcType } from './ccTypes';
export { resolveCcDuration } from './resolveCcDuration';
export {
    tryApplyHardCcStun,
    type HardCcStunAttemptOutcome,
    type HardCcStunAttemptResult,
} from './tryApplyHardCcStun';
export {
    tryApplyKnockbackByTier,
    getKnockbackTierDef,
    type KnockbackTierDef,
    type KnockbackAttemptOutcome,
    type KnockbackAttemptResult,
    type KnockbackEngineCtx,
} from './knockbackKeywords';
