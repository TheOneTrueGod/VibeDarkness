import React, { useEffect, useMemo, useState } from 'react';
import type { AccountState, CampaignResources } from '../../../../types';
import type { CampaignCharacter } from '../../character_defs/CampaignCharacter';
import {
	isDraftResearchNode,
	MISSION_REWARD_MISSING,
	MISSION_REWARD_REQUIREMENT_LABEL,
	ResearchSource,
	type ResearchTreeDef,
	type ResearchNodeDef,
	type Requirement,
	type ResearchNodeLevels,
	type ResearchNodeSources,
} from '../../../../researchTrees/types';
import {
	canResearchNode,
	computeEffectiveResources,
	computeEffectiveResourcesForTree,
	meetsRequirement,
	selectableResearchNodes,
	type ResearchContext,
} from '../../../../researchTrees/evaluator';
import { getNodeLevel, getNodeMaxLevels } from '../../../../researchTrees/passiveBonuses';
import ResourcePill, { RESOURCE_ORDER } from '../../../../components/ResourcePill';
import ResearchNodeCard, { type ResearchRequirementBadge } from './ResearchNodeCard';
import { getItemDef } from '../../character_defs/items';
import {
	canPurchaseResearchGridEntry,
	collectEligibleResearchGridEntries,
	collectResearchGridEntries,
	collectResearchRequirementEntries,
	ELIGIBLE_RESEARCH_HEADING,
	excludeResearchGridEntries,
	POSSESSED_RESEARCH_HEADING,
	RESEARCH_RESOURCES_HEADING,
	RESET_ADMIN_RESEARCH_LABEL,
	RESET_PURCHASED_RESEARCH_LABEL,
	researchedSetsByTreeId,
	UNOWNED_RESEARCH_HEADING,
} from './researchNodeGrid';
import { TestIds } from '../../../../testing/testIds';
import { hasResearchOfSource } from '../../../../researchTrees/researchSources';

function accountKnowledgeKeys(requirements: Requirement[]): string[] {
	const keys: string[] = [];
	for (const r of requirements) {
		if (r.type === 'accountKnowledge') keys.push(r.key);
	}
	return keys;
}

function crossTreeResearchBadges(
	node: ResearchNodeDef,
	currentTreeId: string,
	allTrees: ResearchTreeDef[],
	researchedByTreeId: Record<string, Set<string>>,
): ResearchRequirementBadge[] {
	const badges: ResearchRequirementBadge[] = [];
	for (const req of node.requirements) {
		if (req.type !== 'anyResearched' || req.treeId === currentTreeId) continue;
		const otherTree = allTrees.find((t) => t.id === req.treeId);
		const nodeLabels = req.nodeIds.map((id) => otherTree?.nodes.find((n) => n.id === id)?.title ?? id);
		const label = nodeLabels.join(' / ');
		const researchedInTree = researchedByTreeId[req.treeId] ?? new Set<string>();
		const satisfied = req.nodeIds.some((id) => researchedInTree.has(id));
		badges.push({
			id: `${node.id}-cross-${req.treeId}-${req.nodeIds.join('-')}`,
			label,
			type: 'knowledge',
			satisfied,
			title: `Requires (${otherTree?.title ?? req.treeId}): ${label}${satisfied ? ' (met)' : ''}`,
		});
	}
	return badges;
}

function equippedItemRequirementLabels(requirements: Requirement[]): { itemId: string; label: string }[] {
	const out: { itemId: string; label: string }[] = [];
	for (const r of requirements) {
		if (r.type === 'characterHasEquippedItem') {
			const def = getItemDef(r.itemId);
			out.push({ itemId: r.itemId, label: def?.name ?? r.itemId });
		}
	}
	return out;
}

function getResearchBlockReason(missing: string[]): string | null {
	const first = missing[0];
	if (!first) return null;
	if (first === 'unknown_node') return 'Unknown research node.';
	if (first === 'exclusive_conflict') return 'Conflicts with another researched node.';
	if (first === 'requirements_not_met') return 'Requirements are not met.';
	if (first === MISSION_REWARD_MISSING) return 'Only available as a mission reward.';
	if (first.startsWith('insufficient_')) {
		const resource = first.replace('insufficient_', '');
		return `Not enough ${resource}.`;
	}
	return 'Cannot be researched yet.';
}

