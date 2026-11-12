import { describe, expect, it } from 'vitest';
import { Effect } from '../effects/Effect';
import { CAST_BOUND_FIZZLE_SECONDS, castBoundAlpha, updateCastBound } from '../effects/castBound';
import { WEAPON_ORBIT_EFFECT_TYPE } from '../effect_defs/weaponEffects';
import {
    EARTH_SPELL_CIRCLE_EFFECT_TYPE,
    LIGHT_SPELL_CIRCLE_EFFECT_TYPE,
    STORM_SPELL_CIRCLE_EFFECT_TYPE,
    lightGlowStrength,
    lightMoteJoinOrder,
    DEFAULT_EARTH_CIRCLE_TIMING,
    earthStoneHeight,
    earthStoneRing,
    spellCirclePhase,
    stormBoltJoinOrder,
    stormBoltsAt,
} from '../effect_defs/spellCircleEffects';
import { effectDefRegistry } from '../effect_defs';
import {
    MOTE_RING_SPELL_CIRCLE_EFFECT_TYPE,
    moteRingSlots,
    moteRingSpellCircleEffectDef,
    readRimMotes,
} from '../effect_defs/moteRingSpellCircle';
import { loopingMotePose, MOTE_PRESETS } from '../effects/motes';
import { getThemeById, resolveAbilityTheme, themeGlowPair } from '../../themes/abilityTheme';
import type { Container, Graphics } from 'pixi.js';
import type { IEffectRenderContext } from '../effect_defs/types';
import {
    SPELL_CIRCLE_STYLE_ARMORY,
    SPELL_CIRCLE_STYLE_EARTH,
    SPELL_CIRCLE_STYLE_EARTH_LIGHT,
    SPELL_CIRCLE_STYLE_LIGHT,
    SPELL_CIRCLE_STYLE_STORM,
    SPELL_CIRCLE_STYLE_WATER,
    createSpellCircleEffect,
    getSpellCircleStyle,
    listSpellCircleStyles,
    registerSpellCircleStyle,
    spawnSpellCircle,
} from './spellCircles';

const CASTER = { id: 'caster', x: 100, y: 50, radius: 20 };

describe('spell circle styles', () => {
    it('has one built-in style per core tree with a painter registered for it', () => {
        const ids = listSpellCircleStyles().map((s) => s.id);
        expect(ids).toEqual(expect.arrayContaining([SPELL_CIRCLE_STYLE_STORM, SPELL_CIRCLE_STYLE_EARTH, SPELL_CIRCLE_STYLE_ARMORY]));
        expect(getSpellCircleStyle(SPELL_CIRCLE_STYLE_STORM)?.effectType).toBe(STORM_SPELL_CIRCLE_EFFECT_TYPE);
        expect(getSpellCircleStyle(SPELL_CIRCLE_STYLE_EARTH)?.effectType).toBe(EARTH_SPELL_CIRCLE_EFFECT_TYPE);
        expect(getSpellCircleStyle(SPELL_CIRCLE_STYLE_LIGHT)?.effectType).toBe(LIGHT_SPELL_CIRCLE_EFFECT_TYPE);
        expect(getSpellCircleStyle(SPELL_CIRCLE_STYLE_ARMORY)?.effectType).toBe(WEAPON_ORBIT_EFFECT_TYPE);
        for (const style of listSpellCircleStyles()) {
            expect(effectDefRegistry[style.effectType], style.id).toBeDefined();
        }
    });

    it('builds a caster-following, owner-clocked, cast-bound effect that lands the cast at castAt', () => {
        const effect = createSpellCircleEffect(CASTER, { style: SPELL_CIRCLE_STYLE_EARTH, radius: 70, linger: 0.25 }, {
            castSeconds: 0.75,
            abilityId: '0530',
        })!;
        expect(effect.effectType).toBe(EARTH_SPELL_CIRCLE_EFFECT_TYPE);
        expect(effect.duration).toBeCloseTo(1);
        expect(effect.timeDomain).toBe('owner');
        expect(effect.ownerActorId).toBe(CASTER.id);
        expect(effect.pauseBehaviour).toBe('hold');
        // Hides while the caster is invisible to the local team.
        expect(effect.concealedWithOwner).toBe(true);
        expect(effect.effectData).toMatchObject({
            radius: 70,
            castAt: 0.75,
            casterRadius: 20,
            followOwner: true,
            castBound: { abilityId: '0530', castAt: 0.75 },
        });
        // Style defaults reach the painter; spec data wins over them.
        expect(effect.effectData.stoneCount).toBe(10);
        const custom = createSpellCircleEffect(CASTER, { style: SPELL_CIRCLE_STYLE_STORM, data: { boltCount: 4 } }, {
            castSeconds: 0.5,
            abilityId: '1304',
        })!;
        expect(custom.effectData.boltCount).toBe(4);
    });

    it('spawns nothing for an unknown style, and content can register its own', () => {
        const added: Effect[] = [];
        const sink = { addEffect: (e: Effect) => added.push(e) };
        expect(spawnSpellCircle(sink, CASTER, { style: 'nope' }, { castSeconds: 1, abilityId: 'x' })).toBe(false);
        registerSpellCircleStyle({ id: 'test_style', effectType: STORM_SPELL_CIRCLE_EFFECT_TYPE, radius: 33 });
        expect(spawnSpellCircle(sink, CASTER, { style: 'test_style' }, { castSeconds: 1, abilityId: 'x' })).toBe(true);
        expect(added).toHaveLength(1);
        expect(added[0]!.effectData.radius).toBe(33);
        expect(added[0]!.duration).toBe(1);
    });
});

