/**
 * Guard's return side. When a spirit exiled for Guard comes back (its shield ended, or the guarded unit
 * died), it emerges from the guarded unit's position with a pulse and a fade-in, then guards its owner again.
 * Registered once in `engineEventWiring.ts`; it lives outside the shield buff, which only returns the unit.
 */
import { Effect } from '../../../game/effects/Effect';
import type { EngineContext } from '../../../game/EngineContext';
import { peekPetState } from '../../../game/units/components/petComponent';
import { commandPetGuard } from '../../../abilities/petCommands';
import { getThemeById, themeGlowPair } from '../../../themes/abilityTheme';
import { GUARD_EXILE_REASON, GUARD_FADE_IN_MS } from './guardConstants';

/** Command-palette pulse; `duration` is longer for the emerge than the vanish. */
export function guardPulse(x: number, y: number, duration: number): Effect {
    const { light, dark } = themeGlowPair(getThemeById('command'));
    return new Effect({ x, y, duration, effectType: 'Pulse', effectData: { colors: [light, dark, 0xffffff] } });
}

export function registerGuardReturnListener(
    engine: Pick<EngineContext, 'eventBus' | 'getUnit' | 'addEffect'>,
): void {
    engine.eventBus.on('unit_returned', (event) => {
        if (event.reason !== GUARD_EXILE_REASON) return;
        const spirit = engine.getUnit(event.unitId);
        if (!spirit) return;
        engine.addEffect(guardPulse(event.x, event.y, 0.6));
        engine.eventBus.emit('unit_fade_in', { unitId: spirit.id, durationMs: GUARD_FADE_IN_MS });
        // Back on guard: anchored on its owner again (no command cue; the owner did not just order it).
        if (peekPetState(spirit)?.ownerUnitId) commandPetGuard([spirit], engine);
    });
}
