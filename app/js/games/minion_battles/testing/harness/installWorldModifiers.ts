import type { GameEngine } from '../../game/GameEngine';
import type { WorldModifierDef } from '../../worldModifiers/types';
import { buildWorldModifiersFromSources } from '../../worldModifiers/buildWorldModifiers';
import { BUILTIN_WORLD_MODIFIERS } from '../../worldModifiers/builtins/index';

/** Mirrors BattleSession.finalizeEngine() modifier install for tiny battles. */
export function installWorldModifiersForTest(
    engine: GameEngine,
    missionModifiers: WorldModifierDef[] = [],
    storyModifiers: WorldModifierDef[] = [],
): void {
    engine.state.worldModifierManager.install(
        buildWorldModifiersFromSources({
            builtins: BUILTIN_WORLD_MODIFIERS,
            mission: missionModifiers,
            story: storyModifiers,
        }),
    );
}
