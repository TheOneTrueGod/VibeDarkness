import React, { Fragment, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CampaignResourceKey, CampaignState, MissionResearchRewardEntry, MissionResult } from '../../types';
import type { LobbyClient } from '../../LobbyClient';
import { STORYLINES, MISSION_MAP } from '../../games/minion_battles/storylines';
import { getUnlockedMissionIds, getAllMissionIdsInOrder, hasVictoryResult } from '../../games/minion_battles/storylines/unlock';
import { getResolvedMissionResearchRewards, type ResolvedResearchReward } from '../../researchTrees/list';
import ResourcePill, { campaignResourceGains } from '../ResourcePill';
import ResearchRewardTinyChip, { MISSION_REWARD_CHIP_CLASSNAME } from '../ResearchRewardTinyChip';
import { ITEM_ICON_URLS, getItemDef } from '../../games/minion_battles/character_defs/items';
import PanelLayout from './PanelLayout';

type MissionResultWithItems = MissionResult & {
    itemCardIds?: string[];
    itemIds?: string[];
    itemId?: string;
    researchRewards?: MissionResearchRewardEntry[];
};

function MissionRewardsStrip({
    missionId,
    gainedResources,
    gainedItemCardIds,
    gainedResearchRewards,
}: {
    missionId: string;
    gainedResources: { resource: CampaignResourceKey; count: number }[];
    gainedItemCardIds: string[];
    gainedResearchRewards: ResolvedResearchReward[];
}) {
    const hasResearch = gainedResearchRewards.length > 0;
    const hasItems = gainedItemCardIds.length > 0;
    const hasResources = gainedResources.length > 0;
    const hasAnyReward = hasResearch || hasItems || hasResources;

    const blocks: { key: string; content: ReactNode }[] = [];
    if (hasResearch) {
        blocks.push({
            key: 'research',
            content: (
                <span className="inline-flex flex-wrap items-center gap-2 align-middle">
                    {gainedResearchRewards.map(({ treeId, nodeId, node }) => (
                        <ResearchRewardTinyChip key={`${missionId}-${treeId}-${nodeId}`} node={node} />
                    ))}
                </span>
            ),
        });
    }
    if (hasItems) {
        blocks.push({
            key: 'items',
            content: (
                <span className="inline-flex flex-wrap items-center gap-2 align-middle">
                    {gainedItemCardIds.map((itemId, idx) => {
                        const itemDef = getItemDef(itemId);
                        const iconUrl = ITEM_ICON_URLS[itemId];
                        return (
                            <span
                                key={`${missionId}-${itemId}-${idx}`}
                                className={`${MISSION_REWARD_CHIP_CLASSNAME} text-white`}
                                title={itemDef?.name ?? itemId}
                            >
                                {iconUrl ? (
                                    <img src={iconUrl} alt="" className="h-4 w-4 object-contain" aria-hidden />
                                ) : null}
                                {itemDef?.name ?? itemId}
                            </span>
                        );
                    })}
                </span>
            ),
        });
    }
    if (hasResources) {
        blocks.push({
            key: 'resources',
            content: (
                <span className="inline-flex flex-wrap items-center gap-2 align-middle">
                    {gainedResources.map(({ resource, count }) => (
                        <ResourcePill key={`${missionId}-${resource}`} resource={resource} count={count} />
                    ))}
                </span>
            ),
        });
    }

    return (
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted">
            <span className="shrink-0 font-medium">Rewards:</span>
            {!hasAnyReward ? (
                <span className="text-muted">None</span>
            ) : (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-2">
                    {blocks.map((b, i) => (
                        <Fragment key={b.key}>
                            {i > 0 && (
                                <span className="select-none text-zinc-600" aria-hidden>·</span>
                            )}
                            {b.content}
                        </Fragment>
                    ))}
                </span>
            )}
        </span>
    );
}

interface MissionSelectPanelProps {
    campaign: CampaignState;
    isAdmin: boolean;
    lobbyClient: LobbyClient;
    onSelectMission: (missionId: string, campaignId: string | null) => Promise<boolean>;
    onCampaignUpdated: (updated: CampaignState) => void;
}

