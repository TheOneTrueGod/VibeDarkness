/**
 * applyDeathSequence — starts a DeathSequenceDef at a dying unit: story pause, remnant,
 * emitters and one-shot visuals. Called from the engine's `unit_died` listener.
 */

import type { EngineContext } from '../EngineContext';
import type { DeathSequenceDef, DeathSequenceEmitterDef } from './deathSequenceDef';
import type { EffectEmitter } from '../effects/EffectEmitter';
import { Effect } from '../effects/Effect';
import { AlphaWolfStoryEmitter } from '../effects/AlphaWolfStoryEmitter';
import { SpriteFountainEmitter } from '../effects/SpriteFountainEmitter';
import { applyVisualEffectDefs } from '../effects/applyVisualEffectDefs';
import { CHARACTER_SPRITE_SCALE, getCharacterSpriteKey } from '../units/unit_defs/unitDef';

interface DyingUnit { x: number; y: number; radius: number; characterId: string }

function createEmitter(def: DeathSequenceEmitterDef, x: number, y: number): EffectEmitter {
    switch (def.type) {
        case 'alphaWolfStory':
            return new AlphaWolfStoryEmitter({
                x,
                y,
                radialRatePerSecond: def.radialRatePerSecond,
                homingRatePerSecond: def.homingRatePerSecond,
            });
        case 'spriteFountain':
            return new SpriteFountainEmitter({ x, y, config: def.config });
    }
}

export function applyDeathSequence(def: DeathSequenceDef, unit: DyingUnit, engine: EngineContext): void {
    engine.startStoryPause(def.pauseReason, def.pauseSeconds);
    if (def.remnant) {
        const { duration, characterSpriteKey, ...remnantData } = def.remnant;
        engine.addEffect(new Effect({
            x: unit.x,
            y: unit.y,
            duration,
            effectType: 'DeathRemnant',
            effectData: {
                sizePx: unit.radius * 2 * CHARACTER_SPRITE_SCALE,
                ...remnantData,
                remnantCharacterKey: characterSpriteKey ?? getCharacterSpriteKey(unit.characterId),
            },
        }));
    }
    for (const emitterDef of def.emitters ?? []) {
        engine.addEffectEmitter(createEmitter(emitterDef, unit.x, unit.y));
    }
    if (def.visualEffects?.length) applyVisualEffectDefs(def.visualEffects, unit, engine);
}
