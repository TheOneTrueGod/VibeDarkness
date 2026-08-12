/**
 * Victory modal - shows mission victory with optional rewards.
 */
import React from 'react';
import { getItemDef, ITEM_ICON_URLS } from '../../character_defs/items';
import type { CampaignResourceKey, MissionResearchRewardEntry } from '../../../../types';
import ResourcePill, { campaignResourceGains } from '../../../../components/ResourcePill';
import ResearchNodeCard from './ResearchNodeCard';
import { getResolvedMissionResearchRewards } from '../../../../researchTrees/list';
import type { CampaignRewardsPayload } from '../../storylines/questRun';
import { isCampaignRewardsPayloadEmpty } from '../../storylines/questCampaignRewards';

interface VictoryModalProps {
    missionRewards: {
        resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
        itemFromFirstChoice?: string;
        researchRewardIds?: string[];
        researchRewards?: MissionResearchRewardEntry[];
    } | null;
    /**
     * Quest-clear Campaign Rewards (completion + queued). Shown under "Campaign Rewards"
     * — not "pending meta".
     */
    campaignRewards?: CampaignRewardsPayload | null;
    onClose: () => void;
    /** Optional side missions branching off the completed mission. */
    sideMissions?: Array<{ missionId: string; name: string }>;
    /** Called when the player chooses to start a side mission instead of continuing. */
    onStartSideMission?: (missionId: string) => void;
    /** Whether the current player is the host. Controls which Continue UI is shown. */
    isHost?: boolean;
    /** Lobby ID the host created for the next mission (clients poll for this). */
    nextLobbyId?: string | null;
    /** Client-only: join the next lobby that the host created. */
    onJoinNextLobby?: (lobbyId: string) => Promise<void>;
    /**
     * When true, every player gets an active Continue (race-safe quest claim on the server).
     * Skips the host-only / waiting-for-host split used for normal mission continue.
     */
    questContinuation?: boolean;
    /** Quest chain banner (e.g. progress or quest-complete). */
    questBanner?: string | null;
    /** Host Continue button label override. */
    continueLabel?: string;
}

function ItemRewardCard({ itemId, caption }: { itemId: string; caption?: string }) {
    const itemDef = getItemDef(itemId);
    const itemIconUrl = ITEM_ICON_URLS[itemId];
    if (!itemDef || !itemIconUrl) return null;
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-primary bg-surface px-4 py-3 min-w-[100px]">
                <img
                    src={itemIconUrl}
                    alt=""
                    className="h-12 w-12 object-contain"
                    aria-hidden
                />
                <p className="mt-2 text-sm font-medium text-white">{itemDef.name}</p>
            </div>
            {caption ? <span className="text-xs text-muted">{caption}</span> : null}
        </div>
    );
}

