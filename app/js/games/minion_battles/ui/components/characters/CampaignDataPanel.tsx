import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { LobbyClient } from '../../../../../LobbyClient';
import type { AccountState, CampaignState } from '../../../../../types';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { LocationCardInstance } from '../../../storylines/locationCards';
import { withCampaignDarknessStrengthDefaults } from '../../../../../darknessStrength/campaignFields';
import { DarknessStrengthAdminTab } from './DarknessStrengthAdminTab';
import { TestIds } from '../../../../../testing/testIds';
import { CHANGE_CHARACTERS_LABEL } from './CharacterListPullout';
import LocationCardPill from '../LocationCardPill';

type CampaignDataSubTab = 'darknessStrength';

const SUB_TABS: { id: CampaignDataSubTab; label: string }[] = [
    { id: 'darknessStrength', label: 'DarknessStrength' },
];

/** Unique campaign ids for this player: characters first (last-used order), then account ids. */
export function collectPlayerCampaignIds(
    characters: readonly CampaignCharacter[],
    account: AccountState | null | undefined,
): string[] {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const c of characters) {
        const id = c.campaignId?.trim();
        if (id && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
        }
    }
    for (const id of account?.campaignIds ?? []) {
        const trimmed = typeof id === 'string' ? id.trim() : '';
        if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            ids.push(trimmed);
        }
    }
    return ids;
}

