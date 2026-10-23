import React from 'react';
import { DARKNESS_UPGRADE_ICON, DARKNESS_UPGRADES_TREE_ID } from '../../../../../researchTrees/darknessUpgrades';
import { getResearchTree } from '../../../../../researchTrees/list';
import type { DarknessModifiersController } from './useDarknessModifiers';

interface DarknessModifiersModalProps {
    modifiers: DarknessModifiersController;
    onClose: () => void;
}

/** Lets the host select / deselect owned Darkness Upgrades within the mission's min/max. */
export function DarknessModifiersModal({ modifiers, onClose }: DarknessModifiersModalProps) {
    const { ownedNodeIds, selectedNodeIds, limits, check, toggle } = modifiers;
    const nodes = getResearchTree(DARKNESS_UPGRADES_TREE_ID)?.nodes ?? [];
    const selected = new Set(selectedNodeIds);
    const Icon = DARKNESS_UPGRADE_ICON;
    const owned = nodes.filter((n) => ownedNodeIds.includes(n.id));

    const capText = Number.isFinite(limits.max) ? `${limits.max}` : 'any number';
    const minText = Math.min(limits.min, ownedNodeIds.length);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={onClose}
            role="presentation"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Edit Modifiers"
                className="w-full max-w-md rounded-lg border border-border-custom bg-surface p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-bold text-white">Edit Modifiers</h2>
                <p className="mt-1 text-sm text-muted">
                    Selected {selectedNodeIds.length} of {ownedNodeIds.length}. This mission allows{' '}
                    {minText > 0 ? `${minText} to ${capText}` : `up to ${capText}`}.
                </p>
                <ul className="mt-3 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
                    {owned.map((node) => {
                        const isOn = selected.has(node.id);
                        return (
                            <li key={node.id}>
                                <button
                                    type="button"
                                    aria-pressed={isOn}
                                    onClick={() => toggle(node.id)}
                                    className={`flex w-full cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                                        isOn
                                            ? 'border-primary bg-surface-light text-white'
                                            : 'border-border-custom bg-transparent text-muted hover:bg-surface-light'
                                    }`}
                                >
                                    <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium">{node.title}</span>
                                        {node.description && (
                                            <span className="block text-xs text-muted">{node.description}</span>
                                        )}
                                    </span>
                                    <span className="text-xs">{isOn ? 'On' : 'Off'}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {!check.valid && (
                    <p className="mt-3 text-sm text-yellow-400/80" role="alert">{check.reason}</p>
                )}
                <div className="mt-4 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="cursor-pointer rounded-md border border-border-custom bg-surface-light px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-border-custom"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