export default function VictoryModal({
    missionRewards,
    campaignRewards = null,
    onClose,
    sideMissions,
    onStartSideMission,
    isHost,
    nextLobbyId,
    onJoinNextLobby,
    questContinuation = false,
    questBanner,
    continueLabel = 'Continue',
}: VictoryModalProps) {
    const researchRewards = getResolvedMissionResearchRewards(missionRewards);
    const hasMissionRewards =
        missionRewards &&
        ((missionRewards.itemFromFirstChoice != null && missionRewards.itemFromFirstChoice !== '') ||
            (missionRewards.resourceDelta &&
                Object.keys(missionRewards.resourceDelta).length > 0 &&
                Object.values(missionRewards.resourceDelta).some((v) => v != null && v > 0)) ||
            researchRewards.length > 0);

    const hasCampaignRewards =
        campaignRewards != null && !isCampaignRewardsPayloadEmpty(campaignRewards);

    const resourceDelta = missionRewards?.resourceDelta ?? {};
    const itemId = missionRewards?.itemFromFirstChoice;
    const gainedResources = campaignResourceGains(
        resourceDelta as Partial<Record<CampaignResourceKey, number>>,
    );

    const campaignResourceGainsList = hasCampaignRewards
        ? campaignResourceGains(campaignRewards.resourceDelta)
        : [];
    const campaignItemIds = hasCampaignRewards
        ? Array.from(
              new Set([...campaignRewards.unlockItemIds, ...campaignRewards.itemCardIds]),
          )
        : [];
    const campaignResearchRewards = hasCampaignRewards
        ? getResolvedMissionResearchRewards({
              researchRewardIds: campaignRewards.researchRewardIds,
          })
        : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-surface-light border border-border-custom rounded-lg shadow-xl p-10 mx-4 text-center min-h-[33vh] min-w-[33vw] w-[33vw] flex flex-col justify-center">
                <h2 className="text-2xl font-bold text-success mb-2">Victory!</h2>
                {questBanner ? (
                    <p className="text-sm text-primary mb-3">{questBanner}</p>
                ) : null}
                {hasMissionRewards && (
                    <>
                        <h3 className="text-lg font-semibold text-white mb-4">Rewards</h3>
                        <div className="flex flex-col items-center gap-4 mb-6">
                            {itemId ? (
                                <ItemRewardCard itemId={itemId} caption="From your choice" />
                            ) : null}
                            {gainedResources.length > 0 ? (
                                <div className="flex flex-wrap justify-center gap-3">
                                    {gainedResources.map(({ resource, count }) => (
                                        <ResourcePill key={resource} resource={resource} count={count} />
                                    ))}
                                </div>
                            ) : null}
                            {researchRewards.length > 0 ? (
                                <div className="w-full space-y-2">
                                    <p className="text-sm text-muted">Research gained:</p>
                                    <div className="flex flex-wrap justify-center gap-3">
                                        {researchRewards.map(({ rewardId, node }) => (
                                            <ResearchNodeCard
                                                key={rewardId}
                                                variant="display"
                                                tone="muted"
                                                layout="comfortable"
                                                node={node}
                                                showCost={false}
                                                showRequirements={false}
                                                state="researched"
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </>
                )}
                {hasCampaignRewards && campaignRewards ? (
                    <>
                        <h3 className="text-lg font-semibold text-white mb-4">Campaign Rewards</h3>
                        <div className="flex flex-col items-center gap-4 mb-6">
                            {campaignItemIds.map((id) => (
                                <ItemRewardCard key={id} itemId={id} />
                            ))}
                            {campaignResourceGainsList.length > 0 ? (
                                <div className="flex flex-wrap justify-center gap-3">
                                    {campaignResourceGainsList.map(({ resource, count }) => (
                                        <ResourcePill
                                            key={`campaign-${resource}`}
                                            resource={resource}
                                            count={count}
                                        />
                                    ))}
                                </div>
                            ) : null}
                            {campaignRewards.knowledgeKeys.length > 0 ? (
                                <div className="w-full space-y-1">
                                    <p className="text-sm text-muted">Knowledge:</p>
                                    <ul className="text-sm text-white space-y-0.5">
                                        {campaignRewards.knowledgeKeys.map((key) => (
                                            <li key={key}>{key}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                            {campaignResearchRewards.length > 0 ? (
                                <div className="w-full space-y-2">
                                    <p className="text-sm text-muted">Research gained:</p>
                                    <div className="flex flex-wrap justify-center gap-3">
                                        {campaignResearchRewards.map(({ rewardId, node }) => (
                                            <ResearchNodeCard
                                                key={`campaign-${rewardId}`}
                                                variant="display"
                                                tone="muted"
                                                layout="comfortable"
                                                node={node}
                                                showCost={false}
                                                showRequirements={false}
                                                state="researched"
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}
                {!hasMissionRewards && !hasCampaignRewards && (
                    <p className="text-muted mb-6">You have prevailed.</p>
                )}
                {sideMissions && sideMissions.length > 0 && (
                    <div className="mb-4">
                        <p className="text-xs text-muted mb-2">Optional side quests available:</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {sideMissions.map((sm) => (
                                <button
                                    key={sm.missionId}
                                    type="button"
                                    className="px-4 py-2 bg-violet-800 hover:bg-violet-700 text-violet-100 font-medium rounded transition-colors border border-violet-600"
                                    onClick={() => onStartSideMission?.(sm.missionId)}
                                >
                                    {sm.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="flex justify-center">
                    {/* Quest continuation: any party member claims the same next lobby. */}
                    {questContinuation ? (
                        <button
                            type="button"
                            className="px-6 py-2 bg-primary hover:bg-primary-hover text-secondary font-medium rounded transition-colors"
                            onClick={onClose}
                        >
                            {continueLabel}
                        </button>
                    ) : (
                        <>
                            {/* Host (or solo play): existing continue flow */}
                            {(isHost === true || isHost === undefined) && (
                                <button
                                    type="button"
                                    className="px-6 py-2 bg-primary hover:bg-primary-hover text-secondary font-medium rounded transition-colors"
                                    onClick={onClose}
                                >
                                    {continueLabel}
                                </button>
                            )}
                            {/* Client, waiting for host to choose next mission */}
                            {isHost === false && !nextLobbyId && (
                                <button
                                    type="button"
                                    className="px-6 py-2 bg-gray-600 text-gray-400 font-medium rounded cursor-not-allowed"
                                    disabled
                                >
                                    Waiting for host…
                                </button>
                            )}
                            {/* Client, host has created next lobby */}
                            {isHost === false && nextLobbyId && (
                                <button
                                    type="button"
                                    className="px-6 py-2 bg-primary hover:bg-primary-hover text-secondary font-medium rounded transition-colors"
                                    onClick={() => onJoinNextLobby?.(nextLobbyId)}
                                >
                                    {continueLabel}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
