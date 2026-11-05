/**
 * Conductive — the Storm Core's mark. Charge clinging to an enemy, waiting for a bolt to finish the
 * circuit. Applied by Arc Bolt, Static Step and Thunderclap; consumed by Chain Lightning for bonus
 * damage and a stagger. Visual: one arc crawling over the marked body per stack, so the number of arcs
 * alive at once is the stack count (no pips).
 */
import { Effect } from '../../game/effects/Effect';
import { LIGHTNING_BOLT_EFFECT_TYPE, stormHash01, stormSeedFromId } from '../../game/effect_defs/stormEffects';
import { getThemeById } from '../../themes/abilityTheme';
import type { MarkDef } from './markTypes';

export const CONDUCTIVE_MARK_ID = 'conductive';
export const CONDUCTIVE_MAX_STACKS = 3;
/** World seconds a Conductive mark lasts after its last refresh. */
export const CONDUCTIVE_DURATION_SECONDS = 8;

/** Wall seconds each arc lives; its slot re-arcs as soon as it ends, so `stacks` arcs are always alive. */
const ARC_LIFE = 0.24;
/** Angular length (radians) of one arc around the body. */
const ARC_SPAN = 1.1;

export const CONDUCTIVE_MARK_DEF: MarkDef = {
    id: CONDUCTIVE_MARK_ID,
    name: 'Conductive',
    maxStacks: CONDUCTIVE_MAX_STACKS,
    durationSeconds: CONDUCTIVE_DURATION_SECONDS,
    description: 'Charge clings to the target. Abilities use conductive charge for bonus effects.',
    renderEmit(unit, ctx, state) {
        const theme = getThemeById('storm');
        const stacks = Math.max(0, Math.floor(state.stacks));
        state.elapsed += ctx.realDt;
        state.slotReadyAt.length = stacks;
        const seed = stormSeedFromId(unit.id);
        for (let slot = 0; slot < stacks; slot++) {
            if ((state.slotReadyAt[slot] ?? 0) > state.elapsed) continue;
            state.slotReadyAt[slot] = state.elapsed + ARC_LIFE;
            state.count++;
            // Each slot owns an equal share of the body's edge, so the arcs read as separate and countable.
            const sector = (Math.PI * 2) / stacks;
            const a0 = slot * sector + stormHash01(seed, state.count) * Math.max(0, sector - ARC_SPAN);
            const a1 = a0 + Math.min(ARC_SPAN, sector * 0.9);
            const r = unit.radius * (0.9 + stormHash01(seed, state.count, 1) * 0.2);
            const from = { x: unit.x + Math.cos(a0) * r, y: unit.y + Math.sin(a0) * r };
            const to = { x: unit.x + Math.cos(a1) * r, y: unit.y + Math.sin(a1) * r };
            ctx.emit(new Effect({
                x: from.x,
                y: from.y,
                duration: ARC_LIFE,
                effectType: LIGHTNING_BOLT_EFFECT_TYPE,
                pauseBehaviour: 'continue',
                effectData: {
                    from,
                    to,
                    color: theme.secondaryNum,
                    width: 1.3,
                    forks: 0,
                    jitter: 0.4,
                    maxJitterPx: 6,
                    fadeShare: 0.2,
                    seed: seed + state.count * 13,
                },
            }));
        }
    },
};
