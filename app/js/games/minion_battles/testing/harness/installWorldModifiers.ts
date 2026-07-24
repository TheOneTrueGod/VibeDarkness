import type { GameEngine } from '../../game/GameEngine';
import type { WorldModifierDef } from '../../worldModifiers/types';
import { buildWorldModifiersFromSources } from '../../worldModifiers/buildWorldModifiers';
import { BUILTIN_WORLD_MODIFIERS } from '../../worldModifiers/builtins/index';

/**
 * Mirrors BattleSession.finalizeEngine() modifier install for tiny battles.
 * For DarknessStrength packages (resolve + campaign lane), prefer
 * {@link installDarknessStrengthsForTest} in `./installDarknessStrengths`.
 */
export function installWorldModifiersForTest(
    engine: GameEngine,
    missionModifiers: WorldModifierDef[] = [],
    storyModifiers: WorldModifierDef[] = [],
    campaignModifiers: WorldModifierDef[] = [],
): void {
    engine.state.worldModifierManager.install(
        buildWorldModifiersFromSources({
            builtins: BUILTIN_WORLD_MODIFIERS,
            campaign: campaignModifiers,
            mission: missionModifiers,
            story: storyModifiers,
        }),
    );
}
