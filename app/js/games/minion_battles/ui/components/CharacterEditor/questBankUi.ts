import type { CampaignResourceKey } from '../../../../../types';
import { campaignResourceGains } from '../../../../../components/ResourcePill';
import { MISSION_MAP } from '../../../storylines/index';
import type { QuestDef, QuestResult, QuestRunState, QuestSlotBank } from '../../../storylines/questTypes';

export function bankDisplayLabel(bank: QuestSlotBank): string {
    return bank.title ?? bank.id.replace(/_/g, ' ');
}

/** Player-facing name of the mission or bank this slot waits on, or null if ungated. */
export function questBankUnlockRequirementLabel(
    bank: QuestSlotBank,
    banks: readonly QuestSlotBank[],
): string | null {
    if (bank.unlockAfterQuestBankId) {
        const prior = banks.find((b) => b.id === bank.unlockAfterQuestBankId);
        return prior ? bankDisplayLabel(prior) : bank.unlockAfterQuestBankId;
    }
    if (bank.unlockAfterMissionId) {
        return MISSION_MAP[bank.unlockAfterMissionId]?.name ?? bank.unlockAfterMissionId;
    }
    return null;
}

/** Player-facing placement chip on a victory row (bank title, not the wire id). */
export function questResultPlacementLabel(
    result: QuestResult,
    banks: QuestSlotBank[],
): string | null {
    if (result.placement === 'optional') return 'optional';
    if (result.placement !== 'bank' || !result.bankId) return null;
    const bank = banks.find((b) => b.id === result.bankId);
    const name = bank ? bankDisplayLabel(bank) : result.bankId.replace(/_/g, ' ');
    return `bank · ${name}`;
}

/** Shared chrome for the optional/side-quest list box. */
export const QUEST_SECTION_BOX_CLASS =
    'flex flex-col gap-2 rounded-lg border border-border-custom bg-surface px-3 py-2.5';

/**
 * Campaign resource grants from the quest def itself (`completionRewards`).
 * Does not include mission/slot rewards from inner quest missions.
 */
export function questCompletionResourceGains(
    quest: QuestDef,
): { resource: CampaignResourceKey; count: number }[] {
    return campaignResourceGains(quest.completionRewards?.resourceDelta);
}

/**
 * Confirm replacing a different in-progress run. Returns true when start may proceed.
 */
export function confirmReplaceActiveQuest(
    activeQuest: QuestRunState | null,
    activeQuestDef: QuestDef | undefined,
    nextQuestDefId: string,
): boolean {
    if (!activeQuest || activeQuest.questDefId === nextQuestDefId) return true;
    const title = activeQuestDef?.title ?? activeQuest.questDefId;
    return window.confirm(
        `You already have an active quest (“${title}”). `
        + 'Starting this quest abandons the current run. Continue?',
    );
}
