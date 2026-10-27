import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { getEffectiveHardCcThreshold } from './ccArmourState';

/**
 * Whether crowd control may interrupt `target`'s abilities. A unit with CC armour (e.g. a boss) is immune
 * to interrupts, as it is to stuns and knockbacks, until armour breaks into Exposed; a juggernaut window
 * blocks interrupts outright.
 */
export function canCcInterrupt(target: Unit, gameTime: number): boolean {
    if (target.isInJuggernautWindow(gameTime)) return false;
    if (target.hasBuff('exposed')) return true;
    return getEffectiveHardCcThreshold(target) <= 0;
}

/**
 * The one entry point for CC-driven interrupts that are not part of a stun/knockback apply (e.g. an
 * ability's `interruptPrimaryTargetAbilities` effect). Returns whether the interrupt happened.
 */
export function tryCcInterruptAbilities(target: Unit, engine: EngineContext & { gameTime: number }): boolean {
    if (!canCcInterrupt(target, engine.gameTime)) return false;
    target.interruptAllAbilities(engine);
    return true;
}
