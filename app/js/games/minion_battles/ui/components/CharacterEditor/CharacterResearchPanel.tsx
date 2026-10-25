import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { AccountState, CampaignResourceKey, CampaignState } from '../../../../../types';
import type { ResearchTreeDef } from '../../../../../researchTrees/types';
import { ResearchSource } from '../../../../../researchTrees/types';
import type { mergeDarknessUpgradesIntoResearchView } from '../../../../../researchTrees/darknessUpgrades';
import { ResearchTreeContent, ResearchedNodesGrid } from '../ResearchTreePanel';
import ResourcePill, { RESOURCE_ORDER } from '../../../../../components/ResourcePill';
import { RESET_CAMPAIGN_RESOURCES_LABEL } from '../../../../../campaignResources';
import { TestIds } from '../../../../../testing/testIds';

export interface CharacterResearchPanelProps {
    isAdmin: boolean;
    adminPanelsOpen: boolean;
    adminKnowledgePanel?: React.ReactNode;
    resolvedCampaign: CampaignState | null | undefined;
    useGridView: boolean;
    displayResearchTrees: ResearchTreeDef[];
    selectedTree: ResearchTreeDef | undefined;
    selectedTreeDimmed: boolean;
    selectedTreeId: string | null;
    account: AccountState | null | undefined;
    character: CampaignCharacter;
    equipment: string[];
    viewResearch: ReturnType<typeof mergeDarknessUpgradesIntoResearchView>;
    saving: boolean;
    grantResourceKey: CampaignResourceKey;
    onGrantResourceKeyChange: (key: CampaignResourceKey) => void;
    grantResourceAmount: string;
    onGrantResourceAmountChange: (amount: string) => void;
    onGrantResource: () => void | Promise<void>;
    onResetResources: () => void | Promise<void>;
    onResearchNode: (treeId: string, nodeId: string, asAdmin?: boolean) => void | Promise<void>;
    onResetResearch: (treeIds: string[]) => void | Promise<void>;
    onResetResearchBySource: (source: ResearchSource) => void | Promise<void>;
}

/** Upgrades tab right pane: admin grant panels plus the research tree / researched-nodes grid. */
export default function CharacterResearchPanel({
    isAdmin,
    adminPanelsOpen,
    adminKnowledgePanel,
    resolvedCampaign,
    useGridView,
    displayResearchTrees,
    selectedTree,
    selectedTreeDimmed,
    selectedTreeId,
    account,
    character,
    equipment,
    viewResearch,
    saving,
    grantResourceKey,
    onGrantResourceKeyChange,
    grantResourceAmount,
    onGrantResourceAmountChange,
    onGrantResource,
    onResetResources,
    onResearchNode,
    onResetResearch,
    onResetResearchBySource,
}: CharacterResearchPanelProps) {
    return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
        {isAdmin && adminPanelsOpen && (resolvedCampaign?.resources || adminKnowledgePanel) && (
            <div className="mb-4 flex gap-3">
                {resolvedCampaign?.resources && (
                    <div className="flex-1 rounded-lg border border-border-custom bg-surface-light p-3">
                        <p className="text-xs text-muted mb-2">Admin: grant campaign resource</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                className="rounded-md border border-border-custom bg-surface px-2 py-1 text-sm text-white"
                                value={grantResourceKey}
                                onChange={(e) => onGrantResourceKeyChange(e.target.value as CampaignResourceKey)}
                            >
                                {RESOURCE_ORDER.map((resource) => (
                                    <option key={resource} value={resource}>
                                        {resource}
                                    </option>
                                ))}
                            </select>
                            <input
                                className="w-24 rounded-md border border-border-custom bg-surface px-2 py-1 text-sm text-white"
                                value={grantResourceAmount}
                                onChange={(e) => onGrantResourceAmountChange(e.target.value)}
                                inputMode="numeric"
                                placeholder="amount"
                            />
                            <button
                                type="button"
                                onClick={() => void onGrantResource()}
                                className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-secondary hover:bg-primary-hover"
                            >
                                Give
                            </button>
                            <button
                                type="button"
                                data-testid={TestIds.campaignResetResources}
                                onClick={() => void onResetResources()}
                                disabled={saving}
                                title="Restore counts to the sum of mission rewards"
                                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                            >
                                {RESET_CAMPAIGN_RESOURCES_LABEL}
                            </button>
                            <span className="text-xs text-muted flex flex-wrap items-center gap-2">
                                <span>Current:</span>
                                {RESOURCE_ORDER.map((resource) => (
                                    <ResourcePill
                                        key={resource}
                                        resource={resource}
                                        count={resolvedCampaign.resources[resource] ?? 0}
                                        className="text-xs"
                                    />
                                ))}
                            </span>
                        </div>
                    </div>
                )}
                {adminKnowledgePanel && (
                    <div className="flex-1 rounded-lg border border-border-custom bg-surface-light p-3">
                        {adminKnowledgePanel}
                    </div>
                )}
            </div>
        )}
        {isAdmin && !useGridView ? (
            resolvedCampaign?.resources ? (
                displayResearchTrees.length === 0 ? (
                    <p className="text-sm text-muted">No research trees available.</p>
                ) : selectedTree ? (
                    <ResearchTreeContent
                        tree={selectedTree}
                        dimmed={selectedTreeDimmed}
                        account={account ?? null}
                        character={character}
                        equipment={equipment}
                        researchTrees={viewResearch.researchTrees}
                        researchNodeLevels={viewResearch.researchNodeLevels}
                        researchSources={viewResearch.researchSources}
                        campaignResources={resolvedCampaign.resources}
                        saving={saving}
                        canResetResearch={isAdmin}
                        isAdmin={isAdmin}
                        onResearchNode={(treeId, nodeId, asAdmin) => void onResearchNode(treeId, nodeId, asAdmin)}
                        onResetResearch={(treeIds) => void onResetResearch(treeIds)}
                        onResetPurchasedResearch={
                            isAdmin ? () => void onResetResearchBySource(ResearchSource.Purchased) : undefined
                        }
                        onResetAdminResearch={() => void onResetResearchBySource(ResearchSource.Admin)}
                    />
                ) : null
            ) : (
                <p className="text-sm text-muted">Campaign resources not loaded.</p>
            )
        ) : (
            <ResearchedNodesGrid
                availableTrees={displayResearchTrees}
                researchTrees={viewResearch.researchTrees}
                filterTreeId={selectedTreeId}
                showUnowned={isAdmin}
                account={account ?? null}
                character={character}
                equipment={equipment}
                researchNodeLevels={viewResearch.researchNodeLevels}
                researchSources={viewResearch.researchSources}
                campaignResources={resolvedCampaign?.resources}
                onResearchNode={(treeId, nodeId, asAdmin) => void onResearchNode(treeId, nodeId, asAdmin)}
                saving={saving}
                isAdmin={isAdmin}
                onResetPurchasedResearch={
                    isAdmin ? () => void onResetResearchBySource(ResearchSource.Purchased) : undefined
                }
                onResetAdminResearch={
                    isAdmin ? () => void onResetResearchBySource(ResearchSource.Admin) : undefined
                }
            />
        )}
    </div>
    );
}