const RESET_BUTTON_CLASS =
	'shrink-0 rounded-md border border-border-custom bg-surface-light px-3 py-1.5 text-xs font-semibold text-white hover:bg-border-custom disabled:opacity-60';

function ResearchResetButtons({
	saving,
	researchTrees,
	researchNodeLevels,
	researchSources,
	onResetPurchasedResearch,
	onResetAdminResearch,
}: {
	saving: boolean;
	researchTrees: Record<string, string[]>;
	researchNodeLevels?: ResearchNodeLevels;
	researchSources?: ResearchNodeSources;
	onResetPurchasedResearch?: () => void;
	onResetAdminResearch?: () => void;
}) {
	if (!onResetPurchasedResearch && !onResetAdminResearch) return null;
	const canResetPurchased = hasResearchOfSource(
		researchTrees,
		researchNodeLevels,
		researchSources,
		ResearchSource.Purchased,
	);
	const canResetAdmin = hasResearchOfSource(
		researchTrees,
		researchNodeLevels,
		researchSources,
		ResearchSource.Admin,
	);
	return (
		<div className="flex flex-wrap items-center gap-2">
			{onResetPurchasedResearch && (
				<button
					type="button"
					onClick={onResetPurchasedResearch}
					disabled={saving || !canResetPurchased}
					data-testid={TestIds.researchResetPurchased}
					className={RESET_BUTTON_CLASS}
				>
					{RESET_PURCHASED_RESEARCH_LABEL}
				</button>
			)}
			{onResetAdminResearch && (
				<button
					type="button"
					onClick={onResetAdminResearch}
					disabled={saving || !canResetAdmin}
					data-testid={TestIds.researchResetAdmin}
					className={RESET_BUTTON_CLASS}
				>
					{RESET_ADMIN_RESEARCH_LABEL}
				</button>
			)}
		</div>
	);
}

interface ResearchTreePanelProps {
	availableTrees: ResearchTreeDef[];
	account: AccountState | null;
	character: CampaignCharacter;
	equipment: string[];
	researchTrees: Record<string, string[]>;
	campaignResources: CampaignResources;
	saving: boolean;
	canResetResearch: boolean;
	onResearchNode: (treeId: string, nodeId: string) => void;
	onResetResearch: (treeIds: string[]) => void;
}

/** Scrollable list of research trees for sidebar use. */
export interface ResearchTreeListProps {
	availableTrees: ResearchTreeDef[];
	/** When set (e.g. debug “show all”), these tree rows render at 50% opacity — not normally visible for this character. */
	dimmedTreeIds?: ReadonlySet<string>;
	selectedTreeId: string | null;
	onSelectTree: (treeId: string) => void;
	researchTrees: Record<string, string[]>;
	/** When true, each tree row can show Reset for trees that have researched nodes (admin tooling). */
	canResetResearch?: boolean;
	resetSaving?: boolean;
	onResetResearchTree?: (treeId: string) => void;
	/** When true, prepends an “All” button; selectedTreeId=null means “All” is active. */
	showAllOption?: boolean;
	/** Called when the “All” button is clicked (only relevant when showAllOption=true). */
	onSelectAll?: () => void;
}

