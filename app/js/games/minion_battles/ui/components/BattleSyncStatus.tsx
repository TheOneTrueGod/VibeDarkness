import React from 'react';
import SyncStatusCard, { type SyncStatusTone } from './SyncStatusCard';
import {
    BATTLE_NET_WAITING_HOST_UI_FORCE_RESYNC_POLLS,
    BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS,
    type BattleNetSyncTerminalStatus,
} from '../../game/battlenet';

export type BattleSyncStatusVariant = 'battle' | 'debug';

export interface BattleSyncStatusProps {
    variant: BattleSyncStatusVariant;
    isHost: boolean;
    /** Engine paused for parallel orders (`waitingForOrders`), mirrored from battle UI. */
    isPaused: boolean;
    syncStatus: BattleNetSyncTerminalStatus;
    syncDetails?: string | null;
    fallingBehindHost: boolean;
    ticksBehindHost: number;
    /** Non-host: consecutive heartbeat polls while paused + {@link BattleNetSyncTerminalStatus.waiting_for_host}. */
    waitingForHostPollStreak: number;
    /** Non-host deferred-order watchdog streak (blocking + paused). */
    stuckHeartbeats: number;
    deferredOrderCount: number;
    queuedOrders: number;
    sendingOrders: number;
    /** Debug: first heartbeat not yet received. */
    hasHeartbeatData?: boolean;
    /** Non-host stall (host anchor UX); wall clock for reload affordance. */
    hostAnchorWaitElapsedMs?: number;
    onRequestBattleReload?: () => void;
    onAcknowledgeRecoveryContinue?: () => void;
}

type CardModel = {
    title: string;
    summary: string;
    tone: SyncStatusTone;
    details?: React.ReactNode;
    busy?: boolean;
} | null;

function trimDetail(d: string | null | undefined): string | null {
    if (d == null) return null;
    const t = d.trim();
    return t === '' ? null : t;
}

function debugOrderBacklogLine(p: BattleSyncStatusProps): React.ReactNode {
    return (
        <span>
            Watchdog streak {p.stuckHeartbeats} · deferred {p.deferredOrderCount} · queued {p.queuedOrders} · sending{' '}
            {p.sendingOrders}
            {p.variant === 'debug' && typeof p.waitingForHostPollStreak === 'number' ? (
                <> · paused+wait polls {p.waitingForHostPollStreak}</>
            ) : null}
        </span>
    );
}

/** In debug, prefix every card with the backlog line; in battle, optional tail only. */
function detailsBattleOrDebug(p: BattleSyncStatusProps, tail: string | null): React.ReactNode {
    if (p.variant === 'debug') {
        return (
            <>
                {debugOrderBacklogLine(p)}
                {tail ? <span className="mt-1 block opacity-95">{tail}</span> : null}
            </>
        );
    }
    return tail ? <span className="block">{tail}</span> : null;
}

