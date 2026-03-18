/**
 * Admin-only players panel for mission creation.
 * Lets admins browse lobby players, inspect their characters, and grant/equip items.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayerState, AccountState } from '../../../types';
import { LobbyClient } from '../../../LobbyClient';
import CharacterEditor from './CharacterEditor';
import { fromCampaignCharacterData, type CampaignCharacter } from '../character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../character_defs/campaignCharacterTypes';
import { getPortrait } from '../character_defs/portraits';
import { DEFAULT_PLAYER_INVENTORY, ITEM_ICON_URLS, getItemDef } from '../character_defs/items';

interface AdminPlayersPanelProps {
    lobbyClient: LobbyClient;
    players: Record<string, PlayerState>;
}

function sortPlayers(players: Record<string, PlayerState>): PlayerState[] {
    return Object.values(players).sort((a, b) => {
        if (a.isHost && !b.isHost) return -1;
        if (!a.isHost && b.isHost) return 1;
        return a.name.localeCompare(b.name);
    });
}

function getItemName(itemId: string): string {
    return getItemDef(itemId)?.name ?? itemId;
}

function buildCounts(items: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const itemId of items) {
        counts[itemId] = (counts[itemId] ?? 0) + 1;
    }
    return counts;
}

function PlayerCard({
    player,
    selected,
    onSelect,
}: {
    player: PlayerState;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                selected
                    ? 'border-primary bg-surface-light shadow-[0_0_0_1px_rgba(78,205,196,0.2)]'
                    : 'border-border-custom bg-surface hover:border-primary'
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{player.name}</p>
                    <p className="text-xs text-muted">{player.isHost ? 'Host' : 'Player'}</p>
                </div>
                <div className="w-4 h-4 rounded-full border border-white/40 shrink-0" style={{ backgroundColor: player.color }} />
            </div>
        </button>
    );
}

function CharacterListCard({
    character,
    selected,
    onSelect,
}: {
    character: CampaignCharacter;
    selected: boolean;
    onSelect: () => void;
}) {
    const portrait = getPortrait(character.portraitId);
    const displayName = character.name || portrait?.name || 'Character';
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full rounded-lg border-2 overflow-hidden text-left transition-colors ${
                selected ? 'border-primary bg-surface-light' : 'border-border-custom bg-surface hover:border-primary'
            }`}
        >
            <div className="h-24 bg-background flex items-center justify-center overflow-hidden">
                <div dangerouslySetInnerHTML={{ __html: portrait?.picture ?? '' }} className="w-full h-full" />
            </div>
            <div className="px-3 py-2">
                <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                <p className="text-[11px] text-muted truncate">{character.id}</p>
            </div>
        </button>
    );
}

function ItemCard({
    itemId,
    count,
    onDragStart,
}: {
    itemId: string;
    count: number;
    onDragStart?: (itemId: string, event: React.DragEvent<HTMLDivElement>) => void;
}) {
    const def = getItemDef(itemId);
    const iconUrl = ITEM_ICON_URLS[itemId];
    return (
        <div
            draggable={!!onDragStart}
            onDragStart={onDragStart ? (event) => onDragStart(itemId, event) : undefined}
            className="relative flex flex-col items-center justify-center rounded-lg border border-border-custom bg-surface-light px-3 py-2 min-w-[92px] cursor-grab active:cursor-grabbing"
        >
            {count > 1 && (
                <span className="absolute top-1 right-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-secondary">
                    x{count}
                </span>
            )}
            {iconUrl ? <img src={iconUrl} alt="" className="h-10 w-10 object-contain" /> : <div className="h-10 w-10" />}
            <p className="mt-1 w-full truncate text-center text-[11px] text-gray-200">{def?.name ?? itemId}</p>
        </div>
    );
}

export default function AdminPlayersPanel({ lobbyClient, players }: AdminPlayersPanelProps) {
    const playerList = useMemo(() => sortPlayers(players), [players]);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
    const [details, setDetails] = useState<{
        account: AccountState;
        characters: CampaignCharacter[];
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [grantItemId, setGrantItemId] = useState(DEFAULT_PLAYER_INVENTORY[0] ?? '');

    const loadDetails = useCallback(
        async (playerId: string) => {
            setLoading(true);
            try {
                const res = await lobbyClient.getAdminAccountDetails(playerId);
                setDetails({
                    account: res.account as AccountState,
                    characters: (res.characters as CampaignCharacterData[]).map((data) => fromCampaignCharacterData(data)),
                });
            } catch (error) {
                console.error('Failed to load admin player details:', error);
                setDetails(null);
            } finally {
                setLoading(false);
            }
        },
        [lobbyClient],
    );

    useEffect(() => {
        if (!selectedPlayerId) {
            setDetails(null);
            setSelectedCharacterId(null);
            return;
        }
        void loadDetails(selectedPlayerId);
    }, [loadDetails, selectedPlayerId]);

    useEffect(() => {
        if (!details) {
            setSelectedCharacterId(null);
            return;
        }
        if (details.characters.length === 0) {
            setSelectedCharacterId(null);
            return;
        }
        if (!selectedCharacterId || !details.characters.some((character) => character.id === selectedCharacterId)) {
            setSelectedCharacterId(details.characters[0].id);
        }
    }, [details, selectedCharacterId]);

    const selectedPlayer = selectedPlayerId ? players[selectedPlayerId] ?? null : null;
    const selectedCharacter = useMemo(
        () => details?.characters.find((character) => character.id === selectedCharacterId) ?? null,
        [details, selectedCharacterId],
    );
    const inventoryCounts = useMemo(
        () => buildCounts(details?.account.inventoryItemIds ?? []),
        [details],
    );
    const handleInventoryDragStart = useCallback((itemId: string, event: React.DragEvent<HTMLDivElement>) => {
        event.dataTransfer.setData('text/plain', itemId);
        event.dataTransfer.effectAllowed = 'copy';
    }, []);

    const refreshCurrentPlayer = useCallback(async () => {
        if (!selectedPlayerId) return;
        await loadDetails(selectedPlayerId);
    }, [loadDetails, selectedPlayerId]);

    const handleGrantItem = useCallback(async () => {
        if (!selectedPlayerId || !grantItemId) return;
        try {
            await lobbyClient.grantAccountItem(selectedPlayerId, grantItemId);
            await refreshCurrentPlayer();
        } catch (error) {
            console.error('Failed to grant item:', error);
        }
    }, [grantItemId, lobbyClient, refreshCurrentPlayer, selectedPlayerId]);

    const handleSaved = useCallback(() => {
        void refreshCurrentPlayer();
    }, [refreshCurrentPlayer]);

    if (!selectedPlayerId) {
        return (
            <div className="w-full h-full overflow-auto p-5">
                <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-[32px] font-bold">Players</h2>
                        <p className="text-sm text-muted">Admin overview for lobby members</p>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                        {playerList.map((player) => (
                            <PlayerCard
                                key={player.id}
                                player={player}
                                selected={false}
                                onSelect={() => setSelectedPlayerId(player.id)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-hidden p-5">
            <div className="mx-auto flex h-full max-w-[1600px] min-h-0 flex-col gap-4">
                <div className="flex items-center justify-between gap-3 shrink-0">
                    <div>
                        <h2 className="text-[32px] font-bold">Players</h2>
                        <p className="text-sm text-muted">
                            {selectedPlayer?.name ?? `Player ${selectedPlayerId}`}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSelectedPlayerId(null)}
                        className="rounded-lg border border-border-custom bg-surface-light px-4 py-2 text-sm font-medium text-white hover:bg-border-custom"
                    >
                        Back
                    </button>
                </div>

                <div className="flex items-center gap-3 overflow-x-auto rounded-lg border border-border-custom bg-surface px-4 py-3 shrink-0">
                    <span className="text-sm font-semibold text-muted shrink-0">Items</span>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(inventoryCounts).length > 0 ? (
                            Object.entries(inventoryCounts).map(([itemId, count]) => (
                                <ItemCard
                                    key={itemId}
                                    itemId={itemId}
                                    count={count}
                                    onDragStart={handleInventoryDragStart}
                                />
                            ))
                        ) : (
                            <p className="text-sm text-muted">No items yet</p>
                        )}
                    </div>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <label className="text-xs text-muted">Give item</label>
                        <select
                            value={grantItemId}
                            onChange={(e) => setGrantItemId(e.target.value)}
                            className="rounded-md border border-border-custom bg-dark-700 px-3 py-2 text-sm text-white"
                        >
                            {DEFAULT_PLAYER_INVENTORY.map((itemId) => (
                                <option key={itemId} value={itemId}>
                                    {getItemName(itemId)}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => void handleGrantItem()}
                            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-secondary hover:bg-primary-hover"
                        >
                            Give
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
                    <div className="w-[280px] shrink-0 overflow-auto rounded-lg border border-border-custom bg-surface p-3">
                        <p className="mb-3 text-sm font-semibold text-white">Characters</p>
                        <div className="space-y-3">
                            {loading && <p className="text-sm text-muted">Loading…</p>}
                            {!loading && details?.characters.length === 0 && (
                                <p className="text-sm text-muted">No characters found</p>
                            )}
                            {details?.characters.map((character) => (
                                <CharacterListCard
                                    key={character.id}
                                    character={character}
                                    selected={selectedCharacterId === character.id}
                                    onSelect={() => setSelectedCharacterId(character.id)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 min-w-0 overflow-hidden rounded-lg border border-border-custom bg-surface">
                        {selectedCharacter ? (
                            <CharacterEditor
                                character={selectedCharacter}
                                lobbyClient={lobbyClient}
                                onSaved={handleSaved}
                                onClose={() => {}}
                                editMode
                                inventoryItems={details?.account.inventoryItemIds ?? []}
                                showInventoryPanel={false}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center p-6 text-muted">
                                Select a character to edit it
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
