import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { AccountState, CampaignState } from '../../../../../types';
import ChapterSkipWizard from './ChapterSkipWizard';
import {
    stripChapterResearchRewards,
    type ChapterSkipCharacterState,
    type ChapterSkipContext,
    type ChapterSkipPlan,
} from '../../../storylines/chapterSkip';
import type { CampaignChapterDef } from '../../../storylines/types';

export interface UseChapterSkipArgs {
    character: CampaignCharacter;
    account: AccountState | null | undefined;
    api: MinionBattlesApi;
    isAdmin: boolean;
    resolvedCampaign: CampaignState | null | undefined;
    onSaved?: (updated: { equipment: string[]; name: string; portraitId: string }) => void;
}

/** Admin Skip Chapter wizard: open-chapter state, persistence of the plan, and the portal modal. */
export function useChapterSkip({ character, account, api, isAdmin, resolvedCampaign, onSaved }: UseChapterSkipArgs) {
    /** Admin: chapter whose Skip Chapter wizard is open. */
    const [skipChapter, setSkipChapter] = useState<CampaignChapterDef | null>(null);

    /** Wizard start: the character with research from this chapter's earlier results removed ("replace"). */
    const chapterSkipStart = useMemo((): ChapterSkipCharacterState | null => {
        if (!skipChapter) return null;
        return stripChapterResearchRewards(
            {
                equipment: [...character.equipment],
                researchTrees: character.researchTrees ?? {},
                researchNodeLevels: character.researchNodeLevels ?? {},
                researchSources: character.researchSources ?? {},
            },
            character.missionResults?.[character.campaignId] ?? [],
            skipChapter.missionIds,
        );
    }, [skipChapter, character]);

    const ownerAccountId = character.ownerAccountId ?? account?.id;
    const chapterSkipCtx = useMemo(
        (): ChapterSkipContext => ({
            playerId: ownerAccountId != null ? String(ownerAccountId) : '',
            accountKnowledge: account?.knowledge ?? {},
        }),
        [ownerAccountId, account?.knowledge],
    );

    /** Admin: persist a Skip Chapter plan like a real playthrough (character, campaign, account knowledge). */
    const handleApplyChapterSkip = useCallback(async (plan: ChapterSkipPlan) => {
        if (!isAdmin || !skipChapter) return;
        const isInstanceId = (id: string) => /^[a-f0-9]{16}$/.test(id);
        const campaignInstanceId =
            resolvedCampaign?.id
            ?? (isInstanceId(character.campaignId) ? character.campaignId : account?.campaignIds?.[0]);
        if (!campaignInstanceId) throw new Error('No campaign found for this character.');

        const storylineId = character.campaignId;
        const now = Date.now();
        const chapterIds = new Set(skipChapter.missionIds);
        const existingMap = character.missionResults ?? {};
        const keptResults = (existingMap[storylineId] ?? []).filter((r) => !chapterIds.has(r.missionId));
        const newResults = plan.missionResults.map((r, i) => ({ ...r, timestamp: now + i }));

        await api.updateCharacter(character.id, {
            equipment: plan.state.equipment,
            researchTrees: plan.state.researchTrees,
            researchNodeLevels: plan.state.researchNodeLevels,
            researchSources: plan.state.researchSources,
            missionResults: { ...existingMap, [storylineId]: [...keptResults, ...newResults] },
        });
        for (const r of plan.missionResults) {
            await api.recordCampaignMissionResult(campaignInstanceId, {
                missionId: r.missionId,
                result: r.result,
                resourceDelta: r.resourceDelta,
                itemIds: r.itemIds,
                researchRewards: r.researchRewards,
            });
        }
        if (ownerAccountId != null) {
            for (const key of plan.knowledgeKeys) {
                if (!account?.knowledge?.[key]) await api.grantAccountKnowledge(ownerAccountId, key);
            }
        }
        onSaved?.({ equipment: plan.state.equipment, name: character.name, portraitId: character.portraitId });
    }, [isAdmin, skipChapter, resolvedCampaign?.id, character, account?.campaignIds, account?.knowledge, ownerAccountId, api, onSaved]);

    const chapterSkipModal =
        skipChapter && chapterSkipStart
            ? createPortal(
                <ChapterSkipWizard
                    chapter={skipChapter}
                    start={chapterSkipStart}
                    ctx={chapterSkipCtx}
                    onApply={(_picks, plan) => handleApplyChapterSkip(plan)}
                    onClose={() => setSkipChapter(null)}
                />,
                document.body,
            )
            : null;

    return { setSkipChapter, chapterSkipModal };
}
