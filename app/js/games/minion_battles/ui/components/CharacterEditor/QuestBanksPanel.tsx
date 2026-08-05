/**
 * Quest slot banks + optional/side quests for Mission Map (Campaign Home UI v1).
 * Shows clears/required progress, eligible pickers, and victory markers per questDefId.
 *
 * A character has at most one active quest run (`activeQuestRun`). The active quest's
 * row shows Continue + Abandon (confirm popover); other rows show Start.
 */
import React, { useMemo, useRef, useState } from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { QuestDef, QuestResult, QuestSlotBank } from '../../../storylines/questTypes';
import type { StartQuestOptions } from '../../../storylines/questLobby';
import {
    STORYLINES,
    getQuestDef,
    getUnlockedQuestSlotBanks,
    getEligibleQuestsForBank,
    getOptionalEligibleQuests,
    getQuestBankVictorySlots,
    countQuestBankClears,
    listQuestVictoryResults,
} from '../../../storylines/index';
import { TestIds } from '../../../../../testing/testIds';
import {
    AnchoredPortalTooltip,
    PORTAL_TOOLTIP_SURFACE_CLASS,
} from '../AnchoredPortalTooltip';

export interface QuestBanksPanelProps {
    character: CampaignCharacter;
    /** Begin a new quest or continue the single active run. */
    onStartQuest?: (questDefId: string, options?: StartQuestOptions) => void;
    /** Clear the character's active quest run (after confirm). */
    onAbandonQuest?: () => void | Promise<void>;
    /** When set (e.g. from Mission Map bank node click), expand that bank's picker. */
    focusedBankId?: string | null;
    /** Hide the "Quests" heading (e.g. when a parent tab/pill already labels the pane). */
    hideSectionTitle?: boolean;
}

function bankDisplayLabel(bank: QuestSlotBank): string {
    return bank.title ?? bank.id.replace(/_/g, ' ');
}

function QuestResultBadge({ result }: { result: QuestResult }) {
    const def = getQuestDef(result.questDefId);
    const placementLabel =
        result.placement === 'bank' && result.bankId
            ? `bank · ${result.bankId.replace(/_/g, ' ')}`
            : result.placement === 'optional'
                ? 'optional'
                : null;
    return (
        <li className="flex items-center justify-between gap-2 rounded-md border border-green-800/50 bg-green-950/30 px-2.5 py-1.5">
            <div className="min-w-0 flex items-center gap-2">
                <span
                    className="shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded-full border"
                    style={{ color: '#22c55e', borderColor: '#22c55e55', background: '#22c55e18' }}
                    aria-label="Victory"
                >
                    Victory
                </span>
                <span className="text-xs text-white truncate">{def?.title ?? result.questDefId}</span>
            </div>
            {placementLabel && (
                <span className="shrink-0 text-[10px] text-zinc-500 uppercase tracking-wide">
                    {placementLabel}
                </span>
            )}
        </li>
    );
}

function QuestPickRow({
    quest,
    isActive,
    activeSlotLabel,
    onStart,
    onContinue,
    onAbandon,
    startTestId,
}: {
    quest: QuestDef;
    isActive: boolean;
    /** e.g. "1/3" when active */
    activeSlotLabel?: string;
    onStart: () => void;
    onContinue: () => void;
    onAbandon?: () => void | Promise<void>;
    startTestId?: string;
}) {
    const abandonBtnRef = useRef<HTMLButtonElement>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [abandoning, setAbandoning] = useState(false);

    return (
        <li className="flex items-center justify-between gap-2 rounded-md border border-border-custom bg-background/40 px-2.5 py-1.5">
            <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{quest.title}</p>
                <p className="text-[10px] text-muted truncate">
                    {quest.slots.length} mission{quest.slots.length === 1 ? '' : 's'}
                    {quest.tags?.length ? ` · ${quest.tags.join(', ')}` : ''}
                    {isActive && activeSlotLabel ? ` · slot ${activeSlotLabel}` : ''}
                </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
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
        </li>
    );
}

