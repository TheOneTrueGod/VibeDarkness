import type { GameEngine } from '../../game/GameEngine';
import type { WorldModifierDef } from '../../worldModifiers/types';
import { compileWorldModifiers } from '../../../../darknessStrength/compile';
import {
    resolveActiveDarknessStrengths,
    type ResolveActiveDarknessStrengthsInput,
} from '../../../../darknessStrength/resolve';
import { installWorldModifiersForTest } from './installWorldModifiers';

export type InstallDarknessStrengthsInput = ResolveActiveDarknessStrengthsInput;

/**
 * Mirrors BattleSession load + finalizeEngine DarknessStrength wiring for tiny battles:
 * resolve → setActiveDarknessStrengths → install compiled spawn/stat WMs on the campaign lane.
 */
export function installDarknessStrengthsForTest(
    engine: GameEngine,
    resolveInput: InstallDarknessStrengthsInput,
    opts?: {
        missionModifiers?: WorldModifierDef[];
        storyModifiers?: WorldModifierDef[];
    },
): void {
    const active = resolveActiveDarknessStrengths(resolveInput);
    engine.setActiveDarknessStrengths(active);
    installWorldModifiersForTest(
        engine,
        opts?.missionModifiers ?? [],
        opts?.storyModifiers ?? [],
        compileWorldModifiers(active),
    );
}
