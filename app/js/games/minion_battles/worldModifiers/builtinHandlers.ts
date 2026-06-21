/**
 * Built-in custom effect handlers for WorldModifierManager.
 *
 * registerLateBuiltinHandlers — handlers requiring GameState (alpha wolf, stack ghost);
 *   call from GameEngine constructor after this.state is initialized.
 *
 * Note: The former registerBuiltinHandlers (defaultDeathVfx) was removed in Step 5 of
 * visual-effect-def-death-vfx.plan.md. Death VFX is now applied directly via a
 * unit_died listener in GameEngine.registerCoreEventListeners().
 * Lanternite death (light removal + Spore Rebirth) was migrated to onDeathBehaviors
 * on the lanternite UnitDefEntry.
 *
 * See Decision A in docs/plans/world-modifiers.plan.md for migration context.
 */

import type { WorldModifierManager } from './WorldModifierManager';
import type { EngineContext } from '../game/EngineContext';
import { Effect } from '../game/effects/Effect';
import { getBodyColorForUnit, getCharacterSpriteKey } from '../game/units/unit_defs/unitDef';
import { AlphaWolfStoryEmitter } from '../game/effects/AlphaWolfStoryEmitter';
import { STACK_GHOST_DURATION } from '../game/effect_defs/movementEffects';

// ---------------------------------------------------------------------------
// Late handlers — registered after GameState is initialized (need extra state)
// ---------------------------------------------------------------------------

export function registerLateBuiltinHandlers(
    manager: WorldModifierManager,
    engine: EngineContext,
): void {
    // Alpha wolf death — story pause + cinematic effects.
    const ALPHA_WOLF_STORY_DURATION = 5;
    manager.registerCustomEffectHandler(
        'alphaWolfDeath',
        (_params, ctx) => {
            if (ctx.event.eventType !== 'on_unit_died') return;
            const unit = engine.getUnit(ctx.event.unitId);
            if (!unit) return;
            engine.startStoryPause('alpha_wolf_death', ALPHA_WOLF_STORY_DURATION);
            engine.addEffect(new Effect({
                x: unit.x,
                y: unit.y,
                duration: ALPHA_WOLF_STORY_DURATION,
                effectType: 'AlphaWolfStoryRemnant',
                effectData: {
                    remnantCharacterKey: 'alpha_wolf',
                    shakeFrequencyHz: 7,
                    shakeAmplitudePx: 2,
                },
            }));
            engine.addEffectEmitter(new AlphaWolfStoryEmitter({
                x: unit.x,
                y: unit.y,
                radialRatePerSecond: 24,
                homingRatePerSecond: 20,
            }));
        },
    );

    // Stack ghost VFX — ghost particles on simultaneous stack death.
    // Invoked directly from WorldModifierManager.registerListeners on stack_members_died.
    manager.registerCustomEffectHandler(
        'stackGhostVfx',
        (params) => {
            const unitId = params?.unitId as string | undefined;
            const count = typeof params?.count === 'number' ? params.count : 0;
            if (!unitId) return;
            const unit = engine.getUnit(unitId);
            if (!unit) return;
            const ghostCount = Math.min(5, Math.ceil(Math.sqrt(count)));
            const bodyColor = getBodyColorForUnit(unit);
            const characterSpriteKey = getCharacterSpriteKey(unit.characterId);
            for (let i = 0; i < ghostCount; i++) {
                const direction = engine.generateRandomInteger(0, 1) === 0 ? -1 : 1;
                engine.addEffect(new Effect({
                    x: unit.x,
                    y: unit.y,
                    duration: STACK_GHOST_DURATION,
                    effectType: 'StackGhost',
                    effectData: {
                        bodyColor,
                        radius: unit.radius,
                        characterSpriteKey,
                        vx: direction * engine.generateRandomInteger(80, 120),
                        vy: -engine.generateRandomInteger(100, 150),
                        direction,
                        initialAlpha: 0.8,
                    },
                }));
            }
        },
    );
}

