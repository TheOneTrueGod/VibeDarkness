/**
 * Spirit motes and the systems that shed them: the mote spawner, unit-def particle auras, projectile
 * particle trails, the Command spell circle and the command cue.
 */
import { describe, expect, it } from 'vitest';
import type { Effect } from './Effect';
import { createMote, MOTE_EFFECT_TYPE, MOTE_PRESETS, moteFlicker, moteRng } from './motes';
import { BUFF_PARTICLE_AURA_PRESETS, BuffRenderEmitterSystem } from './buffParticleAura';
import { PROJECTILE_PARTICLE_TRAIL_PRESETS, ProjectileParticleTrailSystem } from './projectileParticleTrails';
import { COMMAND_CUE_EFFECT_TYPE } from './commandCue';
import { Projectile } from '../projectiles/Projectile';
import type { Unit } from '../units/Unit';
import { getUnitParticleAura, getUnitSpectralSprite } from '../units/unit_defs/unitDef';
import { getSpellCircleStyle, SPELL_CIRCLE_STYLE_COMMAND } from '../spellCircles/spellCircles';
import { COMMAND_SPELL_CIRCLE_EFFECT_TYPE, commandRingSlot } from '../effect_defs/commandEffects';
import { playCommandCues } from '../../abilities/petCommands';
import { getThemeById, themeGlowPair } from '../../themes/abilityTheme';

describe('createMote', () => {
    it('starts at the spawn point and rises', () => {
        const fx = createMote(100, 200, MOTE_PRESETS.spirit(), moteRng(1));
        expect(fx.effectType).toBe(MOTE_EFFECT_TYPE);
        expect(fx.x).toBe(100);
        expect(fx.y).toBe(200);
        expect(fx.pauseBehaviour).toBe('continue');
        fx.renderUpdate(fx.duration * 0.99);
        expect(fx.y).toBeLessThan(200);
    });

    it('uses the Command colours for the spirit preset', () => {
        const spec = MOTE_PRESETS.spirit();
        const { light, dark } = themeGlowPair(getThemeById('command'));
        expect(spec.color).toBe(light);
        expect(spec.glowColor).toBe(dark);
        expect(light).toBe(0xd9f99d);
    });

    it('flickers between 0.35 and 1, and is steady at 0 Hz', () => {
        for (let t = 0; t < 2; t += 0.05) {
            const f = moteFlicker(t, 2.2, 0.3);
            expect(f).toBeGreaterThanOrEqual(0.35 - 1e-9);
            expect(f).toBeLessThanOrEqual(1 + 1e-9);
        }
        expect(moteFlicker(1.23, 0, 0)).toBe(1);
    });
});

function fakeUnit(over: Partial<Unit> = {}): Unit {
    return {
        id: 'u1',
        characterId: 'dog',
        x: 50,
        y: 50,
        radius: 12,
        active: true,
        buffs: [],
        movement: undefined,
        isAlive: () => true,
        ...over,
    } as unknown as Unit;
}

describe('unit-def particle aura', () => {
    it('gives the spirit dog a mote aura and a spectral sprite', () => {
        expect(getUnitParticleAura('dog')?.motes).toBeDefined();
        expect(getUnitSpectralSprite('dog')?.tint).toBe(themeGlowPair(getThemeById('command')).light);
        expect(getUnitParticleAura('husk')).toBeUndefined();
    });

    it('sheds motes from a unit with no buffs when its def declares an aura', () => {
        const system = new BuffRenderEmitterSystem();
        const out: Effect[] = [];
        const aura = BUFF_PARTICLE_AURA_PRESETS.spiritMotes();
        for (let i = 0; i < 30; i++) {
            system.update([fakeUnit()], 1 / 30, (fx) => out.push(fx), undefined, () => aura);
        }
        expect(out.length).toBeGreaterThan(3);
        expect(out.every((fx) => fx.effectType === MOTE_EFFECT_TYPE)).toBe(true);
        // Spawned inside the unit.
        for (const fx of out) expect(Math.hypot(fx.x - 50, fx.y - 50)).toBeLessThanOrEqual(12);
    });

    it('sheds nothing without a resolver or buff aura', () => {
        const system = new BuffRenderEmitterSystem();
        const out: Effect[] = [];
        for (let i = 0; i < 30; i++) system.update([fakeUnit()], 1 / 30, (fx) => out.push(fx));
        expect(out).toHaveLength(0);
    });
});

