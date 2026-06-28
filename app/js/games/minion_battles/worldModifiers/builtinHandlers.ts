/**
 * Built-in custom effect handlers for WorldModifierManager.
 *
 * registerLateBuiltinHandlers — handlers requiring GameState (alpha wolf);
 *   call from GameEngine constructor after this.state is initialized.
 *
 * Note: The former registerBuiltinHandlers (defaultDeathVfx) was removed in Step 5 of
 * visual-effect-def-death-vfx.plan.md. Death VFX is now applied directly via a
 * unit_died listener in GameEngine.registerCoreEventListeners().
 * Lanternite death (light removal + Spore Rebirth) was migrated to onDeathBehaviors
 * on the lanternite UnitDefEntry.
 * Stack ghost VFX was migrated to a stack_members_died listener in
 * GameEngine.registerCoreEventListeners().
 *
 * See Decision A in docs/plans/world-modifiers.plan.md for migration context.
 */

import type { WorldModifierManager } from './WorldModifierManager';
import type { EngineContext } from '../game/EngineContext';
import { Effect } from '../game/effects/Effect';
import { AlphaWolfStoryEmitter } from '../game/effects/AlphaWolfStoryEmitter';

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
                duration: 2,
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

}

