import React, { useEffect, useMemo, useState } from 'react';
import type { AccountState, CampaignResources } from '../../../../types';
import type { CampaignCharacter } from '../../character_defs/CampaignCharacter';
import type { ResearchTreeDef, Requirement } from '../../../../researchTrees/types';
import {
	canResearchNode,
	computeEffectiveResourcesForTree,
	meetsRequirement,
} from '../../../../researchTrees/evaluator';
import ResourcePill, { campaignResourceGains, RESOURCE_ORDER } from '../../../../components/ResourcePill';
import { getItemDef } from '../../character_defs/items';

function parseHighlightedSegments(text: string): Array<{ text: string; highlighted: boolean }> {
	const segments: Array<{ text: string; highlighted: boolean }> = [];
	const re = /\{([^}]*)\}/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text)) !== null) {
		if (match.index > lastIndex) {
			segments.push({ text: text.slice(lastIndex, match.index), highlighted: false });
		}
		segments.push({ text: match[1], highlighted: true });
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < text.length) {
		segments.push({ text: text.slice(lastIndex), highlighted: false });
	}
	return segments;
}

function accountKnowledgeKeys(requirements: Requirement[]): string[] {
	const keys: string[] = [];
	for (const r of requirements) {
		if (r.type === 'accountKnowledge') keys.push(r.key);
	}
	return keys;
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
}: ResearchTreeListProps) {
	const firstTreeId = availableTrees[0]?.id ?? null;
	const activeTreeId = selectedTreeId ?? firstTreeId;

	return (
		<div className="flex flex-col gap-1 overflow-y-auto">
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
							className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${dimmed ? 'opacity-80 ' : ''
								}${isSelected
									? 'border-primary bg-surface-light text-white'
									: hasPurchases
										? 'border-border-custom bg-surface text-gray-200 hover:bg-surface-light'
										: 'border-border-custom bg-surface text-muted hover:bg-surface-light hover:text-gray-300'
								}`}
						>
							<span className="block truncate">
								{t.title} ({purchasedCount})
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
	/** When true, entire panel is drawn at 50% opacity (tree not normally visible for this character). */
	dimmed?: boolean;
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

export function ResearchTreeContent({
	tree,
	dimmed = false,
	account,
	character,
	equipment,
	researchTrees,
	campaignResources,
	saving,
	canResetResearch,
	onResearchNode,
	onResetResearch,
}: ResearchTreeContentProps) {
	const ctx = useMemo(() => {
		const safeAccount = account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 };
		return {
			account: safeAccount as AccountState,
			character: { ...character, equipment, researchTrees } as CampaignCharacter,
			campaignResources,
		};
	}, [account, campaignResources, character, equipment, researchTrees]);

	const VIEW_W_MIN = 520;
	const VIEW_H_MIN = 400;
	const NODE_W = 180;
	const NODE_H = 92;
	const CANVAS_PAD_X = NODE_W;
	const CANVAS_PAD_Y = NODE_H;
	const resetTreeIds = [tree.id];
	const hasResearchInThisTree = (researchTrees[tree.id] ?? []).length > 0;

	const effective = computeEffectiveResourcesForTree(tree, ctx);
	const researchedSet = new Set(researchTrees[tree.id] ?? []);

	const researchedByTreeId = useMemo(() => {
		const out: Record<string, Set<string>> = {};
		for (const [treeId, nodeIds] of Object.entries(researchTrees)) {
			out[treeId] = new Set(Array.isArray(nodeIds) ? nodeIds : []);
		}
		return out;
	}, [researchTrees]);

	const bounds = tree.nodes.reduce(
		(acc, n) => {
			const { x, y } = n.position;
			return {
				minX: Math.min(acc.minX, x),
				maxX: Math.max(acc.maxX, x),
				minY: Math.min(acc.minY, y),
				maxY: Math.max(acc.maxY, y),
			};
		},
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
							{tree.nodes.flatMap((n) =>
								n.prereqNodeIds.map((p) => {
									const from = tree.nodes.find((x) => x.id === p);
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
							{tree.nodes.flatMap((n) =>
								n.requirements.flatMap((req, reqIndex) => {
									if (req.type !== 'anyResearched') return [];
									return req.nodeIds.map((nodeId) => {
										const from = tree.nodes.find((x) => x.id === nodeId);
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
							{tree.nodes.flatMap((n) =>
								n.exclusiveWithNodeIds.map((ex) => {
									const other = tree.nodes.find((x) => x.id === ex);
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

						{tree.nodes.map((n) => {
							const researched = researchedSet.has(n.id);
							const check = canResearchNode(tree, n.id, ctx);
							const enabled = !researched && check.ok;
							const blocked = !researched && !check.ok;
							const costGains = campaignResourceGains(n.cost);
							const pos = mapPos(n.position);
							const knowledgeKeys = accountKnowledgeKeys(n.requirements);
							const itemReqs = equippedItemRequirementLabels(n.requirements);
							const hasReqBadges = knowledgeKeys.length > 0 || itemReqs.length > 0;
							const hoverTooltip = [
								n.title,
								n.description.replace(/\{([^}]*)\}/g, '$1'),
								n.flavorText ? `Flavor: ${n.flavorText}` : '',
							]
								.filter((line) => line.length > 0)
								.join('\n');
							return (
								<div
									key={n.id}
									className="absolute -translate-x-1/2 -translate-y-1/2"
									style={{ left: pos.x, top: pos.y }}
								>
									<div className="relative">
										{hasReqBadges && (
											<div className="absolute right-full top-0 z-10 flex max-w-[150px] flex-col gap-1 items-end pr-2">
												{knowledgeKeys.map((key) => {
													const req = n.requirements.find(
														(r): r is Extract<Requirement, { type: 'accountKnowledge' }> =>
															r.type === 'accountKnowledge' && r.key === key,
													);
													const satisfied = req ? meetsRequirement(req, ctx, researchedByTreeId) : false;
													return (
														<span
															key={`${n.id}-know-${key}`}
															className={`rounded border border-amber-500/35 bg-amber-950/50 px-1.5 py-px text-[10px] font-medium text-amber-100/95 leading-tight shadow-sm whitespace-nowrap ${satisfied ? 'opacity-45' : 'opacity-100'
																}`}
															title={`Account knowledge: ${key}${satisfied ? ' (met)' : ' (required)'}`}
														>
															{key}
														</span>
													);
												})}
												{itemReqs.map(({ itemId, label }) => {
													const req = n.requirements.find(
														(r): r is Extract<Requirement, { type: 'characterHasEquippedItem' }> =>
															r.type === 'characterHasEquippedItem' && r.itemId === itemId,
													);
													const satisfied = req ? meetsRequirement(req, ctx, researchedByTreeId) : false;
													return (
														<span
															key={`${n.id}-item-${itemId}`}
															className={`max-w-[150px] truncate rounded border border-zinc-500/45 bg-zinc-800/65 px-1.5 py-px text-right text-[10px] font-medium text-zinc-200/95 leading-tight shadow-sm ${satisfied ? 'opacity-45' : 'opacity-100'
																}`}
															title={`Equipped: ${label} (${itemId})${satisfied ? ' (met)' : ' (required)'}`}
														>
															{label}
														</span>
													);
												})}
											</div>
										)}
										<button
											type="button"
											onClick={() => enabled && onResearchNode(tree.id, n.id)}
											className={`relative rounded-lg border px-3 py-2 text-left w-[180px] min-h-[92px] flex flex-col gap-1 ${researched
													? 'bg-green-900 border-green-700 text-white'
													: enabled
														? 'bg-surface-light border-primary text-white hover:bg-surface'
														: blocked
															? 'bg-zinc-800 border-zinc-500 text-zinc-100'
															: 'bg-surface-light border-border-custom text-muted'
												}`}
											disabled={!enabled}
											title={hoverTooltip}
										>
											<div className="text-sm font-semibold truncate">{n.title}</div>
											<div
												className="text-[11px] leading-tight text-gray-300"
												style={{
													display: '-webkit-box',
													WebkitLineClamp: 2,
													WebkitBoxOrient: 'vertical',
													overflow: 'hidden',
												}}
											>
												{parseHighlightedSegments(n.description).map((segment, idx) => (
													<span
														key={`${n.id}-desc-${idx}`}
														className={segment.highlighted ? 'text-amber-300' : 'text-gray-300'}
													>
														{segment.text}
													</span>
												))}
											</div>
											<div className="text-[11px] text-muted flex flex-wrap items-center gap-2">
												{costGains.length > 0 ? (
													costGains.map(({ resource, count }) => (
														<ResourcePill
															key={`${n.id}-${resource}`}
															resource={resource}
															count={count}
															className="text-[11px]"
														/>
													))
												) : (
													<span>Free</span>
												)}
											</div>
										</button>
									</div>
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