export default function QuestBanksPanel({
    character,
    onStartQuest,
    onAbandonQuest,
    focusedBankId = null,
    hideSectionTitle = false,
}: QuestBanksPanelProps) {
    const [expandedBankId, setExpandedBankId] = useState<string | null>(null);

    React.useEffect(() => {
        if (focusedBankId) {
            setExpandedBankId(focusedBankId);
            return;
        }
        const bankId = character.activeQuestRun?.assignedBankId;
        if (
            bankId
            && (character.activeQuestRun?.status === 'active'
                || character.activeQuestRun?.status === 'prep')
        ) {
            setExpandedBankId(bankId);
        }
    }, [focusedBankId, character.activeQuestRun?.assignedBankId, character.activeQuestRun?.status]);

    const storyline = useMemo(
        () => STORYLINES.find((s) => s.id === character.campaignId) ?? null,
        [character.campaignId],
    );

    const missionResults = useMemo(
        () => character.missionResults[character.campaignId] ?? [],
        [character.missionResults, character.campaignId],
    );

    const questResults = useMemo(
        () => character.questResults[character.campaignId] ?? [],
        [character.questResults, character.campaignId],
    );

    const unlockedBanks = useMemo(
        () => (storyline ? getUnlockedQuestSlotBanks(storyline, missionResults) : []),
        [storyline, missionResults],
    );

    const optionalQuests = useMemo(
        () => getOptionalEligibleQuests(character.campaignId, questResults),
        [character.campaignId, questResults],
    );

    const victoryResults = useMemo(() => listQuestVictoryResults(questResults), [questResults]);

    /** At most one active run per character (prep or in-progress). */
    const activeQuest =
        character.activeQuestRun?.status === 'active'
        || character.activeQuestRun?.status === 'prep'
            ? character.activeQuestRun
            : null;
    const activeQuestDef = activeQuest ? getQuestDef(activeQuest.questDefId) : undefined;
    const activeSlotLabel = activeQuest
        ? `${activeQuest.currentSlotIndex + 1}/${activeQuest.resolvedSlots.length}`
        : undefined;

    if (!storyline) return null;

    const hasBanksOrOptional =
        unlockedBanks.length > 0 || optionalQuests.length > 0 || victoryResults.length > 0 || activeQuest;

    if (!hasBanksOrOptional || !onStartQuest) {
        return null;
    }

    const startOrReplace = (questDefId: string, options: StartQuestOptions) => {
        if (
            activeQuest
            && activeQuest.questDefId !== questDefId
            && !window.confirm(
                `You already have an active quest (“${activeQuestDef?.title ?? activeQuest.questDefId}”). `
                + 'Starting this quest abandons the current run. Continue?',
            )
        ) {
            return;
        }
        onStartQuest(questDefId, options);
    };

    const renderQuestRow = (q: QuestDef, startTestId: string, assignedBankId: string | null) => {
        const isActive = activeQuest?.questDefId === q.id;
        return (
            <QuestPickRow
                key={q.id}
                quest={q}
                isActive={isActive}
                activeSlotLabel={isActive ? activeSlotLabel : undefined}
                startTestId={startTestId}
                onStart={() =>
                    startOrReplace(q.id, {
                        mode: 'start',
                        assignedBankId,
                    })
                }
                onContinue={() => onStartQuest(q.id, { mode: 'continue' })}
                onAbandon={onAbandonQuest}
            />
        );
    };

    return (
        <div
            data-testid={TestIds.questBanksPanel}
            className="mb-3 mx-1 flex flex-col gap-3 rounded-lg border border-border-custom bg-surface px-3 py-2.5"
        >
            {!hideSectionTitle && (
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Quests</h3>
                </div>
            )}

            {unlockedBanks.length > 0 && (
                <section className="flex flex-col gap-2" aria-label="Quest slot banks">
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
                        Quest banks
                    </p>
                    {unlockedBanks.map((bank) => {
                        const clears = countQuestBankClears(bank, questResults);
                        const slotVictories = getQuestBankVictorySlots(bank, questResults);
                        const displaySlots = bank.displaySlotCount ?? bank.requiredClears;
                        const eligible = getEligibleQuestsForBank(
                            bank,
                            character.campaignId,
                            questResults,
                        );
                        const expanded = expandedBankId === bank.id;
                        const activeInBank =
                            activeQuest?.assignedBankId === bank.id ? activeQuest : null;
                        const activeInBankDef = activeInBank
                            ? getQuestDef(activeInBank.questDefId)
                            : undefined;

                        return (
                            <div
                                key={bank.id}
                                data-testid={`${TestIds.questBankPrefix}${bank.id}`}
                                className="rounded-md border border-border-custom bg-background/30 px-2.5 py-2"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-white capitalize truncate">
                                            {bankDisplayLabel(bank)}
                                        </p>
                                        <p className="text-[11px] text-muted mt-0.5">
                                            Progress:{' '}
                                            <span
                                                className={
                                                    clears >= bank.requiredClears
                                                        ? 'text-green-400 font-semibold'
                                                        : 'text-zinc-200 font-semibold'
                                                }
                                            >
                                                {clears}/{bank.requiredClears}
                                            </span>
                                            {bank.filters.tags?.length
                                                ? ` · tags: ${bank.filters.tags.join(', ')}`
                                                : ''}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="shrink-0 text-[11px] text-primary hover:underline cursor-pointer"
                                        onClick={() =>
                                            setExpandedBankId(expanded ? null : bank.id)
                                        }
                                        aria-expanded={expanded}
                                    >
                                        {expanded ? 'Hide quests' : 'Choose quest'}
                                    </button>
                                </div>

                                <ul className="mt-2 flex flex-col gap-1">
                                    {slotVictories.map((r) => (
                                        <li
                                            key={`${r.questDefId}-bank-${bank.id}`}
                                            className="flex items-center gap-2 text-[11px] text-zinc-300"
                                        >
                                            <span
                                                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-900/60 text-green-400 text-[10px] font-bold"
                                                aria-hidden
                                            >
                                                ✓
                                            </span>
                                            <span className="truncate">
                                                {getQuestDef(r.questDefId)?.title ?? r.questDefId}
                                            </span>
                                        </li>
                                    ))}
                                    {activeInBank && activeInBankDef && (
                                        <li className="flex items-center gap-2 text-[11px] text-amber-200">
                                            <span
                                                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-900/50 text-amber-300 text-[10px] font-bold"
                                                aria-hidden
                                            >
                                                …
                                            </span>
                                            <span className="truncate">
                                                In progress: {activeInBankDef.title}
                                            </span>
                                        </li>
                                    )}
                                    {Array.from({
                                        length: Math.max(
                                            0,
                                            displaySlots
                                                - slotVictories.length
                                                - (activeInBank ? 1 : 0),
                                        ),
                                    }).map((_, i) => (
                                        <li
                                            key={`empty-${bank.id}-${i}`}
                                            className="flex items-center gap-2 text-[11px] text-zinc-600"
                                        >
                                            <span
                                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-zinc-600 text-[10px]"
                                                aria-hidden
                                            >
                                                ○
                                            </span>
                                            <span>Open slot</span>
                                        </li>
                                    ))}
                                </ul>

                                {expanded && (
                                    <ul className="mt-2 flex flex-col gap-1.5 border-t border-white/8 pt-2">
                                        {eligible.length === 0 ? (
                                            <li className="text-[11px] text-muted italic px-0.5">
                                                No eligible quests for this bank.
                                            </li>
                                        ) : (
                                            eligible.map((q) =>
                                                renderQuestRow(
                                                    q,
                                                    `${TestIds.questStartPrefix}${q.id}`,
                                                    bank.id,
                                                ),
                                            )
                                        )}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </section>
            )}

            {optionalQuests.length > 0 && (
                <section className="flex flex-col gap-2" aria-label="Optional quests">
                    <p className="text-[10px] font-semibold text-violet-400/90 uppercase tracking-wide">
                        Optional / side quests
                    </p>
                    <ul className="flex flex-col gap-1.5">
                        {optionalQuests.map((q) =>
                            renderQuestRow(
                                q,
                                `${TestIds.questStartOptionalPrefix}${q.id}`,
                                null,
                            ),
                        )}
                    </ul>
                </section>
            )}

            {victoryResults.length > 0 && (
                <section className="flex flex-col gap-2" aria-label="Quest results">
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
                        Quest results
                    </p>
                    <ul className="flex flex-col gap-1.5">
                        {victoryResults.map((r) => (
                            <QuestResultBadge
                                key={`${r.questDefId}-${r.timestamp ?? r.placement ?? 'v'}`}
                                result={r}
                            />
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
