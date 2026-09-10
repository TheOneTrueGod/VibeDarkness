/**
 * Shared quest list row: title, slot/tag subtitle, Start / Continue / Abandon.
 * Admins also get mission-id seek pills.
 */
import React, { useMemo, useRef, useState } from 'react';
import type { QuestDef, QuestRunState } from '../../../storylines/questTypes';
import {
    questSlotMissionIds,
    questSlotPillStatus,
    type QuestSlotPillStatus,
} from '../../../storylines/questLobby';
import { TestIds } from '../../../../../testing/testIds';
import ResourcePill from '../../../../../components/ResourcePill';
import {
    AnchoredPortalTooltip,
    PORTAL_TOOLTIP_SURFACE_CLASS,
} from '../AnchoredPortalTooltip';
import { questCompletionResourceGains } from './questBankUi';

const PILL_STATUS_CLASS: Record<QuestSlotPillStatus, string> = {
    completed:
        'bg-green-900/50 text-green-300 border-green-600/60 hover:bg-green-800/60',
    active: 'bg-blue-900/50 text-blue-200 border-blue-500/60 hover:bg-blue-800/60',
    upcoming: 'bg-zinc-800/70 text-zinc-400 border-zinc-600/60 hover:bg-zinc-700/70',
};

function AdminMissionSeekPill({
    quest,
    missionId,
    slotIndex,
    status,
    assignedBankId,
    onSeek,
}: {
    quest: QuestDef;
    missionId: string;
    slotIndex: number;
    status: QuestSlotPillStatus;
    assignedBankId: string | null;
    onSeek: (slotIndex: number, assignedBankId: string | null) => void;
}) {
    const pillRef = useRef<HTMLButtonElement>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [seeking, setSeeking] = useState(false);

    return (
        <>
            <button
                ref={pillRef}
                type="button"
                data-testid={`${TestIds.questAdminMissionPillPrefix}${quest.id}-${slotIndex}`}
                title={`Skip to ${missionId} (slot ${slotIndex + 1})`}
                aria-label={`Skip quest to mission ${missionId}`}
                onClick={(e) => {
                    e.stopPropagation();
                    setConfirmOpen((o) => !o);
                }}
                className={`max-w-[9.5rem] truncate px-1.5 py-0.5 rounded-full border text-[9px] font-mono font-semibold cursor-pointer active:scale-95 transition-all ${PILL_STATUS_CLASS[status]}`}
            >
                {missionId}
            </button>
            <AnchoredPortalTooltip
                anchorRef={pillRef}
                open={confirmOpen}
                placement="top"
                className={`${PORTAL_TOOLTIP_SURFACE_CLASS} p-2.5 w-[240px] pointer-events-auto`}
            >
                <p className="text-[11px] text-zinc-200 mb-2 leading-snug">
                    Skip “{quest.title}” to{' '}
                    <span className="font-mono text-zinc-100">{missionId}</span>? This deletes
                    active lobbies for the quest and treats earlier slots as done.
                </p>
                <div className="flex items-center justify-end gap-1.5">
                    <button
                        type="button"
                        data-testid={TestIds.questAdminSeekCancel}
                        className="px-2 py-1 rounded text-[11px] text-zinc-300 hover:text-white cursor-pointer"
                        onClick={() => setConfirmOpen(false)}
                        disabled={seeking}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        data-testid={TestIds.questAdminSeekConfirm}
                        className="px-2 py-1 rounded bg-amber-700 text-amber-50 text-[11px] font-bold hover:bg-amber-600 cursor-pointer disabled:opacity-60"
                        disabled={seeking}
                        onClick={() => {
                            setSeeking(true);
                            try {
                                onSeek(slotIndex, assignedBankId);
                                setConfirmOpen(false);
                            } finally {
                                setSeeking(false);
                            }
                        }}
                    >
                        {seeking ? 'Skipping…' : 'Skip to mission'}
                    </button>
                </div>
            </AnchoredPortalTooltip>
        </>
    );
}

