/**
 * Co-op Reaction claims, engine side.
 *
 * A player who was not paused by a reaction frame (not in the telegraph, or out of range of the frame) may
 * still CLAIM the Reaction while the Reactable attack is in progress: the claim joins the open pause plane as an
 * extra waiter with `reactionPending`, so the normal decision path applies (pass is free, acting spends 1 Reflex,
 * see `OrderManager.resolveReactionIfNeeded`). Claiming itself costs nothing.
 *
 * {@link canClaimReaction} is THE gate. Nothing else may hard-code "a Reactable attack is in progress": later this
 * rule widens to "any pause plane" ("Reflex as an extra turn", Ideas -> Systems) by changing
 * {@link findReactableAttackInProgress} only.
 *
 * {@link applyReactionClaim} is deterministic engine state: the network layer (Steps 15-16) records accepted claims
 * in the replayed stream and calls it at the claim's tick, so replays and late joiners rebuild the same plane.
 */

import { getAbility } from '../../abilities/AbilityRegistry';
import { getTotalAbilityDurationForCast } from '../../abilities/abilityTimings';
import type { EngineContext } from '../EngineContext';
import { areEnemies } from '../teams';
import { getCastElapsed } from '../time/actorClock';
import type { Unit } from '../units/Unit';
import { fusedBodyOptionsOf, peekFusedBodyState } from '../units/components/fusedBodyComponent';
import { unitCanReact } from './reactionFrame';

/** The Reactable attack a claim would answer. Becomes `reactionPending` on the claimant. */
export interface ReactableAttackInProgress {
    /** The attack's ability id, or `'fused_body'` for a fuse, matching the labels `requestReactionFrame` stores. */
    abilityId: string;
    casterId: string;
}

/**
 * A Reactable attack hostile to `unit` that is in progress: an enemy active ability with `reactable: true` from the
 * start of its cast to the end of its timeline (its hit), or a Reactable fused body whose fuse is still running.
 * Deterministic: units are scanned in engine order. THIS is the clause to widen for "Reflex as an extra turn".
 */
export function findReactableAttackInProgress(engine: EngineContext, unit: Unit): ReactableAttackInProgress | null {
    for (const attacker of engine.units) {
        if (!attacker.active || !attacker.isAlive() || !areEnemies(attacker.teamId, unit.teamId)) continue;
        const fuse = fusedBodyOptionsOf(attacker);
        if (fuse?.reactable && peekFusedBodyState(attacker)?.outcome === null) {
            return { abilityId: 'fused_body', casterId: attacker.id };
        }
        for (const active of attacker.activeAbilities) {
            const ability = getAbility(active.abilityId);
            if (!ability?.reactable) continue;
            const elapsed = getCastElapsed(attacker, active, engine);
            if (elapsed >= 0 && elapsed < getTotalAbilityDurationForCast(ability, attacker, engine)) {
                return { abilityId: active.abilityId, casterId: attacker.id };
            }
        }
    }
    return null;
}

/**
 * Whether `unit` may claim a Reaction right now: it knows Reactions and has >= 1 Reflex (`unitCanReact`), is not
 * already a waiter of the open plane, and a Reactable attack is in progress ({@link findReactableAttackInProgress}).
 * The one gate for claims (engine, host validation and the UI button).
 */
export function canClaimReaction(engine: EngineContext, unit: Unit): boolean {
    if (!unitCanReact(engine, unit)) return false;
    if (engine.waitingForOrders?.waiters.some((w) => w.unitId === unit.id)) return false;
    return findReactableAttackInProgress(engine, unit) !== null;
}

/**
 * Judge a claim REQUEST (network hint) against the live engine, without changing it. Used by the host before it
 * records the claim, and by the claimant before it sends one. `ok`: the plane `planeId` at `atTick` is open, the unit
 * belongs to `claimantPlayerId` and {@link canClaimReaction} holds. `already_claimed`: the unit already claimed this
 * plane (a repeated request). Anything else is `rejected`.
 */
export function evaluateReactionClaimRequest(
    engine: EngineContext,
    req: { planeId: string; atTick: number; unitId: string; claimantPlayerId: string },
): 'ok' | 'already_claimed' | 'rejected' {
    const plane = engine.waitingForOrders;
    if (!plane || plane.planeId === undefined || plane.planeId !== req.planeId || plane.atTick !== req.atTick) {
        return 'rejected';
    }
    const unit = engine.getUnit(req.unitId);
    if (!unit || unit.ownerId !== req.claimantPlayerId) return 'rejected';
    if (plane.claims?.some((c) => c.unitId === unit.id)) return 'already_claimed';
    return canClaimReaction(engine, unit) ? 'ok' : 'rejected';
}

/**
 * Apply a claim: `unitId` joins the plane `planeId` as a waiter with `reactionPending` and the claim is recorded on
 * the plane. Rejected (false, nothing changed) when no plane is open, the plane id does not match (stale), the unit is
 * unknown or not owned by a player, or {@link canClaimReaction} fails. Several claims per plane are allowed.
 * The plane then resumes only when every waiter, claimants included, has an order.
 */
export function applyReactionClaim(engine: EngineContext, planeId: string, unitId: string): boolean {
    const plane = engine.waitingForOrders;
    if (!plane || plane.planeId === undefined || plane.planeId !== planeId) return false;
    const unit = engine.getUnit(unitId);
    if (!unit || !canClaimReaction(engine, unit)) return false;
    const attack = findReactableAttackInProgress(engine, unit);
    if (!attack) return false;

    unit.reactionPending = { abilityId: attack.abilityId, casterId: attack.casterId };
    plane.waiters.push({ unitId: unit.id, ownerId: unit.ownerId });
    plane.waiters.sort((a, b) =>
        a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
    );
    (plane.claims ??= []).push({ unitId: unit.id, ownerId: unit.ownerId });
    engine.mixOrderFingerprint(unit.id, `reaction_claim:${planeId}`);
    return true;
}