function trailProjectile(): Projectile {
    const proj = new Projectile({
        id: 'p1',
        x: 0,
        y: 0,
        velocityX: 700,
        velocityY: 0,
        damage: 5,
        sourceTeamId: 'player',
        sourceUnitId: 'u1',
        sourceAbilityId: '0705',
        maxDistance: 200,
        particleTrail: PROJECTILE_PARTICLE_TRAIL_PRESETS.spiritMotes(),
    });
    proj.active = true;
    return proj;
}

describe('projectile particle trails', () => {
    it('spreads motes along the stretch flown since the last frame', () => {
        const proj = trailProjectile();
        const system = new ProjectileParticleTrailSystem();
        const out: Effect[] = [];
        system.update([proj], 1 / 60, (fx) => out.push(fx));
        for (let i = 1; i <= 10; i++) {
            proj.x = i * 12;
            system.update([proj], 1 / 60, (fx) => out.push(fx));
        }
        expect(out.length).toBeGreaterThanOrEqual(9);
        const xs = out.map((fx) => fx.x);
        expect(Math.min(...xs)).toBeLessThan(40);
        expect(Math.max(...xs)).toBeGreaterThan(80);
    });

    it('ignores projectiles without a trail', () => {
        const proj = trailProjectile();
        proj.particleTrail = undefined;
        const out: Effect[] = [];
        new ProjectileParticleTrailSystem().update([proj], 0.5, (fx) => out.push(fx));
        expect(out).toHaveLength(0);
    });

    it('round-trips the trail through toJSON / fromJSON and omits it when unset', () => {
        const proj = trailProjectile();
        expect(Projectile.fromJSON(proj.toJSON()).particleTrail).toEqual(proj.particleTrail);
        proj.particleTrail = undefined;
        expect('particleTrail' in proj.toJSON()).toBe(false);
    });
});

describe('Command spell circle', () => {
    it('is registered with the Command painter and colours', () => {
        const style = getSpellCircleStyle(SPELL_CIRCLE_STYLE_COMMAND);
        expect(style?.effectType).toBe(COMMAND_SPELL_CIRCLE_EFFECT_TYPE);
        expect(style?.data?.ringColor).toBe(themeGlowPair(getThemeById('command')).dark);
    });

    it('places rim motes in mirrored pairs about the vertical axis', () => {
        const count = 13;
        expect(commandRingSlot(0, count).angle).toBeCloseTo(-Math.PI / 2);
        for (let k = 1; k < count; k += 2) {
            const a = commandRingSlot(k, count);
            const b = commandRingSlot(k + 1, count);
            expect(a.pair).toBe(b.pair);
            expect(Math.cos(a.angle)).toBeCloseTo(-Math.cos(b.angle));
            expect(Math.sin(a.angle)).toBeCloseTo(Math.sin(b.angle));
        }
    });
});

describe('playCommandCues', () => {
    it('plays one cue per living pet, and none without an owner', () => {
        const owner = fakeUnit({ id: 'owner' } as Partial<Unit>);
        const live = fakeUnit({ id: 'pet1' } as Partial<Unit>);
        const dead = fakeUnit({ id: 'pet2', isAlive: () => false } as Partial<Unit>);
        const effects: Effect[] = [];
        const engine = { addEffect: (e: unknown) => effects.push(e as Effect) };
        playCommandCues(owner, [live, dead], engine);
        expect(effects.map((e) => e.effectType)).toEqual([COMMAND_CUE_EFFECT_TYPE]);
        expect(effects[0]!.effectData).toMatchObject({ fromUnitId: 'owner', toUnitId: 'pet1' });
        playCommandCues(undefined, [live], engine);
        expect(effects).toHaveLength(1);
    });
});
