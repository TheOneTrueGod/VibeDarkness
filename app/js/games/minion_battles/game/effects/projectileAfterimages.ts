/**
 * Projectile afterimages - render-only copies of a sprite projectile left behind while it flies, for projectiles
 * whose `spriteConfig.afterimage` is set (see `SpriteAfterimageDef`).
 *
 * Driven from `GameEngine.doRenderTick(realDt)`, so emission runs on wall time and keeps going while the game is
 * paused: a paused projectile keeps shedding copies that drift backward from it. The copies use
 * `pauseBehaviour: 'continue'` so they keep fading too.
 *
 * Purely visual: nothing here is serialized or touches engine RNG. State is derived from the projectile list every
 * frame, so it is reconnect-safe.
 */

import { Effect } from './Effect';
import type { Projectile } from '../projectiles/Projectile';
import {
    SPRITE_AFTERIMAGE_EFFECT_TYPE,
    resolveSpriteRotation,
    type SpriteAfterimageEffectData,
} from '../projectiles/projectile_defs/spriteAfterimage';

const MAX_EMITS_PER_FRAME = 4;

interface AfterimageState {
    accum: number;
    /** Last non-zero travel direction, so a stopped projectile still drifts its copies backward. */
    dirX: number;
    dirY: number;
    seen: number;
}

/** Per-engine render-side system for projectile afterimages. Owned by `GameEngine`; never serialized. */
export class ProjectileAfterimageSystem {
    private readonly states = new Map<string, AfterimageState>();
    private frame = 0;

    update(
        projectiles: readonly Projectile[],
        realDt: number,
        emit: (fx: Effect) => void,
        gameTime: number,
    ): void {
        this.frame++;
        if (realDt <= 0) return;
        for (const proj of projectiles) {
            const config = proj.spriteConfig;
            const def = config?.afterimage;
            if (!proj.active || !config || !def || def.ratePerSec <= 0) continue;
            let state = this.states.get(proj.id);
            if (!state) {
                // Start full so the first copy appears on the first frame.
                state = { accum: 1, dirX: 1, dirY: 0, seen: this.frame };
                this.states.set(proj.id, state);
            }
            state.seen = this.frame;
            const speed = Math.hypot(proj.velocityX, proj.velocityY);
            if (speed > 1e-6) {
                state.dirX = proj.velocityX / speed;
                state.dirY = proj.velocityY / speed;
            }

            state.accum += def.ratePerSec * realDt;
            let n = 0;
            while (state.accum >= 1 && n < MAX_EMITS_PER_FRAME) {
                state.accum -= 1;
                n++;
                const data: SpriteAfterimageEffectData = {
                    sprite: config.sprite,
                    rotation: resolveSpriteRotation(proj, config, gameTime),
                    initialAlpha: def.initialAlpha,
                    ...(def.tint !== undefined ? { tint: def.tint } : {}),
                };
                const fx = new Effect({
                    startX: proj.x,
                    startY: proj.y,
                    x: proj.x - state.dirX * def.driftPx,
                    y: proj.y - state.dirY * def.driftPx,
                    duration: def.durationSec,
                    effectType: SPRITE_AFTERIMAGE_EFFECT_TYPE,
                    pauseBehaviour: 'continue',
                    effectData: { ...data },
                });
                // Traveling effects are constructed at their end point; place it at the start for its first draw.
                fx.x = proj.x;
                fx.y = proj.y;
                emit(fx);
            }
            if (state.accum >= 1) state.accum = state.accum % 1;
        }
        for (const [id, s] of this.states) {
            if (s.seen !== this.frame) this.states.delete(id);
        }
    }
}
