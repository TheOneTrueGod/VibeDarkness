/**
 * Scrollable picker for a multi-quest QuestSlotBank (e.g. Surface Quests).
 * Reuses QuestPickRow from the old side-quests menu; two quests per row.
 */
import React, { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { QuestSlotBank } from '../../../storylines/questTypes';
import type { StartQuestOptions } from '../../../storylines/questLobby';
import {
    countQuestBankClears,
    getEligibleQuestsForBank,
    getQuestDef,
    MISSION_MAP,
} from '../../../storylines/index';
import { TestIds } from '../../../../../testing/testIds';
import { QuestPickRow } from './QuestPickRow';
import {
    QUEST_SECTION_BOX_CLASS,
    bankDisplayLabel,
    confirmReplaceActiveQuest,
} from './questBankUi';

/** Narrower than the old full-pane side-quests menu. */
export const QUEST_BANK_PICKER_POPUP_WIDTH_CLASS = 'w-[36rem] max-w-[92vw]';
const QUEST_BANK_PICKER_LIST_MAX_HEIGHT_CLASS = 'max-h-[min(24rem,60vh)]';

export interface QuestBankPickerPopupProps {
    character: CampaignCharacter;
    bank: QuestSlotBank;
    isUnlocked: boolean;
    isAdmin: boolean;
    onStartQuest: (questDefId: string, options?: StartQuestOptions) => void;
    onAbandonQuest?: () => void | Promise<void>;
    onClose: () => void;
}

export default function QuestBankPickerPopup({
    character,
    bank,
    isUnlocked,
    isAdmin,
    onStartQuest,
    onAbandonQuest,
    onClose,
}: QuestBankPickerPopupProps) {
    const questResults = useMemo(
        () => character.questResults[character.campaignId] ?? [],
        [character.questResults, character.campaignId],
    );

    const eligible = useMemo(
        () => getEligibleQuestsForBank(bank, character.campaignId, questResults),
        [bank, character.campaignId, questResults],
    );

    const clears = countQuestBankClears(bank, questResults);
    const label = bankDisplayLabel(bank);

    const activeQuest =
        character.activeQuestRun?.status === 'active'
        || character.activeQuestRun?.status === 'prep'
            ? character.activeQuestRun
            : null;
    const activeQuestDef = activeQuest ? getQuestDef(activeQuest.questDefId) : undefined;
    const activeSlotLabel = activeQuest
        ? `${activeQuest.currentSlotIndex + 1}/${activeQuest.resolvedSlots.length}`
        : undefined;

    const assignedBankId = isUnlocked ? bank.id : null;
    const startPrefix = isUnlocked
        ? TestIds.questStartPrefix
        : TestIds.questStartOptionalPrefix;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const startOrReplace = (questDefId: string, options: StartQuestOptions) => {
        if (!confirmReplaceActiveQuest(activeQuest, activeQuestDef, questDefId)) return;
        onStartQuest(questDefId, options);
        onClose();
    };

    const handleAdminSeek = (questDefId: string, slotIndex: number, bankId: string | null) => {
        startOrReplace(questDefId, {
            mode: 'start',
            assignedBankId: bankId,
            adminSeekSlotIndex: slotIndex,
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-label={label}
            data-testid={TestIds.questBankPickerPopup}
        >
            <div
                className={`${QUEST_BANK_PICKER_POPUP_WIDTH_CLASS} bg-black border border-border-custom rounded-lg shadow-xl p-4 flex flex-col gap-3`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-bold text-white truncate">{label}</h3>
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
                        </p>
                    </div>
                    <button
                        type="button"
                        data-testid={TestIds.questBankPickerClose}
                        onClick={onClose}
                        className="h-7 w-7 shrink-0 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer"
                        aria-label="Close quest list"
                        title="Close"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </div>

                {!isUnlocked && (
                    <p className="text-[12px] text-amber-200/90">
                        {bank.unlockAfterMissionId
                            ? `This slot unlocks after ${MISSION_MAP[bank.unlockAfterMissionId]?.name ?? bank.unlockAfterMissionId}. You can still start matching quests.`
                            : 'This slot is locked. You can still start matching quests.'}
                    </p>
                )}

                <section className={QUEST_SECTION_BOX_CLASS} aria-label="Optional quests">
                    <p className="text-[10px] font-semibold text-violet-400/90 uppercase tracking-wide">
                        Optional / side quests
                    </p>
                    {eligible.length === 0 ? (
                        <p className="text-[11px] text-muted italic px-0.5">
                            No eligible quests for this bank.
                        </p>
                    ) : (
                        <div
                            className={`grid grid-cols-2 gap-1.5 overflow-y-auto ${QUEST_BANK_PICKER_LIST_MAX_HEIGHT_CLASS} pr-0.5`}
                        >
                            {eligible.map((q) => {
                                const isActive = activeQuest?.questDefId === q.id;
                                return (
                                    <QuestPickRow
                                        key={q.id}
                                        quest={q}
                                        isActive={isActive}
                                        activeSlotLabel={isActive ? activeSlotLabel : undefined}
                                        activeRun={isActive ? activeQuest : null}
                                        isAdmin={isAdmin}
                                        assignedBankId={assignedBankId}
                                        startTestId={`${startPrefix}${q.id}`}
                                        onStart={() =>
                                            startOrReplace(q.id, {
                                                mode: 'start',
                                                assignedBankId,
                                            })
                                        }
                                        onContinue={() => {
                                            onStartQuest(q.id, { mode: 'continue' });
                                            onClose();
                                        }}
                                        onAbandon={onAbandonQuest}
                                        onAdminSeek={
                                            isAdmin
                                                ? (slotIndex, bankId) =>
                                                    handleAdminSeek(q.id, slotIndex, bankId)
                                                : undefined
                                        }
                                    />
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