function pickSyncCardModel(p: BattleSyncStatusProps): CardModel {
    const { variant, syncStatus, isHost, isPaused, syncDetails } = p;
    const detail = trimDetail(syncDetails);

    if (variant === 'battle' && syncStatus === 'synced') {
        return null;
    }

    if (variant === 'debug' && syncStatus === 'synced') {
        const backlog = p.queuedOrders > 0 || p.sendingOrders > 0 || p.deferredOrderCount > 0;
        return {
            title: 'Sync status · synced',
            tone: backlog ? 'warning' : 'success',
            summary: backlog
                ? 'BattleNet status is synced, but deferred / queued / sending counters are non-zero — worth verifying.'
                : 'Synced and stable; no deferred or pending order backlog.',
            details: detailsBattleOrDebug(p, detail),
        };
    }

    if (variant === 'debug' && syncStatus === 'waiting_for_host' && p.hasHeartbeatData === false) {
        return {
            title: 'Sync status · initializing',
            tone: 'neutral',
            summary: 'Initializing sync; waiting for first heartbeat and fingerprint parity.',
            details: debugOrderBacklogLine(p),
        };
    }

    if (syncStatus === 'resyncing') {
        return {
            title: 'Resyncing battle',
            tone: 'info',
            summary: 'Applying server checkpoints and replaying orders to restore alignment.',
            details: detailsBattleOrDebug(p, detail),
            busy: true,
        };
    }

    if (syncStatus === 'failed') {
        return {
            title: 'Battle sync failed',
            tone: 'danger',
            summary: 'Recovery did not succeed. Try reloading battle sync or re-entering the lobby.',
            details: detailsBattleOrDebug(p, detail),
        };
    }

    if (syncStatus === 'synced_pending_ack') {
        return {
            title: 'Battle resynced',
            tone: 'success',
            summary: 'State matches the server again. Continue when everyone is ready to resume.',
            details: detailsBattleOrDebug(p, detail),
        };
    }

    if (!isHost && p.fallingBehindHost) {
        return {
            title: 'Catching up to host',
            tone: 'warning',
            summary: `Local simulation is behind the server completed tick (${p.ticksBehindHost} ticks).`,
            details: detailsBattleOrDebug(p, detail),
        };
    }

    if (syncStatus === 'waiting_for_host') {
        if (isHost) {
            if (!detail && variant === 'battle') {
                return null;
            }
            if (!detail && variant === 'debug') {
                return {
                    title: 'Sync status · waiting_for_host (host)',
                    tone: 'warning',
                    summary: 'Host is in waiting_for_host with no detail string; see heartbeat table below.',
                    details: debugOrderBacklogLine(p),
                };
            }
            return {
                title: 'Host storage check',
                tone: 'warning',
                summary: detail ?? '',
                details: variant === 'debug' ? debugOrderBacklogLine(p) : undefined,
            };
        }

        const streak = p.waitingForHostPollStreak;
        const showBattleWait =
            isPaused && streak >= BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS && variant === 'battle';

        if (variant === 'battle' && !showBattleWait) {
            return null;
        }

        const summary =
            detail ??
            (variant === 'debug' && !isPaused
                ? 'BattleNet is waiting_for_host while the local engine is not paused for parallel orders.'
                : 'Waiting for the host timeline and server heartbeat to advance.');

        const nearResync = streak >= BATTLE_NET_WAITING_HOST_UI_FORCE_RESYNC_POLLS;
        const tone: SyncStatusTone = nearResync ? 'danger' : 'warning';

        return {
            title: 'Waiting for host',
            tone,
            summary,
            details: detailsBattleOrDebug(p, detail),
        };
    }

    if (variant === 'debug') {
        return {
            title: `Sync status · ${syncStatus}`,
            tone: 'neutral',
            summary: 'Unexpected branch for debug card; check BattleNet and bridge fields.',
            details: detailsBattleOrDebug(p, detail),
        };
    }

    return null;
}

export default function BattleSyncStatus(props: BattleSyncStatusProps) {
    const model = pickSyncCardModel(props);
    if (model == null) {
        return null;
    }

    const stallSec =
        typeof props.hostAnchorWaitElapsedMs === 'number' && props.hostAnchorWaitElapsedMs >= 1000
            ? Math.floor(props.hostAnchorWaitElapsedMs / 1000)
            : 0;

    const showReload =
        props.variant === 'battle' &&
        !props.isHost &&
        typeof props.onRequestBattleReload === 'function' &&
        (stallSec >= 5 || props.waitingForHostPollStreak >= BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS);

    const outerClass =
        props.variant === 'battle'
            ? 'pointer-events-none absolute left-3 top-3 z-20 w-[min(26rem,calc(100vw-1.5rem))]'
            : 'w-full max-w-none';

    const continueBtn =
        props.syncStatus === 'synced_pending_ack' && typeof props.onAcknowledgeRecoveryContinue === 'function' ? (
            <div className="pointer-events-auto">
                <button
                    type="button"
                    onClick={props.onAcknowledgeRecoveryContinue}
                    className="rounded bg-emerald-800 px-2 py-1 text-xs text-emerald-50 hover:bg-emerald-700"
                >
                    Continue
                </button>
            </div>
        ) : null;

    const reloadBtn = showReload ? (
        <div className="pointer-events-auto mt-1.5">
            <button
                type="button"
                onClick={props.onRequestBattleReload}
                className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 hover:bg-slate-700"
            >
                Reload battle sync
            </button>
        </div>
    ) : null;

    const actions = continueBtn != null || reloadBtn != null ? (
        <>
            {continueBtn}
            {reloadBtn}
        </>
    ) : undefined;

    return (
        <div className={outerClass}>
            <SyncStatusCard
                title={model.title}
                summary={model.summary}
                tone={model.tone}
                details={model.details}
                busy={model.busy}
                actions={actions}
            />
        </div>
    );
}
