/**
 * Buff type id for {@link LiftedBuff}, split into its own module so callers that only need
 * `unit.hasBuff(LIFTED_BUFF_TYPE)` don't have to import the full class — which pulls in the
 * knockback/ability dependency chain and creates a circular-import cycle back through
 * Unit.ts / unitFromJSON.ts / buffRegistry.ts. See `buffs/LiftedBuff.ts` for the buff itself.
 */
export const LIFTED_BUFF_TYPE = 'lifted';
