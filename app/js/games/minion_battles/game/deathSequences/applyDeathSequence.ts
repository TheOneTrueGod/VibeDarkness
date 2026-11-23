/**
 * applyDeathSequence — starts a DeathSequenceDef at a dying unit: story pause, remnant,
 * emitters and one-shot visuals. Called from the engine's `unit_died` listener.
 */

import type { EngineContext } from '../EngineContext';
import type { DeathSequenceDef, DeathSequenceEmitterDef } from './deathSequenceDef';
import type { EffectEmitter } from '../effects/EffectEmitter';
import { AlphaWolfStoryEmitter } from '../effects/AlphaWolfStoryEmitter';
import { SpriteFountainEmitter } from '../effects/SpriteFountainEmitter';
import { applyVisualEffectDefs, spawnDeathRemnant } from '../effects/applyVisualEffectDefs';

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
    if (def.remnant) spawnDeathRemnant(engine, unit, def.remnant);
    for (const emitterDef of def.emitters ?? []) {
        engine.addEffectEmitter(createEmitter(emitterDef, unit.x, unit.y));
    }
    if (def.visualEffects?.length) applyVisualEffectDefs(def.visualEffects, unit, engine);
}
