/**
 * Admin-only Players panel on the campaign home screen.
 * Lets admins browse ALL accounts, inspect their characters, and grant/equip items.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AccountState } from '../../types';
import { LobbyClient } from '../../LobbyClient';
import CharacterEditor from '../../games/minion_battles/ui/components/CharacterEditor/CharacterEditor';
import CharacterCreator from '../../games/minion_battles/ui/components/CharacterEditor/CharacterCreator';
import { MinionBattlesApi } from '../../games/minion_battles/api/minionBattlesApi';
import { STORYLINES } from '../../games/minion_battles/storylines/index';
import { fromCampaignCharacterData, type CampaignCharacter } from '../../games/minion_battles/character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../../games/minion_battles/character_defs/campaignCharacterTypes';
import { ALL_PLAYER_ITEMS } from '../../games/minion_battles/character_defs/items';
import { useUser } from '../../contexts/UserContext';
import PanelLayout from './PanelLayout';
import { ItemCard } from '../../games/minion_battles/ui/components/characters/ItemCard';
import { CharacterListCard } from '../../games/minion_battles/ui/components/characters/CharacterListCard';
import { buildCounts, getItemName } from '../../games/minion_battles/ui/components/characters/characterUtils';
import { playersListPath, playerCharactersPath, playerCharacterPath } from '../ability-tests/campaignTabPaths';

function formatCountdown(seconds: number): string {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
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

interface AdminPlayersPanelProps {
    lobbyClient: LobbyClient;
    onStartMissionForCharacter?: (missionId: string, character: CampaignCharacter, ownerAccount: AccountState) => void;
}

export default function AdminPlayersHomePanel({ lobbyClient, onStartMissionForCharacter }: AdminPlayersPanelProps) {
    const { user } = useUser();
    const { playerId: playerIdParam, characterId: characterIdParam } = useParams<{ playerId?: string; characterId?: string }>();
    const navigate = useNavigate();
    const selectedAccountId = playerIdParam != null ? parseInt(playerIdParam, 10) : null;
    const selectedCharacterId = characterIdParam ?? null;

    const api = useMemo(() => new MinionBattlesApi(lobbyClient, '', '', ''), [lobbyClient]);
    const [accounts, setAccounts] = useState<AccountState[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
            return;
        }
        void loadDetails(selectedAccountId);
    }, [loadDetails, selectedAccountId]);

    // Auto-navigate to first character when account loads and no character is selected
    useEffect(() => {
        if (!details || selectedAccountId == null || details.characters.length === 0) return;
        if (!selectedCharacterId || !details.characters.some((c) => c.id === selectedCharacterId)) {
            navigate(playerCharacterPath(selectedAccountId, details.characters[0].id), { replace: true });
        }
    }, [details, selectedAccountId, selectedCharacterId, navigate]);

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
        if (selectedCharacterId === characterId && selectedAccountId != null) {
            navigate(playerCharactersPath(selectedAccountId), { replace: true });
        }
        await refreshSelectedAccount();
    }, [api, selectedCharacterId, selectedAccountId, refreshSelectedAccount, navigate]);

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
                                    onSelect={() => navigate(playerCharactersPath(account.id))}
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
                            onClick={() => navigate(playersListPath())}
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
                                onSelect={() => selectedAccountId != null && navigate(playerCharacterPath(selectedAccountId, character.id))}
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
                            if (selectedAccountId != null) {
                                await loadDetails(selectedAccountId);
                                navigate(playerCharacterPath(selectedAccountId, characterId), { replace: true });
                            }
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