describe('cast-bound fizzle', () => {
    function boundEffect(castAt = 1): Effect {
        return new Effect({
            x: 0,
            y: 0,
            duration: 1,
            effectType: STORM_SPELL_CIRCLE_EFFECT_TYPE,
            ownerActorId: CASTER.id,
            effectData: { castBound: { abilityId: '1304', castAt } },
        });
    }

    it('lives while its owner is casting, fizzles out on wall time once the cast is cut, then is removed', () => {
        const casting = { activeAbilities: [{ abilityId: '1304' }] };
        const idle = { activeAbilities: [] as { abilityId: string }[] };
        let owner = casting;
        const effect = boundEffect();
        expect(updateCastBound(effect, 0.1, () => owner)).toBe(false);
        effect.renderUpdate(0.3);
        owner = idle;
        expect(updateCastBound(effect, 0.016, () => owner)).toBe(true);
        expect(castBoundAlpha(effect)).toBe(1);
        const frozen = effect.progress;
        updateCastBound(effect, CAST_BOUND_FIZZLE_SECONDS / 2, () => owner);
        expect(castBoundAlpha(effect)).toBeCloseTo(0.5);
        expect(effect.progress).toBe(frozen);
        expect(effect.active).toBe(true);
        updateCastBound(effect, CAST_BOUND_FIZZLE_SECONDS, () => owner);
        expect(effect.active).toBe(false);
    });

    it('does not fizzle once the cast has landed (the linger plays out)', () => {
        const effect = boundEffect(0.6);
        effect.renderUpdate(0.7);
        expect(updateCastBound(effect, 0.016, () => ({ activeAbilities: [] }))).toBe(false);
    });

    it('fizzles when the owner is gone, and ignores effects that are not cast-bound', () => {
        expect(updateCastBound(boundEffect(), 0.016, () => undefined)).toBe(true);
        const plain = new Effect({ x: 0, y: 0, duration: 1, effectType: 'Pulse' });
        expect(updateCastBound(plain, 0.016, () => undefined)).toBe(false);
    });
});

