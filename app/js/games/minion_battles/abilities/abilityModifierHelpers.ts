import type { AbilityModifier } from '../../../researchTrees/types';
import type { Unit } from '../game/units/Unit';
import type { AbilityEngineContext } from './AbilityEngineContext';

/**
 * Returns a `getResearchNodes(treeId)` function bound to the local player, suitable for
 * tooltip contexts where no caster unit is available.  Returns a no-op getter when the
 * engine or player id is absent.
 */
export function localPlayerResearchNodesGetter(
    engine: unknown,
): (treeId: string) => string[] {
    const eng = engine as AbilityEngineContext | undefined;
    if (!eng?.getPlayerResearchNodes || !eng.localPlayerId) return () => [];
    const { localPlayerId, getPlayerResearchNodes } = eng;
    return (treeId: string) => getPlayerResearchNodes.call(eng, localPlayerId, treeId);
}

interface EngineWithLocalUnit {
    getLocalPlayerUnit?(): Unit | null;
}

/**
 * Returns the aggregated AbilityModifier for a given ability, resolving from the caster when
 * available (for doCardEffect, beginActiveCast, etc.) or from the engine's local player unit
 * (for getTooltipText where no caster is passed). Falls back to an empty object.
 *
 * Usage in getTooltipText:
 *   const mod = getAbilityModifier(gameState, undefined, CARD_ID);
 *
 * Usage in doCardEffect:
 *   const mod = caster.abilityModifiers[CARD_ID] ?? {};  // direct access is preferred
 */
export function getAbilityModifier(
    gameState: unknown,
    caster: Unit | undefined,
    abilityId: string,
): AbilityModifier {
    if (caster) return caster.abilityModifiers[abilityId] ?? {};
    const eng = gameState as EngineWithLocalUnit | undefined;
    return eng?.getLocalPlayerUnit?.()?.abilityModifiers[abilityId] ?? {};
}

/**
 * Returns true if the player that owns `caster` has unlocked the given research node.
 *
 * Works for both runtime (doCardEffect / onDamage) and tooltip contexts:
 *   - Runtime: pass `engine` and `caster` — owner id comes from `caster.ownerId`.
 *   - Tooltip (no caster): pass `engine` with `engine.localPlayerId` set; `caster` may be
 *     undefined and the local player id is used as fallback.
 */
export function hasResearchNode(
    engine: AbilityEngineContext | undefined,
    caster: Unit | undefined,
    treeId: string,
    nodeId: string,
): boolean {
    const ownerId = caster?.ownerId ?? (engine as AbilityEngineContext & { localPlayerId?: string } | undefined)?.localPlayerId ?? '';
    if (!ownerId || !engine?.getPlayerResearchNodes) return false;
    return engine.getPlayerResearchNodes(ownerId, treeId).includes(nodeId);
}