export function QuestPickRow({
    quest,
    isActive,
    activeSlotLabel,
    activeRun,
    isAdmin,
    assignedBankId,
    onStart,
    onContinue,
    onAbandon,
    onAdminSeek,
    startTestId,
}: {
    quest: QuestDef;
    isActive: boolean;
    /** e.g. "1/3" when active */
    activeSlotLabel?: string;
    activeRun: QuestRunState | null;
    isAdmin: boolean;
    assignedBankId: string | null;
    onStart: () => void;
    onContinue: () => void;
    onAbandon?: () => void | Promise<void>;
    onAdminSeek?: (slotIndex: number, assignedBankId: string | null) => void;
    startTestId?: string;
}) {
    const abandonBtnRef = useRef<HTMLButtonElement>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [abandoning, setAbandoning] = useState(false);

    const missionIds = useMemo(
        () => questSlotMissionIds(quest, isActive ? activeRun : null),
        [quest, isActive, activeRun],
    );
    const currentSlotIndex =
        isActive && activeRun ? activeRun.currentSlotIndex : null;
    const campaignResourceRewards = useMemo(
        () => questCompletionResourceGains(quest),
        [quest],
    );

    return (
        <div className="flex items-start justify-between gap-2 rounded-md border border-border-custom bg-background/40 px-2.5 py-1.5 min-w-0">
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">
                    {quest.title}
                    {isAdmin && (
                        <span className="text-[10px] font-normal text-muted"> ({quest.id})</span>
                    )}
                </p>
                <p className="text-[10px] text-muted truncate">
                    {quest.slots.length} mission{quest.slots.length === 1 ? '' : 's'}
                    {quest.tags?.length ? ` · ${quest.tags.join(', ')}` : ''}
                    {isActive && activeSlotLabel ? ` · slot ${activeSlotLabel}` : ''}
                </p>
                <div
                    className="mt-1 flex flex-wrap items-center gap-1"
                    aria-label="Campaign resource rewards"
                >
                    {campaignResourceRewards.length > 0 ? (
                        campaignResourceRewards.map(({ resource, count }) => (
                            <ResourcePill
                                key={resource}
                                resource={resource}
                                count={count}
                                size="small"
                            />
                        ))
                    ) : (
                        <p className="text-[10px] text-muted">No Rewards</p>
                    )}
                </div>
                {isAdmin && onAdminSeek && missionIds.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                        {missionIds.map((missionId, slotIndex) => (
                            <AdminMissionSeekPill
                                key={`${quest.id}-${slotIndex}-${missionId}`}
                                quest={quest}
                                missionId={missionId}
                                slotIndex={slotIndex}
                                status={questSlotPillStatus(slotIndex, currentSlotIndex)}
                                assignedBankId={assignedBankId}
                                onSeek={onAdminSeek}
                            />
                        ))}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                {isActive ? (
                    <>
                        <button
                            type="button"
                            data-testid={TestIds.questContinue}
                            onClick={onContinue}
                            className="px-2.5 py-1 rounded-md bg-primary text-secondary text-[11px] font-bold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                        >
                            Continue
                        </button>
                        {onAbandon && (
                            <>
                                <button
                                    ref={abandonBtnRef}
                                    type="button"
                                    data-testid={TestIds.questAbandon}
                                    onClick={() => setConfirmOpen((o) => !o)}
                                    className="px-2.5 py-1 rounded-md bg-red-800/90 text-red-100 text-[11px] font-bold border border-red-600 hover:bg-red-700 active:scale-95 transition-all cursor-pointer"
                                >
                                    Abandon
                                </button>
                                <AnchoredPortalTooltip
                                    anchorRef={abandonBtnRef}
                                    open={confirmOpen}
                                    placement="top"
                                    className={`${PORTAL_TOOLTIP_SURFACE_CLASS} p-2.5 w-[220px] pointer-events-auto`}
                                >
                                    <p className="text-[11px] text-zinc-200 mb-2 leading-snug">
                                        Abandon “{quest.title}”? This run’s progress will be discarded.
                                    </p>
                                    <div className="flex items-center justify-end gap-1.5">
                                        <button
                                            type="button"
                                            data-testid={TestIds.questAbandonCancel}
                                            className="px-2 py-1 rounded text-[11px] text-zinc-300 hover:text-white cursor-pointer"
                                            onClick={() => setConfirmOpen(false)}
                                            disabled={abandoning}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            data-testid={TestIds.questAbandonConfirm}
                                            className="px-2 py-1 rounded bg-red-700 text-red-50 text-[11px] font-bold hover:bg-red-600 cursor-pointer disabled:opacity-60"
                                            disabled={abandoning}
                                            onClick={async () => {
                                                setAbandoning(true);
                                                try {
                                                    await onAbandon();
                                                    setConfirmOpen(false);
                                                } finally {
                                                    setAbandoning(false);
                                                }
                                            }}
                                        >
                                            {abandoning ? 'Abandoning…' : 'Abandon'}
                                        </button>
                                    </div>
                                </AnchoredPortalTooltip>
                            </>
                        )}
                    </>
                ) : (
                    <button
                        type="button"
                        data-testid={startTestId}
                        onClick={onStart}
                        className="px-2.5 py-1 rounded-md bg-primary text-secondary text-[11px] font-bold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                    >
                        Start
                    </button>
                )}
            </div>
        </div>
    );
}
