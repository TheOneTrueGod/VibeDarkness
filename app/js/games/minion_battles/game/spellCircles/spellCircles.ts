/**
 * Spell circles: the visual a caster draws around themselves while a cast charges.
 *
 * A spell circle is a classification of windup visual, not a single effect. It is roughly circular,
 * roughly symmetrical, follows the caster, runs on the caster's clock (haste and slow change its pace),
 * freezes at a pause plane, fizzles out if the cast is cut (`game/effects/castBound.ts`), and hides while
 * its caster is invisible to the local team (`Effect.concealedWithOwner`). Each core
 * tree has one style, so a glance tells you whose power is gathering.
 *
 * A style is a {@link SpellCircleStyleDef}: the effect type that paints it plus its default size, colours
 * and how long it lingers after the cast lands. Built-in styles are below; content may add more with
 * {@link registerSpellCircleStyle}. Abilities spawn one with `CastBehaviours.SpellCircle({ style })` on a
 * windup interval, or {@link spawnSpellCircle} from a hook.
 *
 * Use them sparingly: they mark medium windups (roughly 0.4 to 1.5 seconds) on medium-scale effects, and
 * read as a symbol of power. A quick jab or a basic attack should not draw one.
 */
import { Effect } from '../effects/Effect';
import type { CastBoundData } from '../effects/castBound';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { COMMAND_THEME, EARTH_THEME, LIGHT_THEME, STORM_THEME, WATER_THEME } from '../../themes/abilityThemes';
import { COMMAND_SPELL_CIRCLE_EFFECT_TYPE } from '../effect_defs/commandEffects';
import { MOTE_RING_SPELL_CIRCLE_EFFECT_TYPE, type RimMoteKind } from '../effect_defs/moteRingSpellCircle';
import { MOTE_PRESETS } from '../effects/motes';
import { resolveAbilityTheme, themeGlowPair } from '../../themes/abilityTheme';
import { WEAPON_ORBIT_EFFECT_TYPE } from '../effect_defs/weaponEffects';
import { DEFAULT_WEAPON_ORBIT_RADIUS } from '../effect_defs/weaponOrbit';
import {
    EARTH_SPELL_CIRCLE_EFFECT_TYPE,
    LIGHT_SPELL_CIRCLE_EFFECT_TYPE,
    STORM_SPELL_CIRCLE_EFFECT_TYPE,
} from '../effect_defs/spellCircleEffects';

export interface SpellCircleStyleDef {
    /** Style id, usually the theme id of the tree that owns it (`'storm'`, `'earth'`, `'armory'`). */
    id: string;
    /** Effect type that paints the circle. Its painter reads `effectData` (see {@link SpellCircleEffectData}). */
    effectType: string;
    /** Default circle radius in pixels. */
    radius: number;
    /**
     * Seconds the circle keeps playing after the cast lands (a slam settling, a flash fading). The cast
     * moment is passed to the painter as `castAt`, a share of the effect's life.
     */
    linger?: number;
    /** Default style data (colours, counts) merged under a spec's `data`. */
    data?: Readonly<Record<string, unknown>>;
}

/** What an ability asks for. Omitted fields use the style's defaults. */
export interface SpellCircleSpec {
    style: string;
    /** Circle radius in pixels. */
    radius?: number;
    /** Override `linger` seconds. */
    linger?: number;
    /** Style data overrides (e.g. `boltCount` for storm, `weaponKind` for armory). */
    data?: Record<string, unknown>;
}

/** Fields every spell circle painter can read from `effectData`. */
export interface SpellCircleEffectData {
    radius: number;
    /** Share (0..1) of the effect's life at which the cast lands. */
    castAt: number;
    /** Caster body radius, so a circle can keep clear of the body. */
    casterRadius: number;
    followOwner: true;
    castBound: CastBoundData;
    /** 0 normally; ramps to 1 when the cast is cut (see `castBoundAlpha`). */
    fizzle?: number;
}

export const SPELL_CIRCLE_STYLE_STORM = 'storm';
export const SPELL_CIRCLE_STYLE_EARTH = 'earth';
export const SPELL_CIRCLE_STYLE_EARTH_LIGHT = 'earth_light';
export const SPELL_CIRCLE_STYLE_ARMORY = 'armory';
export const SPELL_CIRCLE_STYLE_LIGHT = 'light';
export const SPELL_CIRCLE_STYLE_COMMAND = 'command';
export const SPELL_CIRCLE_STYLE_WATER = 'water';

