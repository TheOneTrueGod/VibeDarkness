/**
 * Armory visuals: weapons orbiting the caster, the short discard arc, and the whirl ring.
 * The orbit and the arc draw the picture for `effectData.weaponKind` (a sword when omitted).
 * They are unserialized effects. The dropped token is the gameplay object.
 */
import { Container, Graphics } from 'pixi.js';
import type { Sprite } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import {
    ARMORY_SECONDARY_COLOR_NUM,
    CONJURE_SWORD_COUNT,
    CONJURE_SWORD_SCALE,
    DROPPED_WEAPON_ARC_LIFT,
    DROPPED_WEAPON_KIND_SWORD,
    MACE_WHIRL_VISUAL_RADIUS,
} from '../../card_defs/10_armory_core/armoryConstants';
import { conjureSwordPose } from './conjureSwordOrbit';
import {
    DISCARD_SWORD_SCALE,
    createWeaponCardSprite,
    sizeSwordCardSprite,
    syncWeaponCardTexture,
} from '../fieldObjects/swordCardSprite';

const DISCARD_FADE_START = 0.9;
/** One full turn over the discard flight. */
const DISCARD_ARC_TURNS = 1;

export const conjureSwordEffectDef: IEffectDef = {
    createVisual(effect: Effect): Container {
        const root = new Container();
        const kind = weaponKind(effect);
        for (let i = 0; i < CONJURE_SWORD_COUNT; i++) {
            root.addChild(createWeaponCardSprite(kind));
        }
        return root;
    },
    updateVisual(visual, effect: Effect, _context: IEffectRenderContext): void {
        const progress = effect.progress;
        const kind = weaponKind(effect);
        for (let i = 0; i < visual.children.length; i++) {
            const sprite = visual.children[i] as Sprite | undefined;
            if (!sprite) continue;
            syncWeaponCardTexture(sprite, kind);
            const pose = conjureSwordPose(i, progress);
            sprite.position.set(pose.x, pose.y);
            sprite.rotation = pose.rotation;
            sprite.alpha = pose.alpha;
            sizeSwordCardSprite(sprite, CONJURE_SWORD_SCALE);
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
        const landX = numberField(effect.effectData, 'landX');
        const landY = numberField(effect.effectData, 'landY');
        const lift = numberField(effect.effectData, 'lift') || DROPPED_WEAPON_ARC_LIFT;
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
        const restRotation = numberField(effect.effectData, 'restRotation');
        sprite.rotation = t * Math.PI * 2 * DISCARD_ARC_TURNS + restRotation;
        sizeSwordCardSprite(sprite, DISCARD_SWORD_SCALE);
        sprite.alpha = t < DISCARD_FADE_START ? 1 : 1 - (t - DISCARD_FADE_START) / (1 - DISCARD_FADE_START);
    },
};

export const maceWhirlEffectDef: IEffectDef = {
    createVisual(): Container {
        return new Graphics();
    },
    updateVisual(visual, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const radius = numberField(effect.effectData, 'radius') || MACE_WHIRL_VISUAL_RADIUS;
        const p = effect.progress;
        g.circle(0, 0, radius * (0.35 + 0.65 * p));
        g.stroke({
            color: ARMORY_SECONDARY_COLOR_NUM,
            width: 3,
            alpha: 1 - p,
        });
    },
};

function weaponKind(effect: Effect): string {
    const value = effect.effectData?.weaponKind;
    return typeof value === 'string' ? value : DROPPED_WEAPON_KIND_SWORD;
}

function numberField(data: Record<string, unknown>, key: string): number {
    const value = data[key];
    return typeof value === 'number' ? value : 0;
}
