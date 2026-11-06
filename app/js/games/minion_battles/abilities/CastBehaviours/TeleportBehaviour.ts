/**
 * Teleport — reusable CastBehaviour: the caster vanishes and reappears at a point, instantly, on the
 * window's first tick (blink-away bosses, swap-places tricks, return-to-mark spells).
 *
 * The destination defaults to the cast's target point. A destination off the map or inside a wall
 * snaps to the nearest open cell centre (set `snapToOpenGround: false` to opt out). The caster's walk
 * goal is cleared so it does not stroll back to where it was heading. `onDepart` / `onArrive` are the
 * VFX hooks (both run on that same tick).
 *
 * Usage:
 *   CastBehaviours.Teleport({ onDepart: (ctx, from) => puff(from), onArrive: (ctx, to) => puff(to) })
 */

import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import { resolveTargetToPoint } from '../targeting';
import { fitSlotsToTerrain } from '../../game/formations/formationPlacement';

type Point = { x: number; y: number };

export interface TeleportConfig {
    /** Where to go. Default: the cast's target point. Null cancels the teleport. */
    destination?: (ctx: CastBehaviourTickContext) => Point | null;
    /** Snap a blocked or off-map destination to the nearest open cell (default true). */
    snapToOpenGround?: boolean;
    onDepart?: (ctx: CastBehaviourTickContext, from: Point) => void;
    onArrive?: (ctx: CastBehaviourTickContext, to: Point) => void;
}

export class TeleportBehaviour implements CastBehaviour {
    constructor(private readonly config: TeleportConfig = {}) {}

    onTick(ctx: CastBehaviourTickContext): void {
        if (!ctx.isFirstTick) return;
        const raw = this.config.destination
            ? this.config.destination(ctx)
            : resolveTargetToPoint(ctx.target, ctx.engine);
        if (!raw) return;
        const dest =
            this.config.snapToOpenGround === false
                ? raw
                : fitSlotsToTerrain([raw], ctx.engine.terrainManager)[0]!;
        const from = { x: ctx.caster.x, y: ctx.caster.y };
        this.config.onDepart?.(ctx, from);
        ctx.caster.clearMovement();
        ctx.caster.x = dest.x;
        ctx.caster.y = dest.y;
        this.config.onArrive?.(ctx, { x: dest.x, y: dest.y });
    }
}

export function Teleport(config?: TeleportConfig): TeleportBehaviour {
    return new TeleportBehaviour(config);
}
