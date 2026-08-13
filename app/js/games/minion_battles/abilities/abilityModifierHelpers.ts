import type { AbilityModifier, ResearchNodeLevels } from '../../../researchTrees/types';
import type { Unit } from '../game/units/Unit';
import type { AbilityEngineContext } from './AbilityEngineContext';
import { buildDamageModifierFromResearch } from './damageModifiers';
import type { TooltipResolveContext } from './tooltipTokens';
import { getAbility } from './AbilityRegistry';

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

/** Out-of-battle / character-select bag that may be passed as `getTooltipText` gameState. */
interface ResearchTooltipBag {
    researchTrees?: Record<string, string[]>;
    researchNodeLevels?: ResearchNodeLevels;
}

export interface ResolveTooltipContextOpts {
    /** Explicit research trees (character select); also read from gameState duck-type. */
    researchTrees?: Record<string, string[]>;
    /** Leveled passive nodes (Mighty, etc.); also read from gameState.researchNodeLevels. */
    researchNodeLevels?: ResearchNodeLevels;
    /** Ability providing id / damageModifierMultiplier for display scaling. */
    ability?: { id?: string; damageModifierMultiplier?: number };
}

/**
 * Build {@link TooltipResolveContext} for `formatTooltipLines` / damage tokens.
 * Battle: prefers local player unit as `attacker`.
 * Out-of-battle: builds `damageModifier` from research trees + levels (opts or gameState bag).
 */
export function resolveTooltipContext(
    gameState?: unknown,
    opts?: ResolveTooltipContextOpts,
): TooltipResolveContext {
    const bag = gameState as ResearchTooltipBag | undefined;
    const ctx: TooltipResolveContext = {};

    if (opts?.ability?.id !== undefined) {
        ctx.abilityId = opts.ability.id;
    }
    if (opts?.ability?.damageModifierMultiplier !== undefined) {
        ctx.abilityFlatScale = opts.ability.damageModifierMultiplier;
    }

    const attacker = getLocalPlayerUnitFromGameState(gameState);
    if (attacker) {
        ctx.attacker = attacker;
        return ctx;
    }

    const researchTrees = opts?.researchTrees ?? bag?.researchTrees;
    if (researchTrees) {
        const levels = opts?.researchNodeLevels ?? bag?.researchNodeLevels;
        ctx.damageModifier = buildDamageModifierFromResearch(researchTrees, levels);
    }
    return ctx;
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

/** Local player unit from a tooltip gameState / engine, if available. */
export function getLocalPlayerUnitFromGameState(gameState: unknown): Unit | undefined {
    const eng = gameState as EngineWithLocalUnit | undefined;
    return eng?.getLocalPlayerUnit?.() ?? undefined;
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

/**
 * Bar slots plus nested-card fallbacks and attached companions — needed so research
 * modifiers (e.g. Rapid Throw comboMax) apply to Throw Rock when only Charged Rock is equipped.
 */
export function expandAbilityIdsForResearchModifiers(unitAbilityIds: readonly string[]): string[] {
    const out: string[] = [];
    for (const id of unitAbilityIds) {
        if (!out.includes(id)) out.push(id);
        const ability = getAbility(id);
        if (!ability) continue;
        for (const attachedId of ability.attachedAbilityIds ?? []) {
            if (!out.includes(attachedId)) out.push(attachedId);
        }
        const fallbackId = ability.keywords?.nestedCard?.fallbackAbilityId;
        if (fallbackId && !out.includes(fallbackId)) out.push(fallbackId);
    }
    return out;
}
