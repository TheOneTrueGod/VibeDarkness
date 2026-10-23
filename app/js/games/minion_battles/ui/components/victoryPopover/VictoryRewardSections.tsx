/**
 * Reward sections of the victory popover: Mission Results (items, resource cards, research) and
 * Campaign Results (quest-clear rewards), or the "You have prevailed." fallback when there is nothing to show.
 */
import React, { useRef, useState } from 'react';
import { getItemDef, ITEM_ICON_URLS } from '../../../character_defs/items';
import type { CampaignResourceKey, MissionResearchRewardEntry } from '../../../../../types';
import ResourcePill, { campaignResourceGains } from '../../../../../components/ResourcePill';
import { CAMPAIGN_RESULTS_LABEL, MISSION_RESULTS_LABEL } from '../../../../../components/missionResultCopy';
import ResearchNodeCard from '../ResearchNodeCard';
import { getResearchTree, getResolvedMissionResearchRewards } from '../../../../../researchTrees/list';
import type { CampaignRewardsPayload } from '../../../storylines/questRun';
import { isCampaignRewardsPayloadEmpty } from '../../../storylines/questCampaignRewards';
import LocationCardPill from '../LocationCardPill';
import { DARKNESS_UPGRADES_TREE_ID, DARKNESS_UPGRADE_ICON } from '../../../../../researchTrees/darknessUpgrades';
import { Coins, type LucideIcon } from 'lucide-react';
import { AnchoredPortalTooltip, PORTAL_TOOLTIP_SURFACE_CLASS } from '../AnchoredPortalTooltip';
import type { DarknessUpgradeRewardLineItem } from '../../../../../researchTrees/darknessUpgradeRewards';

export interface VictoryMissionRewards {
    resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
    itemFromFirstChoice?: string;
    /** Items unlocked for the campaign by the mission's `unlockItemTiers` reward. */
    unlockedItemIds?: string[];
    researchRewardIds?: string[];
    researchRewards?: MissionResearchRewardEntry[];
    /** Darkness Upgrade bonus lines (host's active set, shown for every player); already included in `resourceDelta`. */
    darknessUpgradeLines?: DarknessUpgradeRewardLineItem[];
}

interface VictoryRewardSectionsProps {
    missionRewards: VictoryMissionRewards | null;
    /** Quest-clear Campaign Rewards (completion + queued). Shown under Campaign Results. */
    campaignRewards?: CampaignRewardsPayload | null;
    /** Show "You have prevailed." when there are no rewards at all (only once results are final). */
    showFallback: boolean;
}

interface RewardCardData {
    key: string;
    title: string;
    Icon?: LucideIcon;
    /** Hover description (basic tooltip). */
    tooltip?: string;
    gains: ReturnType<typeof campaignResourceGains>;
}

/** Bordered reward card (title flanked by its icon, then resource pills); optional hover tooltip. */
function RewardCard({ card, wide }: { card: RewardCardData; wide: boolean }) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [hovered, setHovered] = useState(false);
    const { Icon } = card;
    return (
        <div
            ref={ref}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            // One card: centred at natural width; two or more: two per row.
            className={`flex flex-col items-center gap-2 rounded-lg border border-border-custom bg-surface px-3 py-2 ${
                wide ? 'w-[calc(50%-0.375rem)]' : ''
            }`}
        >
            <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
                {card.title}
                {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
            </span>
            <div className="flex flex-wrap justify-center gap-2">
                {card.gains.map(({ resource, count }) => (
                    <ResourcePill key={resource} resource={resource} count={count} />
                ))}
            </div>
            {card.tooltip ? (
                <AnchoredPortalTooltip anchorRef={ref} open={hovered} className={`${PORTAL_TOOLTIP_SURFACE_CLASS} px-3 py-2 text-sm`}>
                    {card.tooltip}
                </AnchoredPortalTooltip>
            ) : null}
        </div>
    );
}

