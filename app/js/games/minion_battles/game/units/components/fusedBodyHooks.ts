/**
 * `fusedBody` component hooks (rules in `fusedBodyComponent.ts`).
 *
 * - `tick`: counts the fuse down in world seconds, opens the telegraph window (event `fused_body_telegraph_started`),
 *   and on zero fires `onExpiry` then removes the body.
 * - `onDeath`: a body that dies before its fuse ran out fires `onDeath` (the fizzle). A body that expired already has
 *   an outcome, so its own removal does not fizzle.
 *
 * Effects are named handlers in a registry (`registerFusedBodyEffect`), so a def never carries code. Built in:
 * `none` (nothing but the spec's visuals) and `areaDamage` (`params.damage` to every living enemy of the body within
 * `options.radiusPx` of it).
 */

import type { Unit } from '../Unit';
import { areEnemies } from '../../teams';
import { applyVisualEffectDefs } from '../../effects/applyVisualEffectDefs';
import type { UnitComponentContext, UnitComponentHooks } from './unitComponentHooks';
import {
    fusedBodyOptionsOf,
    fusedBodyTelegraphSeconds,
    peekFusedBodyState,
    type FusedBodyEffectSpec,
    type FusedBodyOptions,
    type FusedBodyOutcome,
} from './fusedBodyComponent';

export type FusedBodyEffectHandler = (
    unit: Unit,
    ctx: UnitComponentContext,
    spec: FusedBodyEffectSpec,
    options: FusedBodyOptions,
) => void;

const EFFECTS = new Map<string, FusedBodyEffectHandler>();

/** Register a named effect. Returns an unregister function (for tests). Re-registering an id replaces it. */
export function registerFusedBodyEffect(id: string, handler: FusedBodyEffectHandler): () => void {
    EFFECTS.set(id, handler);
    return () => {
        if (EFFECTS.get(id) === handler) EFFECTS.delete(id);
    };
}

export const FUSED_BODY_EFFECT_NONE = 'none';
export const FUSED_BODY_EFFECT_AREA_DAMAGE = 'areaDamage';

registerFusedBodyEffect(FUSED_BODY_EFFECT_NONE, () => {});

registerFusedBodyEffect(FUSED_BODY_EFFECT_AREA_DAMAGE, (unit, ctx, spec, options) => {
    const damage = spec.params?.damage ?? 0;
    if (damage <= 0) return;
    for (const target of [...ctx.units]) {
        if (!target.isAlive() || !areEnemies(unit.teamId, target.teamId)) continue;
        if (Math.hypot(target.x - unit.x, target.y - unit.y) > options.radiusPx + target.radius) continue;
        target.takeDamage(damage, unit.id, ctx.eventBus);
    }
});

function fireEffect(unit: Unit, ctx: UnitComponentContext, spec: FusedBodyEffectSpec, options: FusedBodyOptions): void {
    if (spec.visuals?.length) applyVisualEffectDefs([...spec.visuals], unit, ctx.engine);
    EFFECTS.get(spec.effectId)?.(unit, ctx, spec, options);
}

function resolve(unit: Unit, ctx: UnitComponentContext, options: FusedBodyOptions, outcome: FusedBodyOutcome): void {
    const state = peekFusedBodyState(unit);
    if (!state || state.outcome !== null) return;
    state.outcome = outcome;
    fireEffect(unit, ctx, outcome === 'expired' ? options.onExpiry : options.onDeath, options);
}

/** Advance one body by `dt` world seconds. Exported for tests. */
export function tickFusedBody(unit: Unit, ctx: UnitComponentContext, dt: number): void {
    const state = peekFusedBodyState(unit);
    const options = fusedBodyOptionsOf(unit);
    if (!state || !options || state.outcome !== null) return;

    state.remaining = Math.max(0, (state.remaining ?? options.fuseSeconds) - dt);

    if (!state.telegraphed && state.remaining <= fusedBodyTelegraphSeconds(options)) {
        state.telegraphed = true;
        ctx.eventBus.emit('fused_body_telegraph_started', {
            unitId: unit.id,
            x: unit.x,
            y: unit.y,
            radiusPx: options.radiusPx,
            secondsLeft: state.remaining,
        });
    }

    if (state.remaining <= 0) {
        resolve(unit, ctx, options, 'expired');
        // Leave the field the way an ephemeral summon does. The outcome is already set, so no fizzle fires.
        unit.hp = 0;
        unit.active = false;
        ctx.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
    }
}

export const FUSED_BODY_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        for (const unit of [...ctx.units]) {
            if (!unit.isAlive() || !peekFusedBodyState(unit)) continue;
            tickFusedBody(unit, ctx, ctx.dt);
        }
    },
    onDeath(unit, ctx) {
        const options = fusedBodyOptionsOf(unit);
        if (options) resolve(unit, ctx, options, 'killed');
    },
};
