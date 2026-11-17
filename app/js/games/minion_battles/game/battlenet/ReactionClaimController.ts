/**
 * Co-op Reaction claims, network side (Step 16). Owned by {@link BattleNet}.
 *
 * Messages over the WebRTC mesh are HINTS. The truth is the claim row the host records through the dedicated claim
 * endpoint (Step 15, `BattleNet.recordReactionClaim`) and the engine's `waitingForOrders.claims`.
 *
 * Flow: the claimant sends `reaction-claim-request` (host and peers hear it and mark it pending). The host judges it
 * with `evaluateReactionClaim` (plane id + tick match, claimant owns the unit, `canClaimReaction`), records it, applies
 * it locally and only then broadcasts `reaction-claim-result accepted: true`. A refusal or a failed record is a
 * rejection. While a request for a plane is undecided the host's engine holds that plane open
 * ({@link isUndecidedFor}, read by `GameEngine.parallelResumeHold`), so a plane never resumes between "accepted" and
 * "recorded"; the hold is released by `session.retryParallelResume()` once the request settles.
 *
 * Claimants give up on a rejection or when the plane with the matching id closes ({@link handlePlaneClosed}); results
 * and closes for other plane ids are ignored. A peer that already played past an accepted plane resyncs to rebuild it
 * from the recorded stream (existing `requestResync` path).
 */

import type {
    BattleSessionHandle,
    ReactionClaimEntry,
    ReactionClaimMessage,
    ReactionClaimState,
} from './types';

const MAX_TRACKED_ENTRIES = 24;

export interface ReactionClaimControllerDeps {
    isHost: boolean;
    playerId: string;
    hostPlayerId: string | null;
    session: BattleSessionHandle;
    /** Broadcast a hint over the mesh. Null when there is no mesh. */
    send: ((message: ReactionClaimMessage) => void) | null;
    /** True while the mesh link to the host is up (always true on the host). */
    isHostLinkUp: () => boolean;
    /** Host only: durably record + apply an accepted claim (`BattleNet.recordReactionClaim`). */
    recordClaim: (claim: { planeId: string; atTick: number; unitId: string; playerId: string }) => Promise<boolean>;
    requestResync: (reason: string) => void;
    onChanged: (planeId: string | null) => void;
}

function keyOf(planeId: string, unitId: string): string {
    return `${planeId}|${unitId}`;
}

export class ReactionClaimController {
    private readonly entries = new Map<string, ReactionClaimEntry>();
    /** Host: claim keys whose request is being decided (validate -> record -> reply). */
    private readonly undecided = new Set<string>();

    constructor(private readonly deps: ReactionClaimControllerDeps) {}

    // ---------------------------------------------------------------- queries (UI)

    /** This client's view of one claim, or null when it never claimed (or the entry was pruned). */
    getState(planeId: string, unitId: string): ReactionClaimState | null {
        this.reconcileFromEngine();
        return this.entries.get(keyOf(planeId, unitId))?.state ?? null;
    }

    /** Every tracked claim for the plane (pending, accepted, rejected; own and others'). */
    getClaims(planeId: string): readonly ReactionClaimEntry[] {
        this.reconcileFromEngine();
        return [...this.entries.values()].filter((e) => e.planeId === planeId);
    }

    /** Claims still waiting for the host's answer on this plane, other players' and our own. */
    getPendingClaims(planeId: string): readonly ReactionClaimEntry[] {
        return this.getClaims(planeId).filter((e) => e.state === 'pending');
    }

    /** Host: a request for `planeId` is undecided, so the plane must not close. */
    isUndecidedFor(planeId: string | undefined): boolean {
        if (planeId === undefined) return false;
        for (const key of this.undecided) {
            if (key.startsWith(`${planeId}|`)) return true;
        }
        return false;
    }

    // ---------------------------------------------------------------- claimant

    /**
     * Ask to React with `unitId` at the open plane. False (nothing sent) when there is no open plane, the mesh link
     * to the host is down, the local engine says the claim is not allowed, or a live claim already exists.
     */
    requestClaim(unitId: string): boolean {
        const plane = this.deps.session.getWaitingForOrdersBatch?.();
        if (!plane || plane.planeId === undefined) return false;
        if (!this.deps.isHostLinkUp()) return false;
        const verdict = this.deps.session.evaluateReactionClaim?.(
            plane.planeId,
            plane.atTick,
            unitId,
            this.deps.playerId,
        );
        if (verdict !== 'ok') return false;
        const key = keyOf(plane.planeId, unitId);
        const existing = this.entries.get(key);
        if (existing && existing.state !== 'rejected') return false;
        const message: ReactionClaimMessage = {
            kind: 'reaction-claim-request',
            planeId: plane.planeId,
            atTick: plane.atTick,
            unitId,
        };
        if (!this.deps.isHost && !this.deps.send) return false;
        this.setEntry({
            planeId: plane.planeId,
            atTick: plane.atTick,
            unitId,
            playerId: this.deps.playerId,
            state: 'pending',
            own: true,
        });
        if (this.deps.isHost) {
            void this.decide(this.deps.playerId, message);
        } else {
            this.deps.send?.(message);
        }
        return true;
    }

