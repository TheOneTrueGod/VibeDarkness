/**
 * Armory visuals: the sword condensing into the caster, and the short discard arc.
 * Both use the sword ability-card image. They are unserialized effects.
 * The dropped token is the gameplay object.
 */
import { Container } from 'pixi.js';
import type { Sprite } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { DROPPED_WEAPON_ARC_LIFT } from '../../card_defs/10_armory_core/armoryConstants';
import {
    CONJURE_SWORD_SCALE_END,
    CONJURE_SWORD_SCALE_START,
    DISCARD_SWORD_SCALE,
    createSwordCardSprite,
    sizeSwordCardSprite,
    syncSwordCardTexture,
} from '../fieldObjects/swordCardSprite';

const CONJURE_FADE_IN_END = 0.85;
const CONJURE_ALPHA_START = 0.28;
const DISCARD_FADE_START = 0.9;
/** One full turn over the discard flight. */
const DISCARD_ARC_TURNS = 1;

export const conjureSwordEffectDef: IEffectDef = {
    createVisual(): Container {
        return createSwordCardSprite();
    },
    updateVisual(visual, effect: Effect, _context: IEffectRenderContext): void {
        const sprite = visual as Sprite;
        syncSwordCardTexture(sprite);
        const t = effect.progress;
        const scale = CONJURE_SWORD_SCALE_START + (CONJURE_SWORD_SCALE_END - CONJURE_SWORD_SCALE_START) * t;
        const alpha = t < CONJURE_FADE_IN_END
            ? CONJURE_ALPHA_START + (1 - CONJURE_ALPHA_START) * (t / CONJURE_FADE_IN_END)
            : 1 - (t - CONJURE_FADE_IN_END) / (1 - CONJURE_FADE_IN_END);
        sizeSwordCardSprite(sprite, Math.max(CONJURE_SWORD_SCALE_END, scale));
        sprite.alpha = Math.max(0, alpha);
        sprite.rotation = 0;
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
