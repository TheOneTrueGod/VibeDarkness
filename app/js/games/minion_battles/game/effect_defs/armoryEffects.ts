/**
 * Armory visuals: four blades orbiting the caster, and the short discard arc.
 * Both use the sword ability-card image. They are unserialized effects.
 * The dropped token is the gameplay object.
 */
import { Container } from 'pixi.js';
import type { Sprite } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import {
    CONJURE_SWORD_COUNT,
    CONJURE_SWORD_SCALE,
    DROPPED_WEAPON_ARC_LIFT,
} from '../../card_defs/10_armory_core/armoryConstants';
import { conjureSwordPose } from './conjureSwordOrbit';
import {
    DISCARD_SWORD_SCALE,
    createSwordCardSprite,
    sizeSwordCardSprite,
    syncSwordCardTexture,
} from '../fieldObjects/swordCardSprite';

const DISCARD_FADE_START = 0.9;
/** One full turn over the discard flight. */
const DISCARD_ARC_TURNS = 1;

export const conjureSwordEffectDef: IEffectDef = {
    createVisual(): Container {
        const root = new Container();
        for (let i = 0; i < CONJURE_SWORD_COUNT; i++) {
            root.addChild(createSwordCardSprite());
        }
        return root;
    },
    updateVisual(visual, effect: Effect, _context: IEffectRenderContext): void {
        const progress = effect.progress;
        for (let i = 0; i < visual.children.length; i++) {
            const sprite = visual.children[i] as Sprite | undefined;
            if (!sprite) continue;
            syncSwordCardTexture(sprite);
            const pose = conjureSwordPose(i, progress);
            sprite.position.set(pose.x, pose.y);
            sprite.rotation = pose.rotation;
            sprite.alpha = pose.alpha;
            sizeSwordCardSprite(sprite, CONJURE_SWORD_SCALE);
        }
    },
};

export const weaponDiscardArcEffectDef: IEffectDef = {
    createVisual(): Container {
        const root = new Container();
        root.addChild(createSwordCardSprite());
        return root;
    },
    updateVisual(visual, effect: Effect, _context: IEffectRenderContext): void {
        const sprite = visual.children[0] as Sprite | undefined;
        if (!sprite) return;
        syncSwordCardTexture(sprite);
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

function numberField(data: Record<string, unknown>, key: string): number {
    const value = data[key];
    return typeof value === 'number' ? value : 0;
}
