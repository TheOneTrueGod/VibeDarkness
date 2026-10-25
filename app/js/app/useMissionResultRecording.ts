import { useCallback } from 'react';
import type { LobbyClient } from '../LobbyClient';
import {
    applyMissionEndDarknessStrengthProgression,
    type DarknessStrengthDataPromotion,
} from '../darknessStrength/progression';
import { resolveCampaignInstanceId } from '../resolveCampaignInstanceId';
import { grantDarknessUpgradeNode } from '../researchTrees/darknessUpgrades';
import { ResearchSource } from '../researchTrees/types';
import type { LobbySessionSetters, UserDataUser } from './types';

interface UseMissionResultRecordingArgs extends Pick<LobbySessionSetters, 'setCurrentAccount'> {
    currentCampaignId: string | null;
    user: UserDataUser;
    lobbyClient: LobbyClient;
    refetchUser: () => Promise<void>;
}

/** Campaign-side mission result / DarknessStrength / Darkness Upgrade recording. */
export function useMissionResultRecording({
    currentCampaignId,
    user,
    lobbyClient,
    refetchUser,
    setCurrentAccount,
}: UseMissionResultRecordingArgs) {
    const applyDarknessStrengthMissionEnd = useCallback(
        async (
            outcome: 'victory' | 'defeat',
            promotions?: DarknessStrengthDataPromotion[]
        ) => {
            const campaignId = resolveCampaignInstanceId(currentCampaignId, user?.campaignIds);
            if (!campaignId) return;
            try {
                const campaign = await lobbyClient.getCampaign(campaignId);
                const nextInstances = applyMissionEndDarknessStrengthProgression(
                    campaign.darknessStrengthInstances ?? [],
                    { outcome, promotions }
                );
                await lobbyClient.updateCampaign(campaignId, {
                    darknessStrengthInstances: nextInstances,
                });
            } catch (e) {
                console.warn('Failed to apply DarknessStrength mission-end progression:', e);
            }
        },
        [currentCampaignId, user, lobbyClient]
    );

    /** Loads this client's campaign `darknessUpgrades` (host-only consumers: battle bootstrap + victory rewards). */
    const loadDarknessUpgrades = useCallback(async () => {
        const campaignId = resolveCampaignInstanceId(currentCampaignId, user?.campaignIds);
        if (!campaignId) return undefined;
        try {
            const campaign = await lobbyClient.getCampaign(campaignId);
            return campaign.darknessUpgrades;
        } catch (e) {
            console.warn('Failed to load Darkness Upgrades:', e);
            return undefined;
        }
    }, [currentCampaignId, user, lobbyClient]);

    const recordMissionResult = useCallback(
        async (
            missionId: string,
            result: string,
            resourceDelta?: Partial<Record<import('../types').CampaignResourceKey, number>>,
            grantKnowledgeKeys?: string[],
            itemIds?: string[],
            researchRewardIds?: string[],
            researchRewards?: import('../types').MissionResearchRewardEntry[],
            options?: {
                controlledNpcs?: boolean;
                /** Host-only: fold mission-end DarknessStrength progression into this PATCH. */
                applyDarknessStrengthProgression?: boolean;
                darknessStrengthPromotions?: DarknessStrengthDataPromotion[];
                /** Darkness Upgrade node ids to grant to this campaign (mission completion reward). */
                grantDarknessUpgradeIds?: string[];
            }
        ) => {
            const campaignId = resolveCampaignInstanceId(currentCampaignId, user?.campaignIds);
            if (!campaignId) return;
            try {
                let darknessStrengthInstances:
                    | import('../types').CampaignState['darknessStrengthInstances']
                    | undefined;
                if (options?.applyDarknessStrengthProgression) {
                    const campaign = await lobbyClient.getCampaign(campaignId);
                    darknessStrengthInstances = applyMissionEndDarknessStrengthProgression(
                        campaign.darknessStrengthInstances ?? [],
                        {
                            outcome: 'victory',
                            promotions: options.darknessStrengthPromotions,
                        }
                    );
                }
                let darknessUpgrades: import('../types').CampaignState['darknessUpgrades'] | undefined;
                if (result === 'victory' && options?.grantDarknessUpgradeIds?.length) {
                    const campaign = await lobbyClient.getCampaign(campaignId);
                    const granted = options.grantDarknessUpgradeIds.reduce(
                        (state, nodeId) => grantDarknessUpgradeNode(state, nodeId, ResearchSource.QuestReward, missionId),
                        campaign.darknessUpgrades,
                    );
                    if (granted !== campaign.darknessUpgrades) darknessUpgrades = granted;
                }
                await lobbyClient.updateCampaign(campaignId, {
                    ...(darknessUpgrades ? { darknessUpgrades } : {}),
                    addMissionResult: {
                        missionId,
                        result,
                        resourceDelta,
                        grantKnowledgeKeys,
                        itemIds,
                        researchRewardIds,
                        ...(researchRewards != null &&
                            researchRewards.length > 0 && { researchRewards }),
                        ...(options?.controlledNpcs === true && { controlledNpcs: true }),
                    },
                    ...(darknessStrengthInstances !== undefined
                        ? { darknessStrengthInstances }
                        : {}),
                });
                if (grantKnowledgeKeys?.length) {
                    const updated = await lobbyClient.getMe();
                    if (updated) {
                        setCurrentAccount(updated);
                        await refetchUser();
                    }
                }
            } catch (e) {
                console.warn('Failed to record mission result:', e);
            }
        },
        [currentCampaignId, user, lobbyClient, refetchUser, setCurrentAccount]
    );

    return { applyDarknessStrengthMissionEnd, loadDarknessUpgrades, recordMissionResult };
}
