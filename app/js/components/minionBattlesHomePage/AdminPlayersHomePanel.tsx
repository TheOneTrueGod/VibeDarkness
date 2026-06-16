/**
 * Admin-only Players panel on the campaign home screen.
 * Lets admins browse ALL accounts, inspect their characters, and grant/equip items.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccountState } from '../../types';
import { LobbyClient } from '../../LobbyClient';
import CharacterEditor from '../../games/minion_battles/ui/components/CharacterEditor/CharacterEditor';
import CharacterCreator from '../../games/minion_battles/ui/components/CharacterEditor/CharacterCreator';
import { MinionBattlesApi } from '../../games/minion_battles/api/minionBattlesApi';
import { STORYLINES } from '../../games/minion_battles/storylines/index';
import { fromCampaignCharacterData, type CampaignCharacter } from '../../games/minion_battles/character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../../games/minion_battles/character_defs/campaignCharacterTypes';
import { getPortrait } from '../../games/minion_battles/character_defs/portraits';
import { ALL_PLAYER_ITEMS, ITEM_ICON_URLS, getItemDef } from '../../games/minion_battles/character_defs/items';
import { useUser } from '../../contexts/UserContext';
import PanelLayout from './PanelLayout';

function formatCountdown(seconds: number): string {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
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

function AccountCard({
    account,
    selected,
    onSelect,
    now,
}: {
    account: AccountState;
    selected: boolean;
    onSelect: () => void;
    now: number;
}) {
    const earSecondsLeft = account.emergencyRecoveryExpiresAt
        ? Math.max(0, account.emergencyRecoveryExpiresAt - now)
        : 0;
    const inEAR = earSecondsLeft > 0;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                inEAR
                    ? 'border-red-500 bg-surface hover:border-red-400'
                    : selected
                    ? 'border-primary bg-surface-light shadow-[0_0_0_1px_rgba(78,205,196,0.2)]'
                    : 'border-border-custom bg-surface hover:border-primary'
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{account.name}</p>
                    <p className="text-xs text-muted">{account.role === 'admin' ? 'Admin' : 'Player'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    {inEAR && (
                        <span className="text-[10px] font-bold text-red-400">
                            EAR: {formatCountdown(earSecondsLeft)}
                        </span>
                    )}
                    <div className="rounded-md border border-border-custom bg-dark-700 px-2 py-1 text-xs text-muted">
                        #{account.id}
                    </div>
                </div>
            </div>
        </button>
    );
}

function CharacterListCard({
    character,
    selected,
    onSelect,
    onDelete,
}: {
    character: CampaignCharacter;
    selected: boolean;
    onSelect: () => void;
    onDelete: () => void;
}) {
    const portrait = getPortrait(character.portraitId);
    const displayName = character.name || portrait?.name || 'Character';
    const picture = portrait?.picture;
    const [confirming, setConfirming] = useState(false);
    return (
        <div className={`w-full rounded-lg border-2 overflow-hidden transition-colors ${
            selected ? 'border-primary bg-surface-light' : 'border-border-custom bg-surface'
        }`}>
            <button
                type="button"
                onClick={onSelect}
                className="w-full text-left hover:bg-white/5 transition-colors"
            >
                <div className="h-24 bg-background flex items-center justify-center overflow-hidden">
                    {picture ? (
                        picture.trimStart().startsWith('<') ? (
                            <div dangerouslySetInnerHTML={{ __html: picture }} className="w-full h-full" />
                        ) : (
                            <img src={picture} alt="" className="w-full h-full object-cover" />
                        )
                    ) : null}
                </div>
                <div className="px-3 py-2">
                    <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                    <p className="text-[11px] text-muted truncate">{character.id}</p>
                </div>
            </button>
            {confirming ? (
                <div className="flex items-center justify-between gap-1 px-3 py-2 border-t border-border-custom bg-red-950/40">
                    <span className="text-xs text-red-300">Delete?</span>
                    <div className="flex gap-1">
                        <button type="button" onClick={() => setConfirming(false)} className="px-2 py-0.5 rounded text-xs border border-border-custom text-muted hover:text-white transition-colors cursor-pointer">Cancel</button>
                        <button type="button" onClick={() => { setConfirming(false); onDelete(); }} className="px-2 py-0.5 rounded text-xs bg-red-700 hover:bg-red-600 text-white transition-colors cursor-pointer">Delete</button>
                    </div>
                </div>
            ) : (
                <div className="flex justify-end px-2 py-1.5 border-t border-border-custom">
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                        title="Delete character"
                        aria-label="Delete character"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
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

interface AdminPlayersPanelProps {
    lobbyClient: LobbyClient;
    onStartMissionForCharacter?: (missionId: string, character: CampaignCharacter, ownerAccount: AccountState) => void;
}

export default function AdminPlayersHomePanel({ lobbyClient, onStartMissionForCharacter }: AdminPlayersPanelProps) {
    const { user } = useUser();
    const api = useMemo(() => new MinionBattlesApi(lobbyClient, '', '', ''), [lobbyClient]);
    const [accounts, setAccounts] = useState<AccountState[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
    const [details, setDetails] = useState<{
        account: AccountState;
        characters: CampaignCharacter[];
    } | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [grantItemId, setGrantItemId] = useState(ALL_PLAYER_ITEMS[0] ?? '');
    const [grantKnowledgeKey, setGrantKnowledgeKey] = useState<'Crystals' | 'Forging' | 'Research'>('Crystals');
    const [creatorOpen, setCreatorOpen] = useState(false);
    const createCharacterBtnRef = useRef<HTMLButtonElement>(null);

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

    const handleDeleteCharacter = useCallback(async (characterId: string) => {
        await api.deleteCharacter(characterId);
        if (selectedCharacterId === characterId) setSelectedCharacterId(null);
        await refreshSelectedAccount();
    }, [api, selectedCharacterId, refreshSelectedAccount]);

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

    const handleSetEmergencyRecovery = useCallback(async (action: 'enable' | 'disable') => {
        if (selectedAccountId == null) return;
        try {
            await lobbyClient.setEmergencyRecovery(selectedAccountId, action);
            await Promise.all([loadDetails(selectedAccountId), loadAccounts()]);
        } catch (error) {
            console.error('Failed to set emergency recovery:', error);
        }
    }, [lobbyClient, loadDetails, loadAccounts, selectedAccountId]);

    // Tick every second while any account has an active EAR timer
    useEffect(() => {
        const anyEAR =
            accounts.some((a) => a.emergencyRecoveryExpiresAt && a.emergencyRecoveryExpiresAt > now) ||
            !!(details?.account.emergencyRecoveryExpiresAt && details.account.emergencyRecoveryExpiresAt > now);

        if (anyEAR) {
            if (tickerRef.current === null) {
                tickerRef.current = setInterval(() => {
                    setNow(Math.floor(Date.now() / 1000));
                }, 1000);
            }
        } else {
            if (tickerRef.current !== null) {
                clearInterval(tickerRef.current);
                tickerRef.current = null;
            }
        }
        return () => {};
    }, [accounts, details, now]);

    useEffect(() => {
        return () => {
            if (tickerRef.current !== null) clearInterval(tickerRef.current);
        };
    }, []);

    // ── Account list view ────────────────────────────────────────────────────
    if (selectedAccountId == null) {
        return (
            <PanelLayout
                title="Players"
                subtitle="Admin overview for all accounts"
                actions={
                    <button
                        type="button"
                        onClick={() => void loadAccounts()}
                        className="rounded-lg border border-border-custom bg-surface-light px-4 py-2 text-sm font-medium text-white hover:bg-border-custom disabled:opacity-60"
                        disabled={accountsLoading}
                    >
                        {accountsLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                }
                center={
                    <div className="p-5 h-full overflow-y-auto">
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
                                    now={now}
                                />
                            ))}
                        </div>
                    </div>
                }
                centerClassName="overflow-hidden"
            />
        );
    }

    // ── Character detail view ────────────────────────────────────────────────
    const expiresAt = details?.account.emergencyRecoveryExpiresAt;
    const earSecondsLeft = expiresAt ? Math.max(0, expiresAt - now) : 0;
    const inEAR = earSecondsLeft > 0;
    const isAdminAccount = selectedAccount?.role === 'admin';

    return (
        <>
            <PanelLayout
                title="Players"
                subtitle={
                    <span className="flex items-center gap-3">
                        <span>{selectedAccount?.name ?? `Account #${selectedAccountId}`}</span>
                        {inEAR && (
                            <span className="font-semibold text-red-400">
                                Emergency Recovery: ({formatCountdown(earSecondsLeft)})
                            </span>
                        )}
                    </span>
                }
                actions={
                    <>
                        {!isAdminAccount && (
                            inEAR ? (
                                <button
                                    type="button"
                                    onClick={() => void handleSetEmergencyRecovery('disable')}
                                    className="rounded-lg border border-red-500 bg-surface-light px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-60"
                                    disabled={detailsLoading}
                                >
                                    Disable Recovery
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handleSetEmergencyRecovery('enable')}
                                    className="rounded-lg border border-red-700 bg-surface-light px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-900/30 disabled:opacity-60"
                                    disabled={detailsLoading}
                                >
                                    Emergency Account Recovery
                                </button>
                            )
                        )}
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
                    </>
                }
                left={
                    <div className="p-3 space-y-3">
                        <p className="text-sm font-semibold text-white">Characters</p>
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
                                onDelete={() => void handleDeleteCharacter(character.id)}
                            />
                        ))}
                        {details && (
                            <button
                                ref={createCharacterBtnRef}
                                type="button"
                                onClick={() => setCreatorOpen(true)}
                                className="w-full rounded-lg border-2 border-dashed border-border-custom px-3 py-2 text-sm text-muted hover:border-primary hover:text-white transition-colors cursor-pointer text-left"
                            >
                                + Create new character
                            </button>
                        )}
                    </div>
                }
                leftWidth="w-48"
                center={
                    selectedCharacter ? (
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
                            onStartMission={
                                onStartMissionForCharacter && details?.account
                                    ? (missionId) =>
                                          onStartMissionForCharacter(missionId, selectedCharacter, details.account)
                                    : undefined
                            }
                            adminEquipmentPanel={
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-sm font-semibold text-muted shrink-0">Items</span>
                                    <div className="flex flex-wrap gap-2 flex-1 min-w-0">
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
                                    <div className="flex items-center gap-2 shrink-0 ml-auto">
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
                            }
                            adminKnowledgePanel={
                                <div className="flex flex-col gap-2 h-full">
                                    <p className="text-xs text-muted">Knowledge</p>
                                    <div className="flex flex-wrap gap-2 flex-1">
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
                                    <div className="flex items-center gap-2 mt-auto">
                                        <label className="text-xs text-muted">Grant</label>
                                        <select
                                            value={grantKnowledgeKey}
                                            onChange={(e) => setGrantKnowledgeKey(e.target.value as typeof grantKnowledgeKey)}
                                            className="rounded-md border border-border-custom bg-white px-2 py-1 text-sm text-black"
                                        >
                                            <option value="Crystals" className="bg-white text-black">Crystals</option>
                                            <option value="Forging" className="bg-white text-black">Forging</option>
                                            <option value="Research" className="bg-white text-black">Research</option>
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => void handleGrantKnowledge()}
                                            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-secondary hover:bg-primary-hover disabled:opacity-60"
                                            disabled={detailsLoading}
                                        >
                                            Grant
                                        </button>
                                    </div>
                                </div>
                            }
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center p-6 text-muted">
                            Select a character to edit it
                        </div>
                    )
                }
                centerClassName="overflow-hidden"
            />

            {creatorOpen && details && (() => {
                const campaignId = details.characters[0]?.campaignId ?? STORYLINES[0]?.id ?? 'world_of_darkness';
                const missionId = STORYLINES.find((s) => s.id === campaignId)?.startMissionId ?? STORYLINES[0]?.startMissionId ?? 'dark_awakening';
                return (
                    <CharacterCreator
                        campaignId={campaignId}
                        missionId={missionId}
                        onCreate={async (characterId) => {
                            setCreatorOpen(false);
                            if (selectedAccountId != null) await loadDetails(selectedAccountId);
                            setSelectedCharacterId(characterId);
                        }}
                        onClose={() => setCreatorOpen(false)}
                        createCharacter={async (payload) => {
                            const { character } = await api.createCharacter(payload);
                            return { id: character.id, portraitId: character.portraitId, name: character.name };
                        }}
                        anchorRef={createCharacterBtnRef}
                        localPlayerId={user?.id}
                    />
                );
            })()}
        </>
    );
}