describe('spell circle shapes', () => {
    it('splits progress into the charge and the linger after the cast', () => {
        expect(spellCirclePhase(0.4, 0.8)).toEqual({ charge: 0.5, linger: 0 });
        expect(spellCirclePhase(0.9, 0.8).charge).toBe(1);
        expect(spellCirclePhase(0.9, 0.8).linger).toBeCloseTo(0.5);
        expect(spellCirclePhase(1, 1)).toEqual({ charge: 1, linger: 1 });
    });

    it('storm: the ring forms first, then bolts join in opposite pairs up to six', () => {
        expect(stormBoltsAt(0.1, 6)).toBe(0);
        expect(stormBoltsAt(0.31, 6)).toBe(1);
        const counts = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((c) => stormBoltsAt(c, 6));
        for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
        expect(stormBoltsAt(0.9, 6)).toBe(6);
        expect(stormBoltsAt(1, 6)).toBe(6);
        expect(stormBoltJoinOrder(6)).toEqual([0, 3, 1, 4, 2, 5]);
        expect([...stormBoltJoinOrder(5)].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('earth: stones mirror across the vertical axis, lift top pair first, and are down on the cast', () => {
        const stones = earthStoneRing(10, 50);
        for (let i = 1; i < 10; i++) {
            const a = stones[i]!;
            const b = stones[10 - i]!;
            expect(a.size).toBe(b.size);
            expect(a.dist).toBe(b.dist);
            expect(Math.cos(a.angle)).toBeCloseTo(-Math.cos(b.angle));
            expect(Math.sin(a.angle)).toBeCloseTo(Math.sin(b.angle));
        }
        const top = stones[0]!;
        const bottom = stones[5]!;
        expect(earthStoneHeight(top, 0)).toBe(0);
        expect(earthStoneHeight(top, 0.3)).toBeGreaterThan(0);
        expect(earthStoneHeight(bottom, 0.3)).toBeLessThan(earthStoneHeight(top, 0.3));
        expect(earthStoneHeight(bottom, 0.7)).toBeGreaterThan(5);
        for (const s of stones) expect(earthStoneHeight(s, 1)).toBeCloseTo(0);
    });

    it('light: the glow swells over the first part of the charge and motes join top first, then in mirrored pairs', () => {
        expect(lightGlowStrength(0)).toBe(0);
        expect(lightGlowStrength(0.3)).toBeGreaterThan(0.5);
        expect(lightGlowStrength(0.8)).toBe(1);
        expect(lightMoteJoinOrder(8)).toEqual([0, 1, 7, 2, 6, 3, 5, 4]);
        expect([...lightMoteJoinOrder(5)].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('earth_light: fewer, lower stones that rise and are already falling by mid-charge', () => {
        const light = getSpellCircleStyle(SPELL_CIRCLE_STYLE_EARTH_LIGHT)!;
        const full = getSpellCircleStyle(SPELL_CIRCLE_STYLE_EARTH)!;
        expect(light.effectType).toBe(full.effectType);
        expect(light.data!.stoneCount as number).toBeLessThan(full.data!.stoneCount as number);
        const timing = { ...DEFAULT_EARTH_CIRCLE_TIMING, ...(light.data as object) };
        const top = earthStoneRing(6, 40)[0]!;
        const peak = Math.max(...[0.2, 0.3, 0.4, 0.5].map((c) => earthStoneHeight(top, c, timing)));
        expect(peak).toBeGreaterThan(0);
        expect(peak).toBeLessThan(DEFAULT_EARTH_CIRCLE_TIMING.liftPx + top.lift);
        expect(earthStoneHeight(top, 0.8, timing)).toBeLessThan(peak);
        expect(earthStoneHeight(top, 1, timing)).toBeCloseTo(0);
    });
});

describe('water spell circle', () => {
    const style = () => getSpellCircleStyle(SPELL_CIRCLE_STYLE_WATER)!;

    it('is registered with the data-driven mote-ring painter in Tidewater colours', () => {
        expect(style().effectType).toBe(MOTE_RING_SPELL_CIRCLE_EFFECT_TYPE);
        expect(effectDefRegistry[MOTE_RING_SPELL_CIRCLE_EFFECT_TYPE]).toBe(moteRingSpellCircleEffectDef);
        const water = resolveAbilityTheme(getThemeById('water'));
        expect(style().data!.ringColor).toBe(water.primaryNum);
        expect(style().data!.runeColor).toBe(water.secondaryNum);
        expect(water.primaryNum).toBe(0x1e3a8a);
    });

    it('throws ice shards and gravity droplets off its rim, at about the studio ring counts', () => {
        const kinds = readRimMotes(style().data as Record<string, unknown>);
        expect(kinds.map((k) => k.spec.shape)).toEqual(['shard', 'droplet']);
        expect(kinds[0]!.spec).toEqual(MOTE_PRESETS.iceShards('water'));
        expect(kinds[1]!.spec).toEqual(MOTE_PRESETS.droplets('water'));
        expect(kinds[1]!.spec.gravityPx).toBeGreaterThan(0);
        const { light, dark } = themeGlowPair(getThemeById('water'));
        for (const k of kinds) {
            expect(k.spec.color).toBe(light);
            expect(k.spec.glowColor).toBe(dark);
            expect(k.count).toBeGreaterThanOrEqual(12);
            expect(k.count).toBeLessThanOrEqual(18);
        }
        // Reaches the painter through createSpellCircleEffect.
        const effect = createSpellCircleEffect(CASTER, { style: SPELL_CIRCLE_STYLE_WATER }, { castSeconds: 0.8, abilityId: '1503' })!;
        expect(readRimMotes(effect.effectData)).toHaveLength(2);
    });

    it('spaces each kind evenly round the rim and interleaves them, joining during the charge', () => {
        const kinds = readRimMotes(style().data as Record<string, unknown>);
        const slots = moteRingSlots(kinds);
        expect(slots).toHaveLength(kinds.reduce((n, k) => n + k.count, 0));
        for (const s of slots) {
            expect(s.joinAt).toBeGreaterThanOrEqual(0.05);
            expect(s.joinAt).toBeLessThanOrEqual(0.6);
        }
        // Every quarter of the ring holds both kinds.
        for (let q = 0; q < 4; q++) {
            const inQuarter = slots.filter((s) => {
                const a = (((s.angle + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                return a >= (q * Math.PI) / 2 && a < ((q + 1) * Math.PI) / 2;
            });
            expect(new Set(inQuarter.map((s) => s.kind)).size).toBe(2);
        }
        expect(moteRingSlots(kinds)).toEqual(slots);
    });

    it('paints the rune arcs, shards and droplets while charging', () => {
        const calls: string[] = [];
        const record = (name: string) => (..._args: unknown[]) => {
            calls.push(name);
            return g;
        };
        const g = new Proxy({ alpha: 1 } as Record<string, unknown>, {
            get: (target, name: string) => (name === 'alpha' ? target.alpha : record(name)),
        }) as unknown as Graphics;
        const effect = createSpellCircleEffect(CASTER, { style: SPELL_CIRCLE_STYLE_WATER }, { castSeconds: 0.8, abilityId: '1503' })!;
        effect.renderUpdate(0.7);
        moteRingSpellCircleEffectDef.updateVisual(g as unknown as Container, effect, {} as IEffectRenderContext);
        expect(calls).toContain('poly');
        expect(calls).toContain('ellipse');
        expect(calls).toContain('arc');
    });
});

describe('loopingMotePose', () => {
    it('loops a gravity droplet: rises, then falls back below its anchor, the same on every call', () => {
        const spec = MOTE_PRESETS.droplets('water');
        const samples = Array.from({ length: 400 }, (_, i) => loopingMotePose(spec, 42, i * 0.01));
        expect(Math.min(...samples.map((p) => p.dy))).toBeLessThan(-spec.risePx * 0.6);
        expect(Math.max(...samples.map((p) => p.dy))).toBeGreaterThan(0);
        expect(Math.max(...samples.map((p) => p.dy))).toBeLessThanOrEqual(spec.gravityPx! + 1e-9);
        expect(loopingMotePose(spec, 42, 1.234)).toEqual(loopingMotePose(spec, 42, 1.234));
        expect(loopingMotePose(spec, 43, 1.234)).not.toEqual(loopingMotePose(spec, 42, 1.234));
    });

    it('a straight-rising shard only climbs and tumbles as it goes', () => {
        const spec = MOTE_PRESETS.iceShards('water');
        const a = loopingMotePose(spec, 7, 0.3);
        expect(a.dy).toBeLessThanOrEqual(0);
        expect(a.life).toBeGreaterThanOrEqual(0);
        expect(a.life).toBeLessThan(1);
        const angles = new Set([0.1, 0.2, 0.3].map((t) => loopingMotePose(spec, 7, t).angle.toFixed(4)));
        expect(angles.size).toBeGreaterThan(1);
    });
});
