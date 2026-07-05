import { Container, Graphics, Sprite } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { CHARACTER_SPRITE_SCALE } from '../units/unit_defs/unitDef';
import { GRAVITY_VIOLET } from './aoeEffects';

export const STACK_GHOST_DURATION = 0.6;

export const NUDGE_ARROW_EFFECT_TYPE = 'NudgeArrow';

export interface NudgeArrowEffectData {
    /** Direction angle in radians. */
    direction?: number;
    color?: number;
}

/** Afterimage: unit silhouette that fades out over duration. Looks like the source unit (body + optional sprite). */
export const afterimageEffectDef: IEffectDef = {
    createVisual(effect: Effect, context: IEffectRenderContext): Container {
        const container = new Container();
        const data = effect.effectData as {
            bodyColor?: number;
            radius?: number;
            characterSpriteKey?: string;
        };
        const bodyColor = data.bodyColor ?? 0x555555;
        const radius = data.radius ?? 12;

        const body = new Graphics();
        body.circle(0, 0, radius);
        body.fill(bodyColor);
        body.stroke({ color: 0x000000, width: 1 });
        body.label = 'body';
        container.addChild(body);

        const characterSpriteKey = data.characterSpriteKey;
        const characterTexture =
            characterSpriteKey && context.getCharacterTexture?.(characterSpriteKey);
        if (characterTexture) {
            const spriteSize = radius * 2 * CHARACTER_SPRITE_SCALE;
            const charSprite = new Sprite(characterTexture);
            charSprite.anchor.set(0.5, 0.5);
            charSprite.width = spriteSize;
            charSprite.height = spriteSize;
            charSprite.label = 'characterSprite';
            container.addChild(charSprite);
        }

        return container;
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const data = effect.effectData as { initialAlpha?: number };
        const initialAlpha = data.initialAlpha ?? 1;
        // Concave curve: stays more opaque through mid-life, fades sharply at the end.
        const alpha = Math.max(0, initialAlpha * Math.pow(1 - effect.progress, 0.5));
        for (const child of visual.children) {
            child.alpha = alpha;
        }
    },
};

/** StackGhost: unit silhouette that peels off a stack, drifts up and sideways, skews, and fades. */
export const stackGhostEffectDef: IEffectDef = {
    createVisual(effect: Effect, context: IEffectRenderContext): Container {
        const container = new Container();
        const data = effect.effectData as {
            bodyColor?: number;
            radius?: number;
            characterSpriteKey?: string;
        };
        const bodyColor = data.bodyColor ?? 0x555555;
        const radius = data.radius ?? 12;

        const body = new Graphics();
        body.circle(0, 0, radius);
        body.fill(bodyColor);
        body.stroke({ color: 0x000000, width: 1 });
        container.addChild(body);

        const characterSpriteKey = data.characterSpriteKey;
        const characterTexture = characterSpriteKey && context.getCharacterTexture?.(characterSpriteKey);
        if (characterTexture) {
            const spriteSize = radius * 2 * CHARACTER_SPRITE_SCALE;
            const charSprite = new Sprite(characterTexture);
            charSprite.anchor.set(0.5, 0.5);
            charSprite.width = spriteSize;
            charSprite.height = spriteSize;
            container.addChild(charSprite);
        }

        return container;
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const data = effect.effectData as { initialAlpha?: number; direction?: number };
        const initialAlpha = data.initialAlpha ?? 0.8;
        const direction = data.direction ?? 1;
        // Linear fade out
        const alpha = Math.max(0, initialAlpha * (1 - effect.progress));
        for (const child of visual.children) {
            child.alpha = alpha;
        }
        // Skew increases as ghost tumbles away
        visual.skew.x = direction * effect.progress * 0.8;
    },
};

/** Faint directional ghost-arrow for non-interrupting nudges — no motion streak. */
export const nudgeArrowEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as NudgeArrowEffectData;
        const direction = data.direction ?? 0;
        const color = data.color ?? GRAVITY_VIOLET;
        const progress = effect.progress;
        const alpha = Math.max(0, 0.42 * (1 - progress));
        const length = 14 + (1 - progress) * 4;
        const headLength = 6;
        const cos = Math.cos(direction);
        const sin = Math.sin(direction);
        const perpCos = Math.cos(direction + Math.PI / 2);
        const perpSin = Math.sin(direction + Math.PI / 2);

        const tipX = cos * length;
        const tipY = sin * length;
        const tailX = -cos * length * 0.35;
        const tailY = -sin * length * 0.35;
        const leftX = tipX - cos * headLength + perpCos * headLength * 0.55;
        const leftY = tipY - sin * headLength + perpSin * headLength * 0.55;
        const rightX = tipX - cos * headLength - perpCos * headLength * 0.55;
        const rightY = tipY - sin * headLength - perpSin * headLength * 0.55;

        g.moveTo(tailX, tailY);
        g.lineTo(tipX, tipY);
        g.stroke({ color, width: 1.5, alpha: alpha * 0.7 });
        g.moveTo(tipX, tipY);
        g.lineTo(leftX, leftY);
        g.moveTo(tipX, tipY);
        g.lineTo(rightX, rightY);
        g.stroke({ color, width: 2, alpha });
    },
};