export function CampaignDataPanel({
    lobbyClient,
    characters,
    account,
    onChangeCharacters,
}: {
    lobbyClient: LobbyClient;
    characters: CampaignCharacter[];
    account: AccountState | null;
    onChangeCharacters?: () => void;
}) {
    const campaignIds = useMemo(
        () => collectPlayerCampaignIds(characters, account),
        [characters, account],
    );
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
    const [activeSubTab, setActiveSubTab] = useState<CampaignDataSubTab>('darknessStrength');
    const [campaign, setCampaign] = useState<CampaignState | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Default to first character's campaignId (via collect order).
    useEffect(() => {
        if (campaignIds.length === 0) {
            setSelectedCampaignId(null);
            return;
        }
        setSelectedCampaignId((prev) =>
            prev && campaignIds.includes(prev) ? prev : campaignIds[0],
        );
    }, [campaignIds]);

    const loadCampaign = useCallback(async (campaignId: string) => {
        setLoading(true);
        setLoadError(null);
        try {
            const raw = await lobbyClient.getCampaign(campaignId);
            setCampaign(withCampaignDarknessStrengthDefaults(raw));
        } catch (err) {
            console.error('Failed to load campaign for admin Campaign data:', err);
            setCampaign(null);
            setLoadError(err instanceof Error ? err.message : 'Failed to load campaign');
        } finally {
            setLoading(false);
        }
    }, [lobbyClient]);

    useEffect(() => {
        if (!selectedCampaignId) {
            setCampaign(null);
            return;
        }
        void loadCampaign(selectedCampaignId);
    }, [selectedCampaignId, loadCampaign]);

    const handleCampaignUpdated = useCallback((next: CampaignState) => {
        setCampaign(next);
    }, []);

    // Find the first character that has this campaign to access their location deck.
    const characterWithCampaign = useMemo(
        () => characters.find((c) => c.campaignId === selectedCampaignId) ?? null,
        [characters, selectedCampaignId],
    );
    const locationDeckInstances = useMemo(() => {
        if (!characterWithCampaign || !selectedCampaignId) return [];
        const deck = characterWithCampaign.locationDeck?.[selectedCampaignId];
        return Array.isArray(deck) ? (deck as LocationCardInstance[]) : [];
    }, [characterWithCampaign, selectedCampaignId]);

    // Group identical card ids with count.
    const groupedLocationCards = useMemo(() => {
        if (locationDeckInstances.length === 0) return [];
        const countByCardId = new Map<number, { count: number; firstInstance: LocationCardInstance }>();
        for (const inst of locationDeckInstances) {
            const cardId = inst.location_card_id;
            const existing = countByCardId.get(cardId);
            if (existing) {
                existing.count++;
            } else {
                countByCardId.set(cardId, { count: 1, firstInstance: inst });
            }
        }
        // Return as array of [cardId, count, firstInstance] sorted by card id.
        return Array.from(countByCardId.entries())
            .sort(([aId], [bId]) => aId - bId)
            .map(([cardId, { count, firstInstance }]) => ({ cardId, count, firstInstance }));
    }, [locationDeckInstances]);

    return (
        <div
            className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface"
            data-testid={TestIds.campaignDataPanel}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-custom px-4 py-3 shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-white">Campaign data</h2>
                    <p className="text-xs text-muted">
                        Admin tools for this player&apos;s campaign persistence
                    </p>
                    {onChangeCharacters && (
                        <button
                            type="button"
                            data-testid={TestIds.charactersChange}
                            onClick={onChangeCharacters}
                            className="mt-2 rounded-lg border border-border-custom bg-surface-light px-3 py-1.5 text-xs font-medium text-muted hover:text-white hover:border-primary transition-colors cursor-pointer"
                        >
                            {CHANGE_CHARACTERS_LABEL}
                        </button>
                    )}
                </div>
                {campaignIds.length > 1 ? (
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-muted" htmlFor="campaign-data-id-select">
                            Campaign
                        </label>
                        <select
                            id="campaign-data-id-select"
                            value={selectedCampaignId ?? ''}
                            onChange={(e) => setSelectedCampaignId(e.target.value)}
                            className="rounded-md border border-border-custom bg-white px-3 py-2 text-sm text-black"
                            data-testid={TestIds.campaignDataCampaignSelect}
                        >
                            {campaignIds.map((id) => (
                                <option key={id} value={id} className="bg-white text-black">
                                    {id}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : (
                    selectedCampaignId && (
                        <p className="text-xs text-muted font-mono">{selectedCampaignId}</p>
                    )
                )}
            </div>

            <div className="flex gap-1 px-2 pt-2 border-b border-border-custom shrink-0">
                {SUB_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeSubTab === tab.id}
                        className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                            activeSubTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted hover:text-white'
                        }`}
                        onClick={() => setActiveSubTab(tab.id)}
                        data-testid={
                            tab.id === 'darknessStrength'
                                ? TestIds.campaignDataDarknessStrengthTab
                                : undefined
                        }
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {campaignIds.length === 0 && (
                    <div className="flex h-full items-center justify-center p-6 text-sm text-muted">
                        No campaigns found for this player
                    </div>
                )}
                {campaignIds.length > 0 && loading && !campaign && (
                    <div className="flex h-full items-center justify-center p-6 text-sm text-muted">
                        Loading campaign…
                    </div>
                )}
                {loadError && (
                    <div className="p-4 text-sm text-red-300">{loadError}</div>
                )}
                {selectedCampaignId && campaign && activeSubTab === 'darknessStrength' && (
                    <div className="flex-1 min-h-0 overflow-auto">
                        <DarknessStrengthAdminTab
                            lobbyClient={lobbyClient}
                            campaignId={selectedCampaignId}
                            campaign={campaign}
                            onCampaignUpdated={handleCampaignUpdated}
                        />
                    </div>
                )}

                {selectedCampaignId && groupedLocationCards.length > 0 && (
                    <div className="border-t border-border-custom p-4 shrink-0">
                        <h3 className="text-sm font-semibold text-white mb-3">Location Deck</h3>
                        <div className="flex flex-wrap gap-3">
                            {groupedLocationCards.map(({ cardId, count, firstInstance }) => (
                                <LocationCardPill
                                    key={`location-card-${cardId}`}
                                    locationCardId={cardId}
                                    instance={firstInstance}
                                    size="medium"
                                    count={count > 1 ? count : undefined}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
