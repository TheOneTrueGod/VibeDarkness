import React, { useMemo } from 'react';
import type { AccountState, CampaignResources } from '../../../types';
import type { CampaignCharacter } from '../character_defs/CampaignCharacter';
import type { ResearchTreeDef } from '../../../researchTrees/types';
import {
    canResearchNode,
    computeEffectiveResourcesForTree,
} from '../../../researchTrees/evaluator';

interface ResearchTreePanelProps {
    availableTrees: ResearchTreeDef[];
    account: AccountState | null;
    character: CampaignCharacter;
    equipment: string[];
    researchTrees: Record<string, string[]>;
    campaignResources: CampaignResources;
    saving: boolean;
    onResearchNode: (treeId: string, nodeId: string) => void;
}

export default function ResearchTreePanel({
    availableTrees,
    account,
    character,
    equipment,
    researchTrees,
    campaignResources,
    saving,
    onResearchNode,
}: ResearchTreePanelProps) {
    const safeAccount = account ?? { id: 0, name: '', role: 'user', fire: 0, water: 0, earth: 0, air: 0 };

    const ctx = useMemo(() => {
        return {
            account: safeAccount as AccountState,
            character: { ...character, equipment, researchTrees } as CampaignCharacter,
            campaignResources,
        };
    }, [campaignResources, character, equipment, researchTrees, safeAccount]);

    const VIEW_W = 520;
    const VIEW_H = 320;
    const NODE_W = 180;
    const NODE_H = 56;
    const PAD_LEFT_RIGHT = NODE_W / 2; // bring leftmost/rightmost in by 1/2 node width
    const PAD_TOP = NODE_H; // push top node down by 1x height
    const PAD_BOTTOM = NODE_H; // pull bottom node up by 1x height
    const FIRST_NODE_X_NUDGE = NODE_W / 2; // extra 50% width to the right

    if (availableTrees.length === 0) {
        return <p className="text-sm text-muted">No research trees available.</p>;
    }

    return (
        <div className="space-y-4">
            {availableTrees.map((tree) => {
                const effective = computeEffectiveResourcesForTree(tree, ctx);
                const researchedSet = new Set(researchTrees[tree.id] ?? []);

                // Rotate the existing coordinate system so progression reads left-to-right.
                // We treat the original y axis (top→bottom) as the new x axis (left→right),
                // and original x axis as the new y axis, normalized into the current view box.
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
                const spanX = Math.max(1, bounds.maxX - bounds.minX);
                const spanY = Math.max(1, bounds.maxY - bounds.minY);
                const innerW = Math.max(1, VIEW_W - PAD_LEFT_RIGHT * 2);
                const innerH = Math.max(1, VIEW_H - PAD_TOP - PAD_BOTTOM);
                const mapPos = (p: { x: number; y: number }) => {
                    const nx = (p.x - bounds.minX) / spanX;
                    const ny = (p.y - bounds.minY) / spanY;
                    const isFirstColumn = Math.abs(p.y - bounds.minY) < 1e-6;
                    return {
                        x: PAD_LEFT_RIGHT + ny * innerW + (isFirstColumn ? FIRST_NODE_X_NUDGE : 0),
                        y: PAD_TOP + nx * innerH,
                    };
                };

                return (
                    <div key={tree.id} className="rounded-lg border border-border-custom bg-surface-light p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-lg font-semibold text-white">{tree.title}</p>
                                <p className="text-xs text-muted">
                                    Effective resources: food {effective.food}, metal {effective.metal}, population {effective.population}, crystals {effective.crystals}
                                </p>
                            </div>
                        </div>

                        <div
                            className="mt-4 relative overflow-auto rounded-lg border border-border-custom bg-surface"
                            style={{ height: 360 }}
                        >
                            <div className="relative" style={{ width: VIEW_W, height: VIEW_H }}>
                                {/* edges */}
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
                                        n.exclusiveWithNodeIds.map((ex) => {
                                            const other = tree.nodes.find((x) => x.id === ex);
                                            if (!other) return null;
                                            // Deduplicate by ordering ids
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

                                {/* nodes */}
                                {tree.nodes.map((n) => {
                                    const researched = researchedSet.has(n.id);
                                    const check = canResearchNode(tree, n.id, ctx);
                                    const enabled = !researched && check.ok;
                                    const cost = n.cost?.crystals ? `${n.cost.crystals} crystals` : 'free';
                                    const pos = mapPos(n.position);
                                    return (
                                        <button
                                            key={n.id}
                                            type="button"
                                            onClick={() => enabled && onResearchNode(tree.id, n.id)}
                                            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-3 py-2 text-left w-[180px] ${
                                                researched
                                                    ? 'bg-green-900 border-green-700 text-white'
                                                    : enabled
                                                      ? 'bg-surface-light border-primary text-white hover:bg-surface'
                                                      : 'bg-surface-light border-border-custom text-muted opacity-80'
                                            }`}
                                            style={{ left: pos.x, top: pos.y }}
                                            disabled={!enabled}
                                            title={researched ? 'Researched' : enabled ? 'Click to research' : check.missing.join(', ')}
                                        >
                                            <div className="text-sm font-semibold truncate">{n.title}</div>
                                            <div className="text-[11px] text-muted">{cost}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}

            {saving && <p className="text-xs text-muted">Saving…</p>}
        </div>
    );
}

