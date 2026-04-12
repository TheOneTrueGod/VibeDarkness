/**
 * Admin-only Players panel on the campaign home screen.
 * Lets admins browse ALL accounts, inspect their characters, and grant/equip items.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccountState } from '../types';
import { LobbyClient } from '../LobbyClient';
import CharacterEditor from '../games/minion_battles/ui/components/CharacterEditor/CharacterEditor';
import { MinionBattlesApi } from '../games/minion_battles/api/minionBattlesApi';
import { fromCampaignCharacterData, type CampaignCharacter } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../games/minion_battles/character_defs/campaignCharacterTypes';
import { getPortrait } from '../games/minion_battles/character_defs/portraits';
import { ALL_PLAYER_ITEMS, ITEM_ICON_URLS, getItemDef } from '../games/minion_battles/character_defs/items';
import { useUser } from '../contexts/UserContext';

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

function AccountCard({
    account,
    selected,
    onSelect,
}: {
    account: AccountState;
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
                    <p className="font-semibold text-white truncate">{account.name}</p>
                    <p className="text-xs text-muted">{account.role === 'admin' ? 'Admin' : 'Player'}</p>
                </div>
                <div className="rounded-md border border-border-custom bg-dark-700 px-2 py-1 text-xs text-muted shrink-0">
                    #{account.id}
                </div>
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
    onRemove,
}: {
    itemId: string;
    count: number;
    onDragStart?: (itemId: string, event: React.DragEvent<HTMLDivElement>) => void;
    onRemove?: (itemId: string) => void;
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
            {onRemove && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove(itemId);
                    }}
                    className="absolute top-1 left-1 h-5 w-5 rounded-full border border-border-custom bg-surface text-white text-[12px] leading-[18px] flex items-center justify-center hover:border-danger hover:text-danger"
                    title="Remove one"
                    aria-label="Remove one"
                >
                    −
                </button>
            )}
            {iconUrl ? <img src={iconUrl} alt="" className="h-10 w-10 object-contain" /> : <div className="h-10 w-10" />}
            <p className="mt-1 w-full truncate text-center text-[11px] text-gray-200">{def?.name ?? itemId}</p>
        </div>
    );
}

export default function AdminPlayersHomePanel({ lobbyClient }: { lobbyClient: LobbyClient }) {
    const { user } = useUser();
    const api = useMemo(() => new MinionBattlesApi(lobbyClient, '', '', ''), [lobbyClient]);
    const [accounts, setAccounts] = useState<AccountState[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(false);

    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
    const [details, setDetails] = useState<{
        account: AccountState;
        characters: CampaignCharacter[];
    } | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [grantItemId, setGrantItemId] = useState(ALL_PLAYER_ITEMS[0] ?? '');
    const [grantKnowledgeKey, setGrantKnowledgeKey] = useState<'Crystals' | 'Forging' | 'Research'>('Crystals');

    const sortedAccounts = useMemo(() => {
        return [...accounts].sort((a, b) => a.name.localeCompare(b.name));
    }, [accounts]);

    const loadAccounts = useCallback(async () => {
        setAccountsLoading(true);
        try {
            const list = await lobbyClient.listAdminAccounts();
            setAccounts(list as AccountState[]);
        } catch (error) {
            console.error('Failed to load admin accounts list:', error);
            setAccounts([]);
        } finally {
            setAccountsLoading(false);
        }
    }, [lobbyClient]);

    const loadDetails = useCallback(
        async (accountId: number) => {
            setDetailsLoading(true);
            try {
                const res = await lobbyClient.getAdminAccountDetails(accountId);
                setDetails({
                    account: res.account as AccountState,
                    characters: (res.characters as CampaignCharacterData[]).map((data) => fromCampaignCharacterData(data)),
                });
            } catch (error) {
                console.error('Failed to load admin account details:', error);
                setDetails(null);
            } finally {
                setDetailsLoading(false);
            }
        },
        [lobbyClient],
    );

    useEffect(() => {
        void loadAccounts();
    }, [loadAccounts]);

    useEffect(() => {
        if (selectedAccountId == null) {
            setDetails(null);
            setSelectedCharacterId(null);
            return;
        }
        void loadDetails(selectedAccountId);
    }, [loadDetails, selectedAccountId]);

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

    const selectedAccount = useMemo(() => {
        if (selectedAccountId == null) return null;
        return accounts.find((a) => a.id === selectedAccountId) ?? null;
    }, [accounts, selectedAccountId]);

    const selectedCharacter = useMemo(
        () => details?.characters.find((character) => character.id === selectedCharacterId) ?? null,
        [details, selectedCharacterId],
    );

    const inventoryCounts = useMemo(() => buildCounts(details?.account.inventoryItemIds ?? []), [details]);

    const handleInventoryDragStart = useCallback((itemId: string, event: React.DragEvent<HTMLDivElement>) => {
        event.dataTransfer.setData('text/plain', itemId);
        event.dataTransfer.effectAllowed = 'copy';
    }, []);

    const refreshSelectedAccount = useCallback(async () => {
        if (selectedAccountId == null) return;
        await loadDetails(selectedAccountId);
    }, [loadDetails, selectedAccountId]);

    const handleGrantItem = useCallback(async () => {
        if (selectedAccountId == null || !grantItemId) return;
        try {
            await lobbyClient.grantAccountItem(selectedAccountId, grantItemId);
            await refreshSelectedAccount();
        } catch (error) {
            console.error('Failed to grant item:', error);
        }
    }, [grantItemId, lobbyClient, refreshSelectedAccount, selectedAccountId]);

    const handleRemoveItem = useCallback(
        async (itemId: string) => {
            if (selectedAccountId == null) return;
            try {
                await lobbyClient.removeAccountItem(selectedAccountId, itemId);
                await refreshSelectedAccount();
            } catch (error) {
                console.error('Failed to remove item:', error);
            }
        },
        [lobbyClient, refreshSelectedAccount, selectedAccountId],
    );

    const handleSaved = useCallback(() => {
        void refreshSelectedAccount();
    }, [refreshSelectedAccount]);

    const handleGrantKnowledge = useCallback(async () => {
        if (selectedAccountId == null) return;
        try {
            await lobbyClient.grantAccountKnowledge(selectedAccountId, grantKnowledgeKey, {});
            await refreshSelectedAccount();
        } catch (error) {
            console.error('Failed to grant knowledge:', error);
        }
    }, [grantKnowledgeKey, lobbyClient, refreshSelectedAccount, selectedAccountId]);

    if (selectedAccountId == null) {
        return (
            <div className="w-full h-full overflow-auto p-5">
                <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-[32px] font-bold">Players</h2>
                            <p className="text-sm text-muted">Admin overview for all accounts</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadAccounts()}
                            className="rounded-lg border border-border-custom bg-surface-light px-4 py-2 text-sm font-medium text-white hover:bg-border-custom disabled:opacity-60"
                            disabled={accountsLoading}
                        >
                            {accountsLoading ? 'Refreshing…' : 'Refresh'}
                        </button>
                    </div>
                    {accountsLoading && sortedAccounts.length === 0 && (
                        <div className="text-sm text-muted">Loading accounts…</div>
                    )}
                    {!accountsLoading && sortedAccounts.length === 0 && (
                        <div className="text-sm text-muted">No accounts found</div>
                    )}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                        {sortedAccounts.map((account) => (
                            <AccountCard
                                key={account.id}
                                account={account}
                                selected={false}
                                onSelect={() => setSelectedAccountId(account.id)}
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
                        <p className="text-sm text-muted">{selectedAccount?.name ?? `Account #${selectedAccountId}`}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void refreshSelectedAccount()}
                            className="rounded-lg border border-border-custom bg-surface-light px-4 py-2 text-sm font-medium text-white hover:bg-border-custom disabled:opacity-60"
                            disabled={detailsLoading}
                        >
                            {detailsLoading ? 'Refreshing…' : 'Refresh'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedAccountId(null)}
                            className="rounded-lg border border-border-custom bg-surface-light px-4 py-2 text-sm font-medium text-white hover:bg-border-custom"
                        >
                            Back
                        </button>
                    </div>
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
                                    onRemove={(id) => void handleRemoveItem(id)}
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
                            className="rounded-md border border-border-custom bg-white px-3 py-2 text-sm text-black"
                        >
                            {ALL_PLAYER_ITEMS.map((itemId) => (
                                <option key={itemId} value={itemId} className="bg-white text-black">
                                    {getItemName(itemId)}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => void handleGrantItem()}
                            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-secondary hover:bg-primary-hover disabled:opacity-60"
                            disabled={detailsLoading}
                        >
                            Give
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3 overflow-x-auto rounded-lg border border-border-custom bg-surface px-4 py-3 shrink-0">
                    <span className="text-sm font-semibold text-muted shrink-0">Knowledge</span>
                    <div className="flex flex-wrap gap-2">
                        {Object.keys(details?.account.knowledge ?? {}).length > 0 ? (
                            Object.keys(details?.account.knowledge ?? {}).sort().map((key) => (
                                <span
                                    key={key}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[13px] font-semibold bg-surface-light border border-border-custom text-white"
                                    title={key}
                                >
                                    {key}
                                </span>
                            ))
                        ) : (
                            <p className="text-sm text-muted">No knowledge yet</p>
                        )}
                    </div>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <label className="text-xs text-muted">Grant</label>
                        <select
                            value={grantKnowledgeKey}
                            onChange={(e) => setGrantKnowledgeKey(e.target.value as typeof grantKnowledgeKey)}
                            className="rounded-md border border-border-custom bg-white px-3 py-2 text-sm text-black"
                        >
                            <option value="Crystals" className="bg-white text-black">
                                Crystals
                            </option>
                            <option value="Forging" className="bg-white text-black">
                                Forging
                            </option>
                            <option value="Research" className="bg-white text-black">
                                Research
                            </option>
                        </select>
                        <button
                            type="button"
                            onClick={() => void handleGrantKnowledge()}
                            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-secondary hover:bg-primary-hover disabled:opacity-60"
                            disabled={detailsLoading}
                        >
                            Grant
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
                    <div className="w-[200px] shrink-0 overflow-auto rounded-lg border border-border-custom bg-surface p-3">
                        <p className="mb-3 text-sm font-semibold text-white">Characters</p>
                        <div className="space-y-3">
                            {detailsLoading && <p className="text-sm text-muted">Loading…</p>}
                            {!detailsLoading && details?.characters.length === 0 && (
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
                                key={selectedCharacter.id}
                                character={selectedCharacter}
                                api={api}
                                onSaved={handleSaved}
                                onClose={() => {}}
                                editMode
                                inventoryItems={details?.account.inventoryItemIds ?? []}
                                showInventoryPanel
                                account={details?.account ?? null}
                                viewerAccount={user ?? null}
                                campaign={null}
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