export function ResearchTreeList({
	availableTrees,
	dimmedTreeIds,
	selectedTreeId,
	onSelectTree,
	researchTrees,
	canResetResearch = false,
	resetSaving = false,
	onResetResearchTree,
	showAllOption = false,
	onSelectAll,
}: ResearchTreeListProps) {
	const firstTreeId = availableTrees[0]?.id ?? null;
	const activeTreeId = showAllOption ? selectedTreeId : (selectedTreeId ?? firstTreeId);

	return (
		<div className="flex flex-col gap-1 overflow-y-auto">
			{showAllOption && (
				<button
					type="button"
					onClick={() => onSelectAll?.()}
					className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
						activeTreeId === null
							? 'border-primary bg-surface-light text-white'
							: 'border-border-custom bg-surface text-gray-200 hover:bg-surface-light'
					}`}
				>
					All
				</button>
			)}
			{availableTrees.map((t) => {
				const purchasedCount = (researchTrees[t.id] ?? []).length;
				const isSelected = t.id === activeTreeId;
				const hasPurchases = purchasedCount >= 1;
				const dimmed = dimmedTreeIds?.has(t.id) ?? false;
				const showRowReset =
					canResetResearch && hasPurchases && typeof onResetResearchTree === 'function';
				return (
					<div key={t.id} className="flex gap-1 items-stretch shrink-0 min-w-0">
						<button
							type="button"
							onClick={() => onSelectTree(t.id)}
							style={{ borderColor: t.colour }}
							className={`min-w-0 flex-1 rounded-lg border-2 px-3 py-2 text-left text-sm font-medium transition-colors ${dimmed ? 'opacity-80 ' : ''
								}${isSelected
									? 'bg-surface-light text-white'
									: hasPurchases
										? 'bg-surface text-gray-200 hover:bg-surface-light'
										: 'bg-surface text-muted hover:bg-surface-light hover:text-gray-300'
								}`}
						>
							<span className="flex min-w-0 items-center gap-2">
								<img
									src={t.icon}
									alt=""
									data-testid={TestIds.researchTreeListIcon}
									title={t.title}
									className="h-4 w-4 shrink-0 rounded-sm object-cover"
								/>
								<span className="truncate">
									{t.title} ({purchasedCount})
								</span>
							</span>
						</button>
						{showRowReset && (
							<button
								type="button"
								onClick={() => onResetResearchTree(t.id)}
								disabled={resetSaving}
								title={`Reset research in “${t.title}”`}
								aria-label={`Reset research in ${t.title}`}
								className="shrink-0 rounded-lg border border-border-custom bg-surface-light px-2 py-2 text-xs font-semibold text-white hover:bg-border-custom disabled:opacity-60"
							>
								Reset
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}

/** Main content area for a selected research tree. */
export interface ResearchTreeContentProps {
	tree: ResearchTreeDef;
	/** All available trees — used to look up cross-tree node refs. */
	allTrees?: ResearchTreeDef[];
	/** When true, entire panel is drawn at 50% opacity (tree not normally visible for this character). */
	dimmed?: boolean;
	account: AccountState | null;
	character: CampaignCharacter;
	equipment: string[];
	researchTrees: Record<string, string[]>;
	/** Per-tree node level counts for multi-level passive nodes. */
	researchNodeLevels?: ResearchNodeLevels;
	researchSources?: ResearchNodeSources;
	campaignResources: CampaignResources;
	saving: boolean;
	canResetResearch: boolean;
	/** When true, resource cost checks are skipped — node is enabled even if resources are insufficient. */
	isAdmin?: boolean;
	onResearchNode: (treeId: string, nodeId: string) => void;
	onResetResearch: (treeIds: string[]) => void;
	onResetPurchasedResearch?: () => void;
	onResetAdminResearch?: () => void;
}

export function ResearchTreeContent({
	tree,
	allTrees = [],
	dimmed = false,
	account,
	character,
	equipment,
	researchTrees,
	researchNodeLevels,
	researchSources,
	campaignResources,
	saving,
	canResetResearch,
	isAdmin = false,
	onResearchNode,
	onResetResearch,
	onResetPurchasedResearch,
	onResetAdminResearch,
}: ResearchTreeContentProps) {
	const ctx = useMemo(() => {
		const safeAccount = account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 };
		return {
			account: safeAccount as AccountState,
			character: { ...character, equipment, researchTrees, researchNodeLevels, researchSources } as CampaignCharacter,
			campaignResources,
		};
	}, [account, campaignResources, character, equipment, researchTrees, researchNodeLevels, researchSources]);

	const VIEW_W_MIN = 520;
	const VIEW_H_MIN = 400;
	const NODE_W = 180;
	const NODE_H = 92;
	const CANVAS_PAD_X = NODE_W;
	const CANVAS_PAD_Y = NODE_H;
	const resetTreeIds = [tree.id];
	const hasResearchInThisTree = (researchTrees[tree.id] ?? []).length > 0;

	const effective = computeEffectiveResourcesForTree(tree, ctx);
	const researchedByTreeId = useMemo(() => {
		const out: Record<string, Set<string>> = {};
		for (const [treeId, nodeIds] of Object.entries(researchTrees)) {
			out[treeId] = new Set(Array.isArray(nodeIds) ? nodeIds : []);
		}
		return out;
	}, [researchTrees]);

	const nodes = useMemo(() => selectableResearchNodes(tree), [tree]);
	const crossTreeRefs = useMemo(
		() =>
			(tree.crossTreeNodeRefs ?? []).filter((ref) => {
				const other = allTrees.find((t) => t.id === ref.fromTreeId);
				const node = other?.nodes.find((n) => n.id === ref.nodeId);
				return node != null && !isDraftResearchNode(node);
			}),
		[tree, allTrees],
	);

	const allPositions = [
		...nodes.map((n) => n.position),
		...crossTreeRefs.map((ref) => ref.position),
	];
	const bounds = allPositions.reduce(
		(acc, { x, y }) => ({
			minX: Math.min(acc.minX, x),
			maxX: Math.max(acc.maxX, x),
			minY: Math.min(acc.minY, y),
			maxY: Math.max(acc.maxY, y),
		}),
		{ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
	);
	const VIEW_W = Math.max(VIEW_W_MIN, bounds.maxX + CANVAS_PAD_X);
	const VIEW_H = Math.max(VIEW_H_MIN, bounds.maxY + CANVAS_PAD_Y);
	const mapPos = (p: { x: number; y: number }) => {
		return {
			x: p.x,
			y: p.y,
		};
	};

	return (
		<div className={`space-y-4 ${dimmed ? 'opacity-75' : ''}`}>
			<div className="rounded-lg border border-border-custom bg-surface-light p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="flex flex-col items-start gap-2">
						<p className="text-lg font-semibold text-white">{tree.title}</p>
						<div className="flex flex-wrap items-center gap-2 text-xs text-muted">
							<span>Effective resources:</span>
							<div className="flex flex-wrap items-center gap-2">
								{RESOURCE_ORDER.map((resource) => (
									<ResourcePill
										key={resource}
										resource={resource}
										count={effective[resource]}
										className="text-xs"
									/>
								))}
							</div>
							<ResearchResetButtons
								saving={saving}
								researchTrees={researchTrees}
								researchNodeLevels={researchNodeLevels}
								researchSources={researchSources}
								onResetPurchasedResearch={onResetPurchasedResearch}
								onResetAdminResearch={onResetAdminResearch}
							/>
						</div>
					</div>

					{canResetResearch && hasResearchInThisTree && (
						<button
							type="button"
							onClick={() => onResetResearch(resetTreeIds)}
							disabled={saving}
							className="rounded-md bg-surface-light border border-border-custom px-3 py-1.5 text-sm font-semibold text-white hover:bg-border-custom disabled:opacity-60 mt-0.5"
							title={`Un-research all nodes in “${tree.title}”`}
						>
							Reset research
						</button>
					)}
				</div>

				<div
					className="mt-4 relative overflow-auto rounded-lg border border-border-custom bg-surface"
					style={{ height: 440 }}
				>
					<div className="relative" style={{ width: VIEW_W, height: VIEW_H }}>
						<svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
							{nodes.flatMap((n) =>
								n.prereqNodeIds.map((p) => {
									const from = nodes.find((x) => x.id === p);
									if (!from) return null;
									const a = mapPos(from.position);
									const b = mapPos(n.position);
									return (
										<line
											key={`p:${p}->${n.id}`}
											x1={a.x}
											y1={a.y}
											x2={b.x}
											y2={b.y}
											stroke="rgba(255,255,255,0.25)"
											strokeWidth="2"
										/>
									);
								}),
							)}
							{nodes.flatMap((n) =>
								n.requirements.flatMap((req, reqIndex) => {
									if (req.type !== 'anyResearched') return [];
									return req.nodeIds.map((nodeId) => {
										const from = nodes.find((x) => x.id === nodeId);
										if (!from) return null;
										const a = mapPos(from.position);
										const b = mapPos(n.position);
										return (
											<line
												key={`o:${n.id}:${reqIndex}:${nodeId}`}
												x1={a.x}
												y1={a.y}
												x2={b.x}
												y2={b.y}
												stroke="rgba(255,255,255,0.25)"
												strokeWidth="2"
											/>
										);
									});
								}),
							)}
							{nodes.flatMap((n) =>
								n.exclusiveWithNodeIds.map((ex) => {
									const other = nodes.find((x) => x.id === ex);
									if (!other) return null;
									if (n.id > other.id) return null;
									const a = mapPos(n.position);
									const b = mapPos(other.position);
									return (
										<line
											key={`x:${n.id}<->${ex}`}
											x1={a.x}
											y1={a.y}
											x2={b.x}
											y2={b.y}
											stroke="rgba(239,68,68,0.75)"
											strokeWidth="2"
											strokeDasharray="6 6"
										/>
									);
								}),
							)}
						</svg>

						{nodes.map((n) => {
							const currentLevel = getNodeLevel(tree.id, n.id, researchTrees, researchNodeLevels);
							const maxLevels = getNodeMaxLevels(n);
							const atMax = currentLevel >= maxLevels;
							const check = canResearchNode(tree, n.id, ctx, {
								skipCostCheck: isAdmin,
								skipMissionRewardCheck: isAdmin,
							});
							const enabled = !atMax && check.ok;
							const blocked = !atMax && !check.ok;
							const pos = mapPos(n.position);
							const knowledgeKeys = accountKnowledgeKeys(n.requirements);
							const itemReqs = equippedItemRequirementLabels(n.requirements);
							const selectionReason = atMax
								? maxLevels > 1
									? `Fully researched (Lv ${currentLevel}/${maxLevels}).`
									: 'Already researched.'
								: blocked
									? getResearchBlockReason(check.missing)
									: currentLevel > 0
										? `Lv ${currentLevel}/${maxLevels} — click to upgrade.`
										: null;
							const requirementBadges: ResearchRequirementBadge[] = [
								...knowledgeKeys.map((key) => {
									const req = n.requirements.find(
										(r): r is Extract<Requirement, { type: 'accountKnowledge' }> =>
											r.type === 'accountKnowledge' && r.key === key,
									);
									const satisfied = req ? meetsRequirement(req, ctx, researchedByTreeId) : false;
									return {
										id: `${n.id}-know-${key}`,
										label: key,
										type: 'knowledge' as const,
										satisfied,
										title: `Account knowledge: ${key}${satisfied ? ' (met)' : ' (required)'}`,
									};
								}),
								...itemReqs.map(({ itemId, label }) => {
									const req = n.requirements.find(
										(r): r is Extract<Requirement, { type: 'characterHasEquippedItem' }> =>
											r.type === 'characterHasEquippedItem' && r.itemId === itemId,
									);
									const satisfied = req ? meetsRequirement(req, ctx, researchedByTreeId) : false;
									return {
										id: `${n.id}-item-${itemId}`,
										label,
										type: 'item' as const,
										satisfied,
										title: `Equipped: ${label} (${itemId})${satisfied ? ' (met)' : ' (required)'}`,
									};
								}),
								...n.requirements
									.filter((req): req is Extract<Requirement, { type: 'missionReward' }> => req.type === 'missionReward')
									.map((_, index) => ({
										id: `${n.id}-mission-reward-${index}`,
										label: MISSION_REWARD_REQUIREMENT_LABEL,
										type: 'missionReward' as const,
										satisfied: atMax || isAdmin,
										title: atMax || isAdmin
											? `${MISSION_REWARD_REQUIREMENT_LABEL} (met)`
											: 'Only available as a mission reward',
									})),
								...crossTreeResearchBadges(n, tree.id, allTrees, researchedByTreeId),
							];
							return (
								<div
									key={n.id}
									className="absolute -translate-x-1/2 -translate-y-1/2"
									style={{ left: pos.x, top: pos.y }}
								>
									<ResearchNodeCard
										tree={tree}
										node={n}
										variant="interactive"
										state={atMax ? 'researched' : enabled ? 'enabled' : blocked ? 'blocked' : 'default'}
										currentLevel={currentLevel}
										maxLevels={maxLevels}
										showCost
										showRequirements
										showTier
										onClick={() => enabled && onResearchNode(tree.id, n.id)}
										selectionReason={selectionReason}
										requirementBadges={requirementBadges}
									/>
								</div>
							);
						})}
						{crossTreeRefs.map((ref) => {
							const fromTree = allTrees.find((t) => t.id === ref.fromTreeId);
							const node = fromTree?.nodes.find((n) => n.id === ref.nodeId);
							if (!fromTree || !node) return null;
							const currentLevel = getNodeLevel(ref.fromTreeId, ref.nodeId, researchTrees, researchNodeLevels);
							const maxLevels = getNodeMaxLevels(node);
							const atMax = currentLevel >= maxLevels;
							const check = canResearchNode(fromTree, ref.nodeId, ctx, {
								skipCostCheck: isAdmin,
								skipMissionRewardCheck: isAdmin,
							});
							const enabled = !atMax && check.ok;
							const blocked = !atMax && !check.ok;
							const pos = mapPos(ref.position);
							const selectionReason = atMax
								? maxLevels > 1
									? `Fully researched (Lv ${currentLevel}/${maxLevels}).`
									: 'Already researched.'
								: blocked
									? getResearchBlockReason(check.missing)
									: currentLevel > 0
										? `Lv ${currentLevel}/${maxLevels} — click to upgrade.`
										: null;
							return (
								<div
									key={`cross:${ref.fromTreeId}:${ref.nodeId}`}
									className="absolute -translate-x-1/2 -translate-y-1/2"
									style={{ left: pos.x, top: pos.y }}
								>
									<ResearchNodeCard
										tree={fromTree}
										node={node}
										variant="interactive"
										state={atMax ? 'researched' : enabled ? 'enabled' : blocked ? 'blocked' : 'default'}
										currentLevel={currentLevel}
										maxLevels={maxLevels}
										showCost
										showRequirements
										showTier
										onClick={() => enabled && onResearchNode(ref.fromTreeId, ref.nodeId)}
										selectionReason={selectionReason}
										requirementBadges={[]}
									/>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{saving && <p className="text-xs text-muted">Saving…</p>}
		</div>
	);
}

export interface ResearchedNodesGridProps {
	availableTrees: ResearchTreeDef[];
	researchTrees: Record<string, string[]>;
	/** When set, only nodes from this tree are shown. When null, all trees are shown. */
	filterTreeId: string | null;
	/** When true, list unowned selectable nodes below possessed ones (admin Upgrades). */
	showUnowned?: boolean;
	account: AccountState | null;
	character: CampaignCharacter;
	equipment: string[];
	researchNodeLevels?: ResearchNodeLevels;
	researchSources?: ResearchNodeSources;
	campaignResources?: CampaignResources;
	onResearchNode?: (treeId: string, nodeId: string) => void;
	saving?: boolean;
	isAdmin?: boolean;
	onResetPurchasedResearch?: () => void;
	onResetAdminResearch?: () => void;
}

const EMPTY_CAMPAIGN_RESOURCES: CampaignResources = {
	food: 0,
	metal: 0,
	population: 0,
	crystals: 0,
	exhaustion: 0,
};

function ResearchGridCards({
	entries,
	researchedByTreeId,
	state,
	researchTrees,
	researchNodeLevels,
	researchCtx,
	onResearchNode,
	skipCostCheck = false,
}: {
	entries: ReturnType<typeof collectResearchGridEntries>;
	researchedByTreeId: Record<string, Set<string>>;
	state: 'researched' | 'blocked' | 'enabled';
	researchTrees: Record<string, string[]>;
	researchNodeLevels?: ResearchNodeLevels;
	researchCtx: ResearchContext;
	onResearchNode?: (treeId: string, nodeId: string) => void;
	skipCostCheck?: boolean;
}) {
	return (
		<div className="flex flex-wrap gap-3">
			{entries.map(({ tree, node }) => {
				const purchasable =
					onResearchNode != null &&
					canPurchaseResearchGridEntry({ tree, node }, researchCtx, {
						skipCostCheck,
						skipMissionRewardCheck: skipCostCheck,
					});
				return (
					<ResearchNodeCard
						key={`${tree.id}:${node.id}`}
						tree={tree}
						node={node}
						variant={purchasable ? 'interactive' : 'display'}
						state={purchasable ? 'enabled' : state}
						layout="comfortable"
						showCost
						showRequirements={false}
						showPrereqRow
						currentLevel={getNodeLevel(tree.id, node.id, researchTrees, researchNodeLevels)}
						maxLevels={getNodeMaxLevels(node)}
						onClick={purchasable ? () => onResearchNode(tree.id, node.id) : undefined}
						researchRequirementEntries={collectResearchRequirementEntries(
							node,
							tree,
							researchedByTreeId,
						)}
					/>
				);
			})}
		</div>
	);
}

/** Shared Upgrades grid of research nodes; purchasable cards click to research. */
export function ResearchedNodesGrid({
	availableTrees,
	researchTrees,
	filterTreeId,
	showUnowned = false,
	account,
	character,
	equipment,
	researchNodeLevels,
	researchSources,
	campaignResources,
	onResearchNode,
	saving = false,
	isAdmin = false,
	onResetPurchasedResearch,
	onResetAdminResearch,
}: ResearchedNodesGridProps) {
	const researchedByTreeId = useMemo(() => researchedSetsByTreeId(researchTrees), [researchTrees]);
	const researchCtx = useMemo((): ResearchContext => {
		const safeAccount = account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 };
		return {
			account: safeAccount as AccountState,
			character: { ...character, equipment, researchTrees, researchNodeLevels, researchSources } as CampaignCharacter,
			campaignResources: campaignResources ?? EMPTY_CAMPAIGN_RESOURCES,
		};
	}, [account, campaignResources, character, equipment, researchNodeLevels, researchSources, researchTrees]);
	const eligible = useMemo(
		() => collectEligibleResearchGridEntries(availableTrees, filterTreeId, researchCtx),
		[availableTrees, filterTreeId, researchCtx],
	);
	const possessed = useMemo(
		() => collectResearchGridEntries(availableTrees, researchTrees, filterTreeId, true),
		[availableTrees, filterTreeId, researchTrees],
	);
	const unowned = useMemo(() => {
		if (!showUnowned) return [];
		const allUnowned = collectResearchGridEntries(availableTrees, researchTrees, filterTreeId, false);
		return excludeResearchGridEntries(allUnowned, eligible);
	}, [availableTrees, eligible, filterTreeId, researchTrees, showUnowned]);
	const effectiveResources = useMemo(() => computeEffectiveResources(researchCtx), [researchCtx]);
	const hasCards = eligible.length > 0 || possessed.length > 0 || unowned.length > 0;

	return (
		<div className="space-y-6" data-testid={TestIds.researchNodesGrid}>
			<div data-testid={TestIds.researchGridResources}>
				<p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
					{RESEARCH_RESOURCES_HEADING}
				</p>
				<div className="flex flex-wrap items-center gap-2">
					{RESOURCE_ORDER.map((resource) => (
						<ResourcePill
							key={resource}
							resource={resource}
							count={effectiveResources[resource]}
							className="text-xs"
						/>
					))}
					<ResearchResetButtons
						saving={saving}
						researchTrees={researchTrees}
						researchNodeLevels={researchNodeLevels}
						researchSources={researchSources}
						onResetPurchasedResearch={onResetPurchasedResearch}
						onResetAdminResearch={onResetAdminResearch}
					/>
				</div>
			</div>
			{!hasCards && <p className="text-sm text-muted">No research unlocked yet.</p>}
			{eligible.length > 0 && (
				<div data-testid={TestIds.researchEligibleSection}>
					<p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
						{ELIGIBLE_RESEARCH_HEADING}
					</p>
					<ResearchGridCards
						entries={eligible}
						researchedByTreeId={researchedByTreeId}
						state="enabled"
						researchTrees={researchTrees}
						researchNodeLevels={researchNodeLevels}
						researchCtx={researchCtx}
						onResearchNode={onResearchNode}
						skipCostCheck={isAdmin}
					/>
				</div>
			)}
			{possessed.length > 0 && (
				<div data-testid={TestIds.researchPossessedSection}>
					<p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
						{POSSESSED_RESEARCH_HEADING}
					</p>
					<ResearchGridCards
						entries={possessed}
						researchedByTreeId={researchedByTreeId}
						state="researched"
						researchTrees={researchTrees}
						researchNodeLevels={researchNodeLevels}
						researchCtx={researchCtx}
						onResearchNode={onResearchNode}
						skipCostCheck={isAdmin}
					/>
				</div>
			)}
			{showUnowned && unowned.length > 0 && (
				<div className="border-t border-border-custom pt-4" data-testid={TestIds.researchUnownedSection}>
					<p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
						{UNOWNED_RESEARCH_HEADING}
					</p>
					<ResearchGridCards
						entries={unowned}
						researchedByTreeId={researchedByTreeId}
						state="blocked"
						researchTrees={researchTrees}
						researchNodeLevels={researchNodeLevels}
						researchCtx={researchCtx}
						onResearchNode={onResearchNode}
						skipCostCheck={isAdmin}
					/>
				</div>
			)}
		</div>
	);
}

export default function ResearchTreePanel({
	availableTrees,
	account,
	character,
	equipment,
	researchTrees,
	campaignResources,
	saving,
	canResetResearch,
	onResearchNode,
	onResetResearch,
}: ResearchTreePanelProps) {
	const [selectedTreeId, setSelectedTreeId] = useState<string | null>(availableTrees[0]?.id ?? null);
	const firstTreeId = availableTrees[0]?.id ?? null;

	useEffect(() => {
		const isSelectedStillAvailable = selectedTreeId != null && availableTrees.some((t) => t.id === selectedTreeId);
		if (!isSelectedStillAvailable) {
			setSelectedTreeId(firstTreeId);
		}
	}, [availableTrees, firstTreeId, selectedTreeId]);

	const tree = availableTrees.find((t) => t.id === (selectedTreeId ?? firstTreeId));

	if (availableTrees.length === 0) {
		return <p className="text-sm text-muted">No research trees available.</p>;
	}

	return (
		<div className="space-y-4">
			<div className="flex gap-4">
				<div className="flex flex-col gap-1 min-w-[160px] shrink-0">
					<ResearchTreeList
						availableTrees={availableTrees}
						selectedTreeId={selectedTreeId}
						onSelectTree={(id) => setSelectedTreeId(id)}
						researchTrees={researchTrees}
						canResetResearch={canResetResearch}
						resetSaving={saving}
						onResetResearchTree={(treeId) => onResetResearch([treeId])}
					/>
				</div>
				<div className="flex-1 min-w-0">
					{tree && (
						<ResearchTreeContent
							tree={tree}
							allTrees={availableTrees}
							account={account}
							character={character}
							equipment={equipment}
							researchTrees={researchTrees}
							campaignResources={campaignResources}
							saving={saving}
							canResetResearch={canResetResearch}
							onResearchNode={onResearchNode}
							onResetResearch={onResetResearch}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