/** Short hover text for a Darkness Upgrade: its `summary`, else its full description. */
function getDarknessUpgradeTooltip(nodeId: string): string | undefined {
    const node = getResearchTree(DARKNESS_UPGRADES_TREE_ID)?.nodes.find((n) => n.id === nodeId);
    return node?.summary ?? node?.description;
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

export default function VictoryRewardSections({
    missionRewards,
    campaignRewards = null,
    showFallback,
}: VictoryRewardSectionsProps) {
    const researchRewards = getResolvedMissionResearchRewards(missionRewards);
    const hasMissionRewards =
        missionRewards &&
        ((missionRewards.itemFromFirstChoice != null && missionRewards.itemFromFirstChoice !== '') ||
            (missionRewards.unlockedItemIds?.length ?? 0) > 0 ||
            (missionRewards.resourceDelta &&
                Object.keys(missionRewards.resourceDelta).length > 0 &&
                Object.values(missionRewards.resourceDelta).some((v) => v != null && v > 0)) ||
            researchRewards.length > 0);

    const hasCampaignRewards =
        campaignRewards != null && !isCampaignRewardsPayloadEmpty(campaignRewards);

    const resourceDelta = missionRewards?.resourceDelta ?? {};
    const itemId = missionRewards?.itemFromFirstChoice;
    const darknessUpgradeLines = missionRewards?.darknessUpgradeLines ?? [];
    // Core mission rewards: the total minus what each Darkness Upgrade contributed (shown in its own card).
    const coreResourceDelta: Partial<Record<CampaignResourceKey, number>> = { ...resourceDelta };
    for (const line of darknessUpgradeLines) {
        for (const [key, amount] of Object.entries(line.delta) as Array<[CampaignResourceKey, number]>) {
            coreResourceDelta[key] = (coreResourceDelta[key] ?? 0) - amount;
        }
    }
    // Every reward source is a card of the same look: "Mission Rewards" first, then one per Darkness Upgrade.
    const rewardCards: RewardCardData[] = [
        { key: 'mission', title: 'Mission Rewards', Icon: Coins, gains: campaignResourceGains(coreResourceDelta) },
        ...darknessUpgradeLines.map((line) => ({
            key: line.nodeId,
            title: line.title,
            Icon: DARKNESS_UPGRADE_ICON,
            tooltip: getDarknessUpgradeTooltip(line.nodeId),
            gains: campaignResourceGains(line.delta),
        })),
    ].filter((card) => card.gains.length > 0);

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
        <>
                {hasMissionRewards && (
                    <>
                        <h3 className="text-lg font-semibold text-white mb-4">{MISSION_RESULTS_LABEL}</h3>
                        <div className="flex flex-col items-center gap-4 mb-6">
                            {itemId ? (
                                <ItemRewardCard itemId={itemId} caption="From your choice" />
                            ) : null}
                            {(missionRewards?.unlockedItemIds ?? []).map((id) => (
                                <ItemRewardCard key={`unlocked-${id}`} itemId={id} caption="Unlocked" />
                            ))}
                            {rewardCards.length > 0 ? (
                                <div
                                    className="flex w-full flex-wrap justify-center gap-3"
                                    data-testid="reward-cards"
                                >
                                    {rewardCards.map((card) => (
                                        <RewardCard key={card.key} card={card} wide={rewardCards.length > 1} />
                                    ))}
                                </div>
                            ) : null}
                            {researchRewards.length > 0 ? (
                                <div className="w-full space-y-2">
                                    <p className="text-sm text-muted">Research gained:</p>
                                    <div className="flex flex-wrap justify-center gap-3">
                                        {researchRewards.map(({ rewardId, treeId, node }) => (
                                            <ResearchNodeCard
                                                key={rewardId}
                                                variant="display"
                                                tone="muted"
                                                layout="comfortable"
                                                tree={getResearchTree(treeId)}
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
                        <h3 className="text-lg font-semibold text-white mb-4">{CAMPAIGN_RESULTS_LABEL}</h3>
                        <div className="flex flex-col items-center gap-4 mb-6">
                            {campaignItemIds.map((id) => (
                                <ItemRewardCard key={id} itemId={id} />
                            ))}
                            {campaignRewards.locationCardIds.length > 0 ? (
                                <div className="w-full space-y-2">
                                    <p className="text-sm text-muted">Location cards gained:</p>
                                    <div className="flex flex-wrap justify-center gap-3">
                                        {campaignRewards.locationCardIds.map((id) => (
                                            <LocationCardPill
                                                key={`location-card-${id}`}
                                                locationCardId={id}
                                                size="medium"
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : null}
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
                                        {campaignResearchRewards.map(({ rewardId, treeId, node }) => (
                                            <ResearchNodeCard
                                                key={`campaign-${rewardId}`}
                                                variant="display"
                                                tone="muted"
                                                layout="comfortable"
                                                tree={getResearchTree(treeId)}
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
            {showFallback && !hasMissionRewards && !hasCampaignRewards && (
                <p className="text-muted mb-6">You have prevailed.</p>
            )}
        </>
    );
}
