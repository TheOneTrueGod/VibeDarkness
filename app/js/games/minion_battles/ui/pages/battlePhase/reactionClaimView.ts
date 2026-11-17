/**
 * Pure display logic for the co-op Reaction claim UI: the "React" button and the plane list of who the pause
 * is waiting on. The engine rule is `canClaimReaction` (game/reactions/claimRule.ts); the claim state comes from
 * `BattleNet.getReactionClaimState`. This file only turns those inputs into labels, so it is unit-tested.
 */

import type { ReactionClaimEntry, ReactionClaimState } from '../../../game/battlenet/types';

export type ReactionClaimButtonView =
    | { kind: 'hidden' }
    | { kind: 'ready'; label: string; title: string; disabled: false }
    | { kind: 'offline'; label: string; title: string; disabled: true }
    | { kind: 'pending'; label: string; title: string; disabled: true }
    | { kind: 'accepted'; label: string; title: string; disabled: true }
    | { kind: 'rejected'; label: string; title: string; disabled: true };

export const REACT_BUTTON_LABEL = 'React';
export const REACT_BUTTON_TITLE = 'Spend 1 Reflex to act on this attack';
export const REACT_OFFLINE_TITLE = 'No link to the host. You can React once it is back';
export const REACT_PENDING_LABEL = 'Claiming...';
export const REACT_PENDING_TITLE = 'Waiting for the host to accept your claim';
export const REACT_ACCEPTED_LABEL = 'Claimed';
export const REACT_ACCEPTED_TITLE = 'The host accepted your claim';
export const REACT_REJECTED_LABEL = 'Too late';
export const REACT_REJECTED_TITLE = 'The host refused your claim: the attack already landed';

export interface ReactionClaimButtonInput {
    /** A pause plane with a plane id is open. */
    planeOpen: boolean;
    /** `canClaimReaction(engine, localUnit)`: false when the unit is already a waiter. */
    canClaim: boolean;
    /** Local unit is already a waiter of the open plane (the ability bar handles it). */
    isWaiter: boolean;
    /** `BattleNet.isHostLinkUp()`. */
    hostLinkUp: boolean;
    /** `BattleNet.getReactionClaimState(planeId, unitId)`. */
    ownState: ReactionClaimState | null;
}

/**
 * What the React button shows. Visible only for a player who is not a waiter, while a claim is possible
 * (`canClaim`) or one of their own claims for this plane is still being shown (pending / "Too late").
 */
export function computeReactionClaimButton(input: ReactionClaimButtonInput): ReactionClaimButtonView {
    const { planeOpen, canClaim, isWaiter, hostLinkUp, ownState } = input;
    if (!planeOpen || isWaiter) return { kind: 'hidden' };
    if (ownState === 'pending') {
        return { kind: 'pending', label: REACT_PENDING_LABEL, title: REACT_PENDING_TITLE, disabled: true };
    }
    if (ownState === 'accepted') {
        return { kind: 'accepted', label: REACT_ACCEPTED_LABEL, title: REACT_ACCEPTED_TITLE, disabled: true };
    }
    if (ownState === 'rejected') {
        return { kind: 'rejected', label: REACT_REJECTED_LABEL, title: REACT_REJECTED_TITLE, disabled: true };
    }
    if (!canClaim) return { kind: 'hidden' };
    if (!hostLinkUp) {
        return { kind: 'offline', label: REACT_BUTTON_LABEL, title: REACT_OFFLINE_TITLE, disabled: true };
    }
    return { kind: 'ready', label: REACT_BUTTON_LABEL, title: REACT_BUTTON_TITLE, disabled: false };
}

export interface ReactionPlaneRow {
    key: string;
    playerName: string;
    /** `deciding`: the unit is a waiter. `claiming`: its claim has not been decided by the host yet. */
    status: 'deciding' | 'claiming';
    own: boolean;
}

export interface ReactionPlaneRowsInput {
    waiters: ReadonlyArray<{ unitId: string; ownerId: string }>;
    /** Every claim tracked for the plane (any state); only `pending` ones are listed. */
    claims: readonly ReactionClaimEntry[];
    localPlayerId: string;
    ownerOfUnit: (unitId: string) => string | null;
    nameOfPlayer: (playerId: string) => string;
}

export function reactionStatusLabel(status: ReactionPlaneRow['status']): string {
    return status === 'deciding' ? 'choosing' : 'claiming';
}

/**
 * Rows for the plane list: every waiter, then every pending claim whose unit is not already a waiter
 * (an accepted claim is a waiter). Same for all players.
 */
export function buildReactionPlaneRows(input: ReactionPlaneRowsInput): ReactionPlaneRow[] {
    const rows: ReactionPlaneRow[] = [];
    const waiterUnits = new Set<string>();
    for (const w of input.waiters) {
        waiterUnits.add(w.unitId);
        rows.push({
            key: `w:${w.unitId}`,
            playerName: input.nameOfPlayer(w.ownerId),
            status: 'deciding',
            own: w.ownerId === input.localPlayerId,
        });
    }
    for (const c of input.claims) {
        if (c.state !== 'pending' || waiterUnits.has(c.unitId)) continue;
        const ownerId = c.playerId || input.ownerOfUnit(c.unitId) || '';
        rows.push({
            key: `c:${c.unitId}`,
            playerName: input.nameOfPlayer(ownerId),
            status: 'claiming',
            own: c.own || ownerId === input.localPlayerId,
        });
    }
    return rows;
}