const storm = resolveAbilityTheme(STORM_THEME);
const earth = resolveAbilityTheme(EARTH_THEME);
const light = resolveAbilityTheme(LIGHT_THEME);
const commandGlow = themeGlowPair(resolveAbilityTheme(COMMAND_THEME));
const water = resolveAbilityTheme(WATER_THEME);

/**
 * Storm: a ring of lightning crackles into being around the caster, then bolts join it one pair at a
 * time (up to six), racing around the ring until the charge is let go in a flash.
 */
const STORM_STYLE: SpellCircleStyleDef = {
    id: SPELL_CIRCLE_STYLE_STORM,
    effectType: STORM_SPELL_CIRCLE_EFFECT_TYPE,
    radius: 1.4 * CELL_SIZE,
    linger: 0.12,
    data: {
        color: storm.secondaryNum,
        coreColor: 0xffffff,
        massColor: storm.primaryNum,
        boltCount: 6,
    },
};

/**
 * Earth: pebbles and stones shake loose and lift off the ground in a ring around the caster, hang there
 * as the charge builds, then slam down together as the ability lands.
 */
const EARTH_STYLE: SpellCircleStyleDef = {
    id: SPELL_CIRCLE_STYLE_EARTH,
    effectType: EARTH_SPELL_CIRCLE_EFFECT_TYPE,
    radius: 1.3 * CELL_SIZE,
    linger: 0.3,
    data: {
        // The stones are the ground's own grey-brown; the theme colours the dust and the outlines.
        stoneColor: 0x8a7766,
        stoneShadeColor: earth.shadeNum,
        dustColor: earth.primaryNum,
        stoneCount: 10,
    },
};

/**
 * Earth, light: the same stones, fewer and smaller, that hop up and drop back quickly. For short
 * charge beats (Rock Slide draws one before the rock breaks and another before it flies).
 */
const EARTH_LIGHT_STYLE: SpellCircleStyleDef = {
    id: SPELL_CIRCLE_STYLE_EARTH_LIGHT,
    effectType: EARTH_SPELL_CIRCLE_EFFECT_TYPE,
    radius: 1.05 * CELL_SIZE,
    linger: 0.15,
    data: {
        ...EARTH_STYLE.data,
        stoneCount: 6,
        stoneScale: 0.8,
        shakeEnd: 0.05,
        lastLiftStart: 0.15,
        liftTime: 0.3,
        slamStart: 0.62,
        liftPx: 8,
    },
};

/**
 * Light: a soft glow swells around the caster under a faint halo, breathing gently, while motes of
 * light gather in mirrored pairs. At the cast it blooms outward and fades.
 */
const LIGHT_STYLE: SpellCircleStyleDef = {
    id: SPELL_CIRCLE_STYLE_LIGHT,
    effectType: LIGHT_SPELL_CIRCLE_EFFECT_TYPE,
    radius: 1.2 * CELL_SIZE,
    linger: 0.3,
    data: {
        color: light.primaryNum,
        // The pale centre of the glow; the Light theme has no secondary yet.
        coreColor: 0xfff7d6,
        moteCount: 8,
    },
};

/**
 * Armory: pictures of the weapon being forged spin out around the caster, circle, and come back in to
 * the hand. Painted by the conjure orbit (`WEAPON_ORBIT_EFFECT_TYPE`); `data.weaponKind` picks the art.
 */
const ARMORY_STYLE: SpellCircleStyleDef = {
    id: SPELL_CIRCLE_STYLE_ARMORY,
    effectType: WEAPON_ORBIT_EFFECT_TYPE,
    radius: DEFAULT_WEAPON_ORBIT_RADIUS,
};

/**
 * Command (the spirit animal): a pine ring with a turning lime rune band, shedding motes that rise off its
 * rim in mirrored pairs. At the cast the ring flares and the motes leap away.
 */
const COMMAND_STYLE: SpellCircleStyleDef = {
    id: SPELL_CIRCLE_STYLE_COMMAND,
    effectType: COMMAND_SPELL_CIRCLE_EFFECT_TYPE,
    radius: 1.2 * CELL_SIZE,
    linger: 0.25,
    data: {
        ringColor: commandGlow.dark,
        runeColor: commandGlow.light,
        moteColor: commandGlow.light,
        glowColor: commandGlow.dark,
        moteCount: 13,
    },
};

