import { describe, expect, it } from 'vitest';
import { ProjectileAfterimageSystem } from './projectileAfterimages';
import type { Effect } from './Effect';
import type { Projectile } from '../projectiles/Projectile';
import type { SpriteProjectileConfig } from '../projectiles/projectile_defs/types';
import {
    SPRITE_AFTERIMAGE_EFFECT_TYPE,
    type SpriteAfterimageEffectData,
} from '../projectiles/projectile_defs/spriteAfterimage';

const SPIN_CONFIG: SpriteProjectileConfig = {
    sprite: { frameFiles: ['sword.svg'], scale: 0.35 },
    animations: [{ type: 'rotation', mode: 'constant', degreesPerSecond: 90 }],
    afterimage: { ratePerSec: 30, durationSec: 0.2, initialAlpha: 0.5, driftPx: 10 },
};

function fakeProjectile(over: Partial<Record<string, unknown>> = {}): Projectile {
    return {
        id: 'p1',
        x: 100,
        y: 50,
        velocityX: 200,
        velocityY: 0,
        rotation: 0,
        active: true,
        spriteConfig: SPIN_CONFIG,
        ...over,
    } as unknown as Projectile;
}

/** Runs `frames` render frames at 60 fps with a frozen gameTime (as when the game is paused). */
function run(system: ProjectileAfterimageSystem, projectiles: Projectile[], frames: number, gameTime = 1): Effect[] {
    const out: Effect[] = [];
    for (let i = 0; i < frames; i++) system.update(projectiles, 1 / 60, (fx) => out.push(fx), gameTime);
    return out;
}

describe('ProjectileAfterimageSystem', () => {
    it('emits at the configured wall-clock rate, even with gameTime frozen', () => {
        const out = run(new ProjectileAfterimageSystem(), [fakeProjectile()], 60);
        // First copy on frame one, then 30/s.
        expect(out.length).toBeGreaterThanOrEqual(30);
        expect(out.length).toBeLessThanOrEqual(31);
        expect(out.every((fx) => fx.effectType === SPRITE_AFTERIMAGE_EFFECT_TYPE)).toBe(true);
        expect(out.every((fx) => fx.pauseBehaviour === 'continue')).toBe(true);
    });

    it('spawns at the projectile and drifts backward from its travel direction', () => {
        const [fx] = run(new ProjectileAfterimageSystem(), [fakeProjectile()], 1);
        expect(fx.x).toBe(100);
        fx.renderUpdate(fx.duration);
        expect(fx.x).toBeCloseTo(90);
        expect(fx.y).toBeCloseTo(50);
    });

    it('keeps the sprite and its rotation at spawn time', () => {
        const [fx] = run(new ProjectileAfterimageSystem(), [fakeProjectile()], 1, 1);
        const data = fx.effectData as unknown as SpriteAfterimageEffectData;
        expect(data.sprite).toBe(SPIN_CONFIG.sprite);
        expect(data.rotation).toBeCloseTo(Math.PI / 2);
        expect(data.initialAlpha).toBe(0.5);
    });

    it('ignores projectiles without an afterimage or that are inactive', () => {
        const plain = fakeProjectile({ id: 'p2', spriteConfig: { sprite: SPIN_CONFIG.sprite } });
        const inactive = fakeProjectile({ id: 'p3', active: false });
        expect(run(new ProjectileAfterimageSystem(), [plain, inactive], 30)).toHaveLength(0);
    });
});