export default function MissionSelectPanel({
    campaign,
    isAdmin,
    lobbyClient,
    onSelectMission,
    onCampaignUpdated,
}: MissionSelectPanelProps) {
    const [selectingMission, setSelectingMission] = useState(false);
    const [resettingStorylineId, setResettingStorylineId] = useState<string | null>(null);

    const missionResults = useMemo(
        () => campaign.missionResults ?? [],
        [campaign.missionResults],
    );

    const latestMissionResultById = useMemo(() => {
        const map = new Map<string, MissionResultWithItems>();
        for (const result of missionResults as MissionResultWithItems[]) {
            const existing = map.get(result.missionId);
            if (!existing) {
                map.set(result.missionId, result);
                continue;
            }
            const existingTs = existing.timestamp ?? 0;
            const nextTs = result.timestamp ?? 0;
            if (nextTs >= existingTs) {
                map.set(result.missionId, result);
            }
        }
        return map;
    }, [missionResults]);

    const handleMissionClick = useCallback(
        async (missionId: string) => {
            if (selectingMission) return;
            setSelectingMission(true);
            try {
                await onSelectMission(missionId, campaign.id ?? null);
            } finally {
                setSelectingMission(false);
            }
        },
        [onSelectMission, selectingMission, campaign.id],
    );

    const handleResetStoryline = useCallback(
        async (storylineId: string) => {
            const storyline = STORYLINES.find((entry) => entry.id === storylineId);
            if (!storyline) return;
            const missionIds = getAllMissionIdsInOrder(storyline);
            if (missionIds.length === 0) return;
            const confirmed = window.confirm(
                `Reset storyline "${storyline.title}"? This will remove all saved mission results for this storyline in your campaign.`,
            );
            if (!confirmed) return;

            setResettingStorylineId(storylineId);
            try {
                const missionIdSet = new Set(missionIds);
                const filteredMissionResults = (campaign.missionResults ?? []).filter(
                    (result) => !missionIdSet.has(result.missionId),
                );
                const updatedCampaign = await lobbyClient.updateCampaign(campaign.id, {
                    missionResults: filteredMissionResults,
                });
                onCampaignUpdated(updatedCampaign);
            } finally {
                setResettingStorylineId(null);
            }
        },
        [campaign, lobbyClient, onCampaignUpdated],
    );

    return (
        <PanelLayout
            title="Mission Select"
            center={
                <div className="p-5 space-y-6">
                    {STORYLINES.map((storyline) => {
                        const unlocked = getUnlockedMissionIds(storyline, missionResults);
                        const missionIds = getAllMissionIdsInOrder(storyline);
                        const isResetting = resettingStorylineId === storyline.id;
                        return (
                            <div key={storyline.id} className="bg-surface-light rounded-lg p-5">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h3 className="text-lg font-medium">{storyline.title}</h3>
                                    <button
                                        type="button"
                                        className="px-3 py-1.5 rounded border border-border-custom bg-surface text-sm text-muted hover:text-white hover:border-primary transition-colors disabled:opacity-60 disabled:cursor-wait"
                                        disabled={isResetting}
                                        onClick={() => { void handleResetStoryline(storyline.id); }}
                                    >
                                        {isResetting ? 'Resetting…' : 'Reset Storyline'}
                                    </button>
                                </div>
                                <ul className="space-y-2">
                                    {missionIds.map((missionId) => {
                                        const def = MISSION_MAP[missionId];
                                        const name = def?.name ?? missionId;
                                        const isUnlocked = unlocked.has(missionId);
                                        const canStartMission = isUnlocked || isAdmin;
                                        const hasVictory = hasVictoryResult(missionId, missionResults);
                                        const missionResult = latestMissionResultById.get(missionId);
                                        const gainedResources = campaignResourceGains(missionResult?.resourceDelta);
                                        const gainedResearchRewards = getResolvedMissionResearchRewards(missionResult);
                                        const gainedItemCardIds = [
                                            ...(Array.isArray(missionResult?.itemCardIds) ? missionResult.itemCardIds : []),
                                            ...(Array.isArray(missionResult?.itemIds) ? missionResult.itemIds : []),
                                            ...(missionResult?.itemId ? [missionResult.itemId] : []),
                                        ];
                                        return (
                                            <li key={missionId}>
                                                <button
                                                    type="button"
                                                    className="w-full text-left px-4 py-3 rounded border transition-all bg-surface border-border-custom hover:border-primary hover:bg-surface-light disabled:opacity-70 disabled:cursor-wait"
                                                    disabled={selectingMission || !canStartMission}
                                                    onClick={() => handleMissionClick(missionId)}
                                                    title={!canStartMission ? 'Complete the previous mission to unlock' : undefined}
                                                >
                                                    <span className="flex items-start justify-between gap-3">
                                                        <span className="flex min-w-0 items-center gap-2">
                                                            {!canStartMission && (
                                                                <svg className="w-5 h-5 flex-shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                </svg>
                                                            )}
                                                            <span className="truncate">{name}</span>
                                                        </span>
                                                        <span className="flex shrink-0 items-center gap-2">
                                                            {missionResult ? (
                                                                <>
                                                                    <span className={
                                                                        missionResult.result.toLowerCase() === 'victory'
                                                                            ? 'text-sm font-semibold text-success'
                                                                            : 'text-sm font-semibold text-danger'
                                                                    }>
                                                                        {missionResult.result.toLowerCase() === 'victory'
                                                                            ? 'Victory'
                                                                            : missionResult.result}
                                                                    </span>
                                                                    {missionResult.result.toLowerCase() === 'victory' && (
                                                                        <span className="text-success" aria-hidden>
                                                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                            </svg>
                                                                        </span>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                hasVictory && (
                                                                    <span className="text-success" aria-hidden>
                                                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    </span>
                                                                )
                                                            )}
                                                        </span>
                                                    </span>
                                                    {missionResult && (
                                                        <span className="mt-3 pt-3 border-t border-border-custom flex flex-col gap-2">
                                                            <MissionRewardsStrip
                                                                missionId={missionId}
                                                                gainedResources={gainedResources}
                                                                gainedItemCardIds={gainedItemCardIds}
                                                                gainedResearchRewards={gainedResearchRewards}
                                                            />
                                                        </span>
                                                    )}
                                                </button>
                                            </li>
                                        );
                                    })}
                                    {missionIds.length === 0 && (
                                        <li className="text-sm text-muted">No missions available yet.</li>
                                    )}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            }
        />
    );
}
