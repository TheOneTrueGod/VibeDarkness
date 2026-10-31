/**
 * Weapon visuals: pictures orbiting the caster, the short discard arc, and the whirl ring.
 * Each reads its shape from `effectData` and falls back to the engine defaults below.
 * The orbit and the arc draw the picture for `effectData.weaponKind` (a sword when omitted).
 * They are unserialized effects. The dropped token is the gameplay object.
 */
import { Container, Graphics } from 'pixi.js';
import type { Sprite } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import {
    DEFAULT_WEAPON_ORBIT_COUNT,
    DEFAULT_WEAPON_ORBIT_FADE_PORTION,
    DEFAULT_WEAPON_ORBIT_RADIUS,
    DEFAULT_WEAPON_ORBIT_SCALE,
    DEFAULT_WEAPON_ORBIT_TURNS,
    weaponOrbitPose,
    type WeaponOrbitShape,
} from './weaponOrbit';
import { DROPPED_WEAPON_ARC_LIFT } from '../fieldObjects/landing';
import { weaponTipOffset } from '../conjuredWeapons/registry';
import { DEFAULT_UNIT_RADIUS } from '../units/unit_defs/unitConstants';
import {
    DISCARD_SWORD_SCALE,
    createWeaponCardSprite,
    sizeWeaponCardSprite,
    syncWeaponCardTexture,
} from '../fieldObjects/weaponArt';

/** Weapons orbiting a caster while a conjure forms. Data: `count`, `radius`, `turns`, `fadePortion`, `scale`, `weaponKind`. */
export const WEAPON_ORBIT_EFFECT_TYPE = 'ConjureSword';
/** A dropped weapon's flight to its token. Data: `landX`, `landY`, `lift`, `restRotation`, `weaponKind`. */
export const WEAPON_DISCARD_ARC_EFFECT_TYPE = 'WeaponDiscardArc';
/** Expanding ring around a whirling caster. Data: `radius`, `color`. */
export const WEAPON_WHIRL_EFFECT_TYPE = 'MaceWhirl';

/** Token kind drawn when `effectData.weaponKind` is omitted. */
export const DEFAULT_EFFECT_WEAPON_KIND = 'sword';
/** Whirl ring radius when `effectData.radius` is omitted. */
export const DEFAULT_WEAPON_WHIRL_RADIUS = DEFAULT_UNIT_RADIUS * 3;
/** Whirl ring colour when `effectData.color` is omitted. */
export const DEFAULT_WEAPON_WHIRL_COLOR = 0xffffff;

const DISCARD_FADE_START = 0.9;
/** One full turn over the discard flight. */
const DISCARD_ARC_TURNS = 1;
const WHIRL_STROKE_WIDTH = 3;

export const weaponOrbitEffectDef: IEffectDef = {
    createVisual(effect: Effect): Container {
        const root = new Container();
        const kind = weaponKind(effect);
        const count = orbitShape(effect, kind).count;
        for (let i = 0; i < count; i++) {
            root.addChild(createWeaponCardSprite(kind));
        }
        return root;
    },
    updateVisual(visual, effect: Effect, _context: IEffectRenderContext): void {
        const progress = effect.progress;
        const kind = weaponKind(effect);
        const shape = orbitShape(effect, kind);
        const scale = numberOr(effect.effectData, 'scale', DEFAULT_WEAPON_ORBIT_SCALE);
        for (let i = 0; i < visual.children.length; i++) {
            const sprite = visual.children[i] as Sprite | undefined;
            if (!sprite) continue;
            syncWeaponCardTexture(sprite, kind);
            const pose = weaponOrbitPose(i, progress, shape);
            sprite.position.set(pose.x, pose.y);
            sprite.rotation = pose.rotation;
            sprite.alpha = pose.alpha;
            sizeWeaponCardSprite(sprite, scale);
        }
    },
};

export const weaponDiscardArcEffectDef: IEffectDef = {
    createVisual(effect: Effect): Container {
        const root = new Container();
        root.addChild(createWeaponCardSprite(weaponKind(effect)));
        return root;
    },
    updateVisual(visual, effect: Effect, _context: IEffectRenderContext): void {
        const sprite = visual.children[0] as Sprite | undefined;
        if (!sprite) return;
        syncWeaponCardTexture(sprite, weaponKind(effect));
        const landX = numberOr(effect.effectData, 'landX', 0);
        const landY = numberOr(effect.effectData, 'landY', 0);
        const lift = numberOr(effect.effectData, 'lift', 0) || DROPPED_WEAPON_ARC_LIFT;
        const t = effect.progress;
        const endX = landX - effect.x;
        const endY = landY - effect.y;
        const midX = endX / 2;
        const midY = endY / 2 - lift;
        const u = 1 - t;
        sprite.position.set(
            u * u * 0 + 2 * u * t * midX + t * t * endX,
            u * u * 0 + 2 * u * t * midY + t * t * endY,
        );
        const restRotation = numberOr(effect.effectData, 'restRotation', 0);
        sprite.rotation = t * Math.PI * 2 * DISCARD_ARC_TURNS + restRotation;
        sizeWeaponCardSprite(sprite, DISCARD_SWORD_SCALE);
        sprite.alpha = t < DISCARD_FADE_START ? 1 : 1 - (t - DISCARD_FADE_START) / (1 - DISCARD_FADE_START);
    },
};

export const weaponWhirlEffectDef: IEffectDef = {
    createVisual(): Container {
        return new Graphics();
    },
    updateVisual(visual, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const radius = numberOr(effect.effectData, 'radius', 0) || DEFAULT_WEAPON_WHIRL_RADIUS;
        const color = numberOr(effect.effectData, 'color', DEFAULT_WEAPON_WHIRL_COLOR);
        const p = effect.progress;
        g.circle(0, 0, radius * (0.35 + 0.65 * p));
        g.stroke({
            color,
            width: WHIRL_STROKE_WIDTH,
            alpha: 1 - p,
        });
    },
};

function orbitShape(effect: Effect, kind: string): WeaponOrbitShape {
    const data = effect.effectData;
    return {
        count: Math.max(0, Math.floor(numberOr(data, 'count', DEFAULT_WEAPON_ORBIT_COUNT))),
        radius: numberOr(data, 'radius', DEFAULT_WEAPON_ORBIT_RADIUS),
        turns: numberOr(data, 'turns', DEFAULT_WEAPON_ORBIT_TURNS),
        fadePortion: numberOr(data, 'fadePortion', DEFAULT_WEAPON_ORBIT_FADE_PORTION),
        tipOffsetRad: weaponTipOffset(kind),
    };
}

function weaponKind(effect: Effect): string {
    const value = effect.effectData?.weaponKind;
    return typeof value === 'string' ? value : DEFAULT_EFFECT_WEAPON_KIND;
}

function numberOr(data: Record<string, unknown> | undefined, key: string, fallback: number): number {
    const value = data?.[key];
    return typeof value === 'number' ? value : fallback;
}
