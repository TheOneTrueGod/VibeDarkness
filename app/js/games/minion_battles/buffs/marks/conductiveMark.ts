/**
 * Conductive — the Storm Core's mark. Charge clinging to an enemy, waiting for a bolt to finish the
 * circuit. Applied by Arc Bolt, Static Step and Thunderclap; consumed by Chain Lightning for bonus
 * damage and a stagger. Visual: tiny arcs crawling over the marked body, faster with more stacks.
 */
import { Effect } from '../../game/effects/Effect';
import { LIGHTNING_BOLT_EFFECT_TYPE, stormHash01, stormSeedFromId } from '../../game/effect_defs/stormEffects';
import { getThemeById } from '../../themes/abilityTheme';
import type { MarkDef } from './markTypes';

export const CONDUCTIVE_MARK_ID = 'conductive';
export const CONDUCTIVE_MAX_STACKS = 3;
/** World seconds a Conductive mark lasts after its last refresh. */
export const CONDUCTIVE_DURATION_SECONDS = 8;

/** Crawling arcs per wall second at 1 stack; each extra stack adds `CRAWL_RATE_PER_STACK`. */
const CRAWL_BASE_RATE = 4;
const CRAWL_RATE_PER_STACK = 3;
const CRAWL_DURATION = 0.14;
const MAX_CRAWLS_PER_FRAME = 3;

export const CONDUCTIVE_MARK_DEF: MarkDef = {
    id: CONDUCTIVE_MARK_ID,
    name: 'Conductive',
    maxStacks: CONDUCTIVE_MAX_STACKS,
    durationSeconds: CONDUCTIVE_DURATION_SECONDS,
    pipColor: getThemeById('storm').secondaryNum,
    pipOutlineColor: getThemeById('storm').shadeNum,
    description: `Charge clings to the target for {${CONDUCTIVE_DURATION_SECONDS}} seconds, up to {${CONDUCTIVE_MAX_STACKS}} stacks. Lightning that reaches it spends the stacks for extra damage.`,
    renderEmit(unit, ctx, state) {
        const theme = getThemeById('storm');
        state.accum += (CRAWL_BASE_RATE + CRAWL_RATE_PER_STACK * (state.stacks - 1)) * ctx.realDt;
        const seed = stormSeedFromId(unit.id);
        let n = 0;
        while (state.accum >= 1 && n < MAX_CRAWLS_PER_FRAME) {
            state.accum -= 1;
            n++;
            state.count++;
            // A short arc from one point on the body's edge to a nearby one, hopping over the unit.
            const a0 = stormHash01(seed, state.count) * Math.PI * 2;
            const a1 = a0 + (0.7 + stormHash01(seed, state.count, 1) * 1.1) * (stormHash01(seed, state.count, 2) < 0.5 ? -1 : 1);
            const r = unit.radius * (0.85 + stormHash01(seed, state.count, 3) * 0.3);
            const from = { x: unit.x + Math.cos(a0) * r, y: unit.y + Math.sin(a0) * r };
            const to = { x: unit.x + Math.cos(a1) * r, y: unit.y + Math.sin(a1) * r };
            ctx.emit(new Effect({
                x: from.x,
                y: from.y,
                duration: CRAWL_DURATION,
                effectType: LIGHTNING_BOLT_EFFECT_TYPE,
                pauseBehaviour: 'continue',
                effectData: {
                    from,
                    to,
                    color: theme.secondaryNum,
                    width: 1,
                    forks: 0,
                    jitter: 0.35,
                    maxJitterPx: 5,
                    seed: seed + state.count * 13,
                },
            }));
        }
        if (state.accum >= 1) state.accum %= 1;
    },
};
