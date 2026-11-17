/**
 * ReactionClaimControls - co-op Reaction claims, rendered in the plaque's notice column.
 *
 * - "React" button: for a player who is not a waiter, while `canClaimReaction` holds. Disabled with a tooltip while the
 *   mesh link to the host is down; then Claiming... / Claimed / "Too late" as the host decides.
 * - Plane list: every waiter and every pending claim, for all players, while a Reaction is involved.
 *
 * Polls the engine and BattleNet (like ComboMeter: the battle page does not re-render every tick) and re-renders only
 * when the derived view changes. Display logic lives in `battlePhase/reactionClaimView.ts`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BattleNet } from '../../game/battlenet';
import type { GameEngine } from '../../game/GameEngine';
import { canClaimReaction } from '../../game/reactions/claimRule';
import {
    buildReactionPlaneRows,
    computeReactionClaimButton,
    reactionStatusLabel,
    type ReactionClaimButtonView,
    type ReactionPlaneRow,
} from '../pages/battlePhase/reactionClaimView';

const POLL_INTERVAL_MS = 100;

export interface ReactionClaimControlsProps {
    getEngine: () => GameEngine | null;
    netRef: RefObject<BattleNet | null>;
    playerId: string;
    /** Player id -> display name. */
    getPlayerName: (playerId: string) => string;
}

interface ReactionClaimSnapshot {
    unitId: string | null;
    button: ReactionClaimButtonView;
    rows: ReactionPlaneRow[];
}

const EMPTY: ReactionClaimSnapshot = { unitId: null, button: { kind: 'hidden' }, rows: [] };

function readSnapshot(
    engine: GameEngine | null,
    net: BattleNet | null,
    playerId: string,
    getPlayerName: (id: string) => string,
): ReactionClaimSnapshot {
    const plane = engine?.waitingForOrders;
    if (!engine || !net || !plane || plane.planeId === undefined) return EMPTY;
    const planeId = plane.planeId;
    const unit = engine.getLocalPlayerUnit();
    const isWaiter = unit != null && plane.waiters.some((w) => w.unitId === unit.id);
    const button = unit
        ? computeReactionClaimButton({
              planeOpen: true,
              canClaim: canClaimReaction(engine, unit),
              isWaiter,
              hostLinkUp: net.isHostLinkUp(),
              ownState: net.getReactionClaimState(planeId, unit.id),
          })
        : ({ kind: 'hidden' } as const);
    const claims = net.getReactionClaims(planeId);
    const reactionInvolved =
        claims.some((c) => c.state === 'pending')
        || plane.waiters.some((w) => engine.getUnit(w.unitId)?.reactionPending != null);
    const rows = reactionInvolved
        ? buildReactionPlaneRows({
              waiters: plane.waiters,
              claims,
              localPlayerId: playerId,
              ownerOfUnit: (id) => engine.getUnit(id)?.ownerId ?? null,
              nameOfPlayer: getPlayerName,
          })
        : [];
    return { unitId: unit?.id ?? null, button, rows };
}

function snapshotKey(s: ReactionClaimSnapshot): string {
    return JSON.stringify([s.unitId, s.button.kind, s.rows.map((r) => [r.key, r.playerName, r.status, r.own])]);
}

export default function ReactionClaimControls({ getEngine, netRef, playerId, getPlayerName }: ReactionClaimControlsProps) {
    const [snapshot, setSnapshot] = useState<ReactionClaimSnapshot>(EMPTY);
    const keyRef = useRef(snapshotKey(EMPTY));

    const refresh = useCallback(() => {
        const next = readSnapshot(getEngine(), netRef.current, playerId, getPlayerName);
        const key = snapshotKey(next);
        if (key === keyRef.current) return;
        keyRef.current = key;
        setSnapshot(next);
    }, [getEngine, netRef, playerId, getPlayerName]);

    useEffect(() => {
        refresh();
        const id = window.setInterval(refresh, POLL_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [refresh]);

    const { button, rows, unitId } = snapshot;
    if (button.kind === 'hidden' && rows.length === 0) return null;
    const enabled = button.kind === 'ready';
    const tone =
        button.kind === 'rejected'
            ? 'border-gray-600 bg-dark-800 text-gray-400'
            : !enabled
              ? 'border-dark-600 bg-dark-800 text-gray-500'
              : 'border-red-500/80 bg-red-900/70 text-red-100 hover:bg-red-800/80';

    return (
        <div className="pointer-events-none flex flex-col items-center gap-1">
            {button.kind !== 'hidden' && (
                <button
                    type="button"
                    className={`pointer-events-auto rounded-full border px-4 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${tone} ${
                        enabled ? 'cursor-pointer' : 'cursor-not-allowed'
                    }`}
                    disabled={!enabled}
                    title={button.title}
                    onClick={() => {
                        if (unitId == null) return;
                        netRef.current?.requestReactionClaim(unitId);
                        refresh();
                    }}
                >
                    {button.label}
                </button>
            )}
            {rows.length > 0 && (
                <ul
                    className="pointer-events-none rounded border border-dark-600 bg-black/80 px-2 py-1 text-[11px] text-gray-200"
                    aria-label="Waiting on"
                >
                    {rows.map((r) => (
                        <li key={r.key} className={r.status === 'claiming' ? 'text-amber-200' : undefined}>
                            {r.playerName}
                            {r.own ? ' (you)' : ''}: {reactionStatusLabel(r.status)}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
