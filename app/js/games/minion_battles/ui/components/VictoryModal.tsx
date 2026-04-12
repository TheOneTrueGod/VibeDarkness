/**
 * Victory modal - shows mission victory with optional rewards.
 */
import React from 'react';
import { getItemDef, ITEM_ICON_URLS } from '../../character_defs/items';
import type { CampaignResourceKey } from '../../../../types';
import ResourcePill, { campaignResourceGains } from '../../../../components/ResourcePill';

interface VictoryModalProps {
    missionRewards: {
        resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
        itemFromFirstChoice?: string;
    } | null;
    onClose: () => void;
}

export default function VictoryModal({ missionRewards, onClose }: VictoryModalProps) {
    const hasRewards =
        missionRewards &&
        ((missionRewards.itemFromFirstChoice != null && missionRewards.itemFromFirstChoice !== '') ||
            (missionRewards.resourceDelta &&
                Object.keys(missionRewards.resourceDelta).length > 0 &&
                Object.values(missionRewards.resourceDelta).some((v) => v != null && v > 0)));

    const resourceDelta = missionRewards?.resourceDelta ?? {};
    const itemId = missionRewards?.itemFromFirstChoice;
    const itemDef = itemId ? getItemDef(itemId) : null;
    const itemIconUrl = itemId ? ITEM_ICON_URLS[itemId] : null;
    const gainedResources = campaignResourceGains(resourceDelta as Partial<Record<CampaignResourceKey, number>>);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-surface-light border border-border-custom rounded-lg shadow-xl p-10 mx-4 text-center min-h-[33vh] min-w-[33vw] w-[33vw] flex flex-col justify-center">
                <h2 className="text-2xl font-bold text-success mb-2">Victory!</h2>
                {hasRewards && (
                    <>
                        <h3 className="text-lg font-semibold text-white mb-4">Rewards</h3>
                        <div className="flex flex-col items-center gap-4 mb-6">
                            {itemDef && itemIconUrl && (
                                <div className="flex flex-col items-center gap-1">
                                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-primary bg-surface px-4 py-3 min-w-[100px]">
                                        <img
                                            src={itemIconUrl}
                                            alt=""
                                            className="h-12 w-12 object-contain"
                                            aria-hidden
                                        />
                                        <p className="mt-2 text-sm font-medium text-white">
                                            {itemDef.name}
                                        </p>
                                    </div>
                                    <span className="text-xs text-muted">From your choice</span>
                                </div>
                            )}
                            {gainedResources.length > 0 ? (
                                <div className="flex flex-wrap justify-center gap-3">
                                    {gainedResources.map(({ resource, count }) => (
                                        <ResourcePill key={resource} resource={resource} count={count} />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </>
                )}
                {!hasRewards && <p className="text-muted mb-6">You have prevailed.</p>}
                <div className="flex justify-center">
                    <button
                        type="button"
                        className="px-6 py-2 bg-primary hover:bg-primary-hover text-secondary font-medium rounded transition-colors"
                        onClick={onClose}
                    >
                        Continue
                    </button>
                </div>
            </div>
        </div>
    );
}