    // ---------------------------------------------------------------- inbound

    handleMessage(fromPlayerId: string, message: ReactionClaimMessage): void {
        if (fromPlayerId === this.deps.playerId) return;
        if (message.kind === 'reaction-claim-request') {
            if (!this.entries.has(keyOf(message.planeId, message.unitId))) {
                this.setEntry({
                    planeId: message.planeId,
                    atTick: message.atTick,
                    unitId: message.unitId,
                    playerId: fromPlayerId,
                    state: 'pending',
                    own: false,
                });
            }
            if (this.deps.isHost) void this.decide(fromPlayerId, message);
            return;
        }
        // Results count only from the host.
        if (this.deps.hostPlayerId != null && fromPlayerId !== this.deps.hostPlayerId) return;
        this.applyResult(message.planeId, message.atTick, message.unitId, message.accepted);
    }

    /** `GameEngine.onParallelPlaneClosed`: the plane `planeId` closed on this client. */
    handlePlaneClosed(planeId: string): void {
        let changed = false;
        for (const [key, entry] of [...this.entries]) {
            if (entry.planeId !== planeId || entry.state !== 'pending') continue;
            changed = true;
            if (this.deps.session.hasReactionClaimBeenApplied?.(planeId, entry.unitId)) {
                entry.state = 'accepted';
            } else if (entry.own) {
                entry.state = 'rejected'; // the plane closed first: the claim lost
            } else {
                this.entries.delete(key);
            }
        }
        if (changed) this.deps.onChanged(planeId);
    }

    // ---------------------------------------------------------------- host

    private async decide(
        claimantPlayerId: string,
        req: { planeId: string; atTick: number; unitId: string },
    ): Promise<void> {
        const key = keyOf(req.planeId, req.unitId);
        // Synchronous, before any await: from here until the reply the plane cannot close.
        if (this.undecided.has(key)) return;
        this.undecided.add(key);
        let accepted = false;
        try {
            const verdict =
                this.deps.session.evaluateReactionClaim?.(req.planeId, req.atTick, req.unitId, claimantPlayerId) ??
                'rejected';
            if (verdict === 'already_claimed') {
                accepted = true;
            } else if (verdict === 'ok') {
                accepted = await this.deps.recordClaim({
                    planeId: req.planeId,
                    atTick: req.atTick,
                    unitId: req.unitId,
                    playerId: claimantPlayerId,
                });
            }
        } catch (err) {
            console.warn('[ReactionClaimController] claim decision failed', err);
            accepted = false;
        } finally {
            this.undecided.delete(key);
        }
        this.deps.send?.({
            kind: 'reaction-claim-result',
            planeId: req.planeId,
            atTick: req.atTick,
            unitId: req.unitId,
            accepted,
        });
        this.applyResult(req.planeId, req.atTick, req.unitId, accepted, claimantPlayerId);
        // Release the hold: an answered plane may now be ready to resume.
        this.deps.session.retryParallelResume?.();
    }

    // ---------------------------------------------------------------- internals

    private applyResult(
        planeId: string,
        atTick: number,
        unitId: string,
        accepted: boolean,
        claimantPlayerId = '',
    ): void {
        const key = keyOf(planeId, unitId);
        const existing = this.entries.get(key);
        this.setEntry({
            planeId,
            atTick,
            unitId,
            playerId: existing?.playerId || claimantPlayerId,
            state: accepted ? 'accepted' : 'rejected',
            own: existing?.own ?? false,
        });
        if (accepted) this.rewindIfPlayedAhead(planeId, atTick, unitId);
    }

    /** An accepted claim for a plane this client already ran past: resync to rebuild it from the recorded stream. */
    private rewindIfPlayedAhead(planeId: string, atTick: number, unitId: string): void {
        const { session } = this.deps;
        if (session.getWaitingForOrdersBatch?.()?.planeId === planeId) return; // plane open: the row applies in place
        if (session.getEngineTick() < atTick) return; // not there yet: held until the plane forms
        if (session.hasReactionClaimBeenApplied?.(planeId, unitId)) return;
        this.deps.requestResync('reaction-claim-played-ahead');
    }

    /**
     * A pending claim whose row has since been applied (a lost result) is accepted. Silent on purpose: the getters
     * run during render, so this must not emit; the engine's own pause-plane updates re-render the HUD.
     */
    private reconcileFromEngine(): void {
        const plane = this.deps.session.getWaitingForOrdersBatch?.();
        if (!plane || plane.planeId === undefined || !plane.claims?.length) return;
        for (const claim of plane.claims) {
            const entry = this.entries.get(keyOf(plane.planeId, claim.unitId));
            if (entry && entry.state === 'pending') entry.state = 'accepted';
        }
    }

    private setEntry(entry: ReactionClaimEntry): void {
        const key = keyOf(entry.planeId, entry.unitId);
        this.entries.delete(key); // re-insert so insertion order = recency
        this.entries.set(key, entry);
        while (this.entries.size > MAX_TRACKED_ENTRIES) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) break;
            this.entries.delete(oldest);
        }
        this.deps.onChanged(entry.planeId);
    }
}
