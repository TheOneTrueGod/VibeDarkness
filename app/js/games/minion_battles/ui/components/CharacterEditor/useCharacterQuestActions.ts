import { useCallback } from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { StartQuestOptions } from '../../../storylines/questLobby';
import { abandonQuestRun } from '../../../storylines/questRun';
import type { QuestResult } from '../../../storylines/questTypes';
import { getQuestDef, isQuestDisabled } from '../../../storylines/index';

export interface UseCharacterQuestActionsArgs {
    character: CampaignCharacter;
    api: MinionBattlesApi;
    isAdmin: boolean;
    onSaved?: (updated: { equipment: string[]; name: string; portraitId: string }) => void;
    onStartQuest?: (questDefId: string, options?: StartQuestOptions) => void;
}

/** Mission Map handlers: admin mark-victory / campaign switch / quest reset, plus start and abandon quest. */
export function useCharacterQuestActions({ character, api, isAdmin, onSaved, onStartQuest }: UseCharacterQuestActionsArgs) {
    const handleMarkVictory = useCallback(async (missionId: string) => {
        if (!isAdmin) return;
        const campaignId = character.campaignId;
        const existingMap: Record<string, import('../../../../../types').MissionResult[]> = character.missionResults ?? {};
        const existingList = existingMap[campaignId] ?? [];
        if (existingList.find((r) => r.missionId === missionId && r.result !== 'defeat')) return;
        const newEntry = { missionId, result: 'victory' as const, timestamp: Date.now(), adminGranted: true };
        const updatedList = [...existingList.filter((r) => r.missionId !== missionId), newEntry];
        try {
            await api.updateCharacter(character.id, { missionResults: { ...existingMap, [campaignId]: updatedList } });
            onSaved?.({ equipment: character.equipment, name: character.name, portraitId: character.portraitId });
        } catch (e) {
            console.warn('Failed to mark victory:', e);
        }
    }, [isAdmin, character, api, onSaved]);

    /** Admin: record a quest victory in `bankId` with no rewards (mirrors Mark Victory on missions). */
    const handleMarkQuestVictory = useCallback(async (questDefId: string, bankId: string) => {
        if (!isAdmin) return;
        const campaignId = character.campaignId;
        const all = character.questResults ?? {};
        const existingList = all[campaignId] ?? [];
        if (existingList.some((r) => r.questDefId === questDefId && r.result === 'victory')) return;
        const newEntry: QuestResult = {
            questDefId,
            result: 'victory',
            timestamp: Date.now(),
            placement: 'bank',
            bankId,
            adminGranted: true,
            campaignRewardsApplied: true,
        };
        const clearRun = character.activeQuestRun?.questDefId === questDefId;
        try {
            await api.updateCharacter(character.id, {
                questResults: { ...all, [campaignId]: [...existingList, newEntry] },
                ...(clearRun ? { activeQuestRun: null } : {}),
            });
            onSaved?.({ equipment: character.equipment, name: character.name, portraitId: character.portraitId });
        } catch (e) {
            console.warn('Failed to mark quest victory:', e);
        }
    }, [isAdmin, character, api, onSaved]);

    const handleCampaignChange = useCallback(async (newCampaignId: string) => {
        if (!isAdmin || newCampaignId === character.campaignId) return;
        try {
            await api.updateCharacter(character.id, { campaignId: newCampaignId });
            onSaved?.({ equipment: character.equipment, name: character.name, portraitId: character.portraitId });
        } catch (e) {
            console.warn('Failed to update campaign:', e);
        }
    }, [isAdmin, character.id, character.campaignId, character.equipment, character.name, character.portraitId, api, onSaved]);

    /** Start / continue opens a quest lobby immediately (Quest Prep is in character_select). */
    const handleMapStartQuest = useCallback(
        (questDefId: string, options?: StartQuestOptions) => {
            if (!onStartQuest) return;
            if (!isAdmin && isQuestDisabled(getQuestDef(questDefId))) return;
            onStartQuest(questDefId, options);
        },
        [onStartQuest, isAdmin],
    );

    /** Clear the singular activeQuestRun after UI confirm. */
    const handleAbandonQuest = useCallback(async () => {
        const run = character.activeQuestRun;
        if (!run) return;
        try {
            void abandonQuestRun(run);
            await api.updateCharacter(character.id, { activeQuestRun: null });
            onSaved?.({
                equipment: character.equipment,
                name: character.name,
                portraitId: character.portraitId,
            });
        } catch (e) {
            console.warn('Failed to abandon quest:', e);
        }
    }, [character, api, onSaved]);

    /** Admin: drop a quest's recorded victories and its run so it can be run again. */
    const handleResetQuest = useCallback(async (questDefId: string) => {
        if (!isAdmin) return;
        const campaignId = character.campaignId;
        const all = character.questResults ?? {};
        const nextList = (all[campaignId] ?? []).filter((r) => r.questDefId !== questDefId);
        try {
            // Also drop this quest's run (prep / active / completed) so it can't trigger
            // the "already have an active quest" warning when starting again.
            const clearRun = character.activeQuestRun?.questDefId === questDefId;
            await api.updateCharacter(character.id, {
                questResults: { ...all, [campaignId]: nextList },
                ...(clearRun ? { activeQuestRun: null } : {}),
            });
            onSaved?.({
                equipment: character.equipment,
                name: character.name,
                portraitId: character.portraitId,
            });
        } catch (e) {
            console.warn('Failed to reset quest:', e);
        }
    }, [isAdmin, character, api, onSaved]);

    return {
        handleMarkVictory,
        handleMarkQuestVictory,
        handleCampaignChange,
        handleMapStartQuest,
        handleAbandonQuest,
        handleResetQuest,
    };
}