/**
 * Water (Tidewater): a navy ring with a turning band of seafoam rune dashes. Ice shards tumble off its rim
 * and water droplets are flicked up and fall back (`gravityPx`), interleaved round it. At the cast the ring
 * flares and the motes burst away. Painted by the data-driven `SpellCircleMoteRing`; the counts sit a little
 * under the particle studio's Ring counts (shards 16, droplets 18) since the two kinds share one rim.
 */
const WATER_RIM_MOTES: readonly RimMoteKind[] = [
    { spec: MOTE_PRESETS.iceShards(WATER_THEME.id), count: 14 },
    { spec: MOTE_PRESETS.droplets(WATER_THEME.id), count: 16 },
];

const WATER_STYLE: SpellCircleStyleDef = {
    id: SPELL_CIRCLE_STYLE_WATER,
    effectType: MOTE_RING_SPELL_CIRCLE_EFFECT_TYPE,
    radius: 1.2 * CELL_SIZE,
    linger: 0.25,
    data: {
        ringColor: water.primaryNum,
        runeColor: water.secondaryNum,
        // The studio ring turns once every 4 s.
        runeTurnsPerSec: 0.25,
        runePairs: 10,
        rimMotes: WATER_RIM_MOTES,
    },
};

const STYLES = new Map<string, SpellCircleStyleDef>(
    [STORM_STYLE, EARTH_STYLE, EARTH_LIGHT_STYLE, LIGHT_STYLE, ARMORY_STYLE, COMMAND_STYLE, WATER_STYLE].map((s) => [
        s.id,
        s,
    ]),
);

/** Add or replace a style. Content registers its own styles at load (like conjured weapons). */
export function registerSpellCircleStyle(def: SpellCircleStyleDef): void {
    STYLES.set(def.id, def);
}

export function getSpellCircleStyle(id: string): SpellCircleStyleDef | undefined {
    return STYLES.get(id);
}

export function listSpellCircleStyles(): SpellCircleStyleDef[] {
    return [...STYLES.values()];
}

interface SpellCircleCaster {
    id: string;
    x: number;
    y: number;
    radius: number;
}

export interface SpawnSpellCircleOptions {
    /** Owner-local seconds from now until the cast lands (normally the windup window). */
    castSeconds: number;
    /** The cast the circle belongs to; the circle fizzles if the caster stops casting it early. */
    abilityId: string;
}

/** The effect for a spell circle, or undefined for an unknown style. Pure; does not add it anywhere. */
export function createSpellCircleEffect(
    caster: SpellCircleCaster,
    spec: SpellCircleSpec,
    opts: SpawnSpellCircleOptions,
): Effect | undefined {
    const style = getSpellCircleStyle(spec.style);
    if (!style) return undefined;
    const castSeconds = Math.max(0.05, opts.castSeconds);
    const linger = Math.max(0, spec.linger ?? style.linger ?? 0);
    const duration = castSeconds + linger;
    const castAt = castSeconds / duration;
    const data: SpellCircleEffectData & Record<string, unknown> = {
        ...style.data,
        ...spec.data,
        radius: spec.radius ?? style.radius,
        castAt,
        casterRadius: caster.radius,
        followOwner: true,
        castBound: { abilityId: opts.abilityId, castAt },
    };
    return new Effect({
        x: caster.x,
        y: caster.y,
        duration,
        effectType: style.effectType,
        timeDomain: 'owner',
        ownerActorId: caster.id,
        pauseBehaviour: 'hold',
        // A spell circle would give away a caster the local team can't see.
        concealedWithOwner: true,
        effectData: data,
    });
}

/** Spawn a spell circle on `caster`. Returns false (and spawns nothing) for an unknown style. */
export function spawnSpellCircle(
    engine: { addEffect?(effect: Effect): void },
    caster: SpellCircleCaster,
    spec: SpellCircleSpec,
    opts: SpawnSpellCircleOptions,
): boolean {
    const effect = createSpellCircleEffect(caster, spec, opts);
    if (!effect) return false;
    engine.addEffect?.(effect);
    return true;
}
