/**
 * Projectile particle trails - render-only motes (see `motes.ts`) shed along a projectile's path while it
 * flies, for projectiles whose `particleTrail` is set (launch with `ProjectileLaunch().withParticleTrail(...)`).
 *
 * Motes are spread along the stretch flown since the last render frame, so fast projectiles leave an even
 * trail instead of clumps. Emission runs on wall time from `GameEngine.doRenderTick`, like
 * `projectileAfterimages.ts`, so a paused projectile keeps glowing.
 *
 * Purely visual: nothing here is serialized (the def itself travels on the projectile) and engine RNG is
 * never touched. State is derived from the projectile list every frame, so it is reconnect-safe.
 */
import type { Effect } from './Effect';
import { createMote, hashMoteSeed, MOTE_PRESETS, moteRng, type MoteSpec } from './motes';

/** Plain data, serialized with the projectile. */
export interface ProjectileParticleTrailDef {
    /** Motes per wall second. */
    ratePerSec: number;
    spec: MoteSpec;
}

/** Named presets. */
export const PROJECTILE_PARTICLE_TRAIL_PRESETS = {
    /** Command spirit motes behind a thrown thorn or pulse. */
    spiritMotes: (): ProjectileParticleTrailDef => ({ ratePerSec: 70, spec: MOTE_PRESETS.spiritTrail() }),
} as const;

/** Never emit more than this many motes for one projectile per frame (long frames / tab refocus). */
const MAX_EMITS_PER_FRAME = 8;

interface TrailProjectile {
    id: string;
    active: boolean;
    x: number;
    y: number;
    particleTrail?: ProjectileParticleTrailDef;
}

interface TrailState {
    accum: number;
    lastX: number;
    lastY: number;
    rand: () => number;
    seen: number;
}

/** Per-engine render-side system for projectile particle trails. Owned by `GameEngine`; never serialized. */
export class ProjectileParticleTrailSystem {
    private readonly states = new Map<string, TrailState>();
    private frame = 0;

    update(projectiles: readonly TrailProjectile[], realDt: number, emit: (fx: Effect) => void): void {
        this.frame++;
        if (realDt <= 0) return;
        for (const proj of projectiles) {
            const def = proj.particleTrail;
            if (!proj.active || !def || def.ratePerSec <= 0) continue;
            let state = this.states.get(proj.id);
            if (!state) {
                state = { accum: 0, lastX: proj.x, lastY: proj.y, rand: moteRng(hashMoteSeed(proj.id)), seen: this.frame };
                this.states.set(proj.id, state);
            }
            state.seen = this.frame;
            state.accum += def.ratePerSec * realDt;
            const count = Math.min(MAX_EMITS_PER_FRAME, Math.floor(state.accum));
            for (let i = 0; i < count; i++) {
                // Spread along last frame's stretch (oldest first), with a little jitter off the line.
                const t = (i + state.rand()) / count;
                const x = state.lastX + (proj.x - state.lastX) * t + (state.rand() - 0.5) * 3;
                const y = state.lastY + (proj.y - state.lastY) * t + (state.rand() - 0.5) * 3;
                emit(createMote(x, y, def.spec, state.rand));
            }
            state.accum -= Math.floor(state.accum);
            state.lastX = proj.x;
            state.lastY = proj.y;
        }
        for (const [id, s] of this.states) {
            if (s.seen !== this.frame) this.states.delete(id);
        }
    }
}
