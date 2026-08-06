import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { AccountState, PlayerState } from '../../../../../types';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { LobbyClient } from '../../../../../LobbyClient';
import CharacterEditor from '../CharacterEditor/CharacterEditor';
import CharacterCreator from '../CharacterEditor/CharacterCreator';
import { fromCampaignCharacterData, type CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../../../character_defs/campaignCharacterTypes';
import { ALL_PLAYER_ITEMS } from '../../../character_defs/items';
import { useUserData } from '../../../../../user/UserDataProvider';
import { STORYLINES } from '../../../storylines/index';
import PanelLayout from '../../../../../components/minionBattlesHomePage/PanelLayout';
import {
    playersListPath,
    playerCharactersPath,
    playerCharacterPath,
    playerCampaignDataPath,
    isPlayerCampaignDataPath,
} from '../../../../../components/ability-tests/campaignTabPaths';
import { TestIds } from '../../../../../testing/testIds';
import { ItemCard } from './ItemCard';
import { CharacterCard } from './CharacterCard';
import { CharacterListCard } from './CharacterListCard';
import { PlayerCard } from './PlayerCard';
import { CampaignDataPanel } from './CampaignDataPanel';
import { buildCounts, sortByLastUsed, sortPlayers, getItemName } from './characterUtils';

function formatCountdown(seconds: number): string {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface CharactersPanelProps {
    api: MinionBattlesApi;
    /** Required for campaign-home admin view (EAR, knowledge grant). Omitted in lobby context. */
    lobbyClient?: LobbyClient;
    /** Lobby member list — when provided, admin mode shows a state-based lobby player list instead of URL routing. */
    players?: Record<string, PlayerState>;
    onStartMissionForCharacter?: (missionId: string, character: CampaignCharacter, ownerAccount: AccountState) => void;
    onStartQuestForCharacter?: (
        questDefId: string,
        character: CampaignCharacter,
        ownerAccount: AccountState,
        options?: {
            mode?: 'continue' | 'start';
            assignedBankId?: string | null;
            adminSeekSlotIndex?: number;
        },
    ) => void;
}

export default function CharactersPanel({
    api,
    lobbyClient,
    players,
    onStartMissionForCharacter,
    onStartQuestForCharacter,
}: CharactersPanelProps) {
    const { user } = useUserData();
    const isAdmin = user?.role === 'admin';

    // ── URL params ───────────────────────────────────────────────────────────
    const { playerId: playerIdParam, characterId: characterIdParam } = useParams<{ playerId?: string; characterId?: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const isCampaignDataSelected = isPlayerCampaignDataPath(location.pathname);

    // ── Lobby admin state (when players prop is provided) ────────────────────
    const [lobbySelectedPlayerId, setLobbySelectedPlayerId] = useState<string | null>(null);
    const [lobbyAdminSelectedCharId, setLobbyAdminSelectedCharId] = useState<string | null>(null);
    const [lobbyShowCampaignData, setLobbyShowCampaignData] = useState(false);

    // ── Admin state ──────────────────────────────────────────────────────────
    const [adminDetails, setAdminDetails] = useState<{
        account: AccountState;
        characters: CampaignCharacter[];
    } | null>(null);
    const [adminLoading, setAdminLoading] = useState(false);
    const [grantItemId, setGrantItemId] = useState(ALL_PLAYER_ITEMS[0] ?? '');
    const [grantKnowledgeKey, setGrantKnowledgeKey] = useState<'Crystals' | 'Forging' | 'Research'>('Crystals');
    const [adminCreatorOpen, setAdminCreatorOpen] = useState(false);
    const adminCreateBtnRef = useRef<HTMLButtonElement>(null);
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Player state ─────────────────────────────────────────────────────────
    const [playerCharacters, setPlayerCharacters] = useState<CampaignCharacter[]>([]);
    const [playerLoading, setPlayerLoading] = useState(false);
    const [creatorOpen, setCreatorOpen] = useState(false);
    const createButtonRef = useRef<HTMLButtonElement>(null);

    // ── Player mode: redirect guard ───────────────────────────────────────────
    useEffect(() => {
        if (isAdmin || !user) return;
        if (!playerIdParam || String(user.id) !== playerIdParam) {
            navigate(playerCharactersPath(user.id), { replace: true });
        }
    }, [isAdmin, user, playerIdParam, navigate]);

    // ── Player mode: load own characters ──────────────────────────────────────
    const loadPlayerCharacters = useCallback(async () => {
        setPlayerLoading(true);
        try {
            const data = await api.getMyCharacters();
            setPlayerCharacters((data as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d)));
        } catch (err) {
            console.error('Failed to load characters:', err);
        } finally {
            setPlayerLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (!isAdmin) void loadPlayerCharacters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sortedPlayerCharacters = useMemo(() => sortByLastUsed(playerCharacters), [playerCharacters]);

    useEffect(() => {
        if (isAdmin || playerLoading || sortedPlayerCharacters.length === 0 || !user) return;
        if (!characterIdParam || !sortedPlayerCharacters.some((c) => c.id === characterIdParam)) {
            navigate(playerCharacterPath(user.id, sortedPlayerCharacters[0].id), { replace: true });
        }
    }, [isAdmin, sortedPlayerCharacters, characterIdParam, user, navigate, playerLoading]);

    const selectedPlayerCharacter = useMemo(
        () => playerCharacters.find((c) => c.id === characterIdParam) ?? null,
        [playerCharacters, characterIdParam],
    );

    // ── Admin mode: load selected player's details ────────────────────────────
    const loadAdminDetails = useCallback(async (playerId: string) => {
        setAdminLoading(true);
        try {
            const res = await api.getAdminAccountDetails(playerId);
            setAdminDetails({
                account: res.account as AccountState,
                characters: (res.characters as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d)),
            });
        } catch (error) {
            console.error('Failed to load admin player details:', error);
            setAdminDetails(null);
        } finally {
            setAdminLoading(false);
        }
    }, [api]);

    // Lobby context: load details for the selected lobby player
    useEffect(() => {
        if (!isAdmin || !players || !lobbySelectedPlayerId) {
            if (players) setAdminDetails(null);
            return;
        }
        void loadAdminDetails(lobbySelectedPlayerId);
    }, [isAdmin, players, loadAdminDetails, lobbySelectedPlayerId]);

    // Campaign home context: load details for the player in the URL
    useEffect(() => {
        if (!isAdmin || players || !playerIdParam) {
            if (!players) setAdminDetails(null);
            return;
        }
        void loadAdminDetails(playerIdParam);
    }, [isAdmin, players, loadAdminDetails, playerIdParam]);

    // Lobby context: auto-select first character for the selected lobby player
    useEffect(() => {
        if (!isAdmin || !players || !adminDetails) { return; }
        if (lobbyShowCampaignData) return;
        const sortedChars = sortByLastUsed(adminDetails.characters);
        if (sortedChars.length === 0) { setLobbyAdminSelectedCharId(null); return; }
        if (!lobbyAdminSelectedCharId || !sortedChars.some((c) => c.id === lobbyAdminSelectedCharId)) {
            setLobbyAdminSelectedCharId(sortedChars[0].id);
        }
    }, [isAdmin, players, adminDetails, lobbyAdminSelectedCharId, lobbyShowCampaignData]);

    // Campaign home context: auto-navigate to first character when no character is selected
    useEffect(() => {
        if (!isAdmin || players || adminLoading || !adminDetails || !playerIdParam) return;
        if (isCampaignDataSelected) return;
        const sortedChars = sortByLastUsed(adminDetails.characters);
        if (sortedChars.length === 0) return;
        if (!characterIdParam || !sortedChars.some((c) => c.id === characterIdParam)) {
            navigate(playerCharacterPath(playerIdParam, sortedChars[0].id), { replace: true });
        }
    }, [isAdmin, players, adminLoading, adminDetails, characterIdParam, playerIdParam, navigate, isCampaignDataSelected]);

    // Admin: EAR countdown ticker
    useEffect(() => {
        if (!isAdmin) return;
        const hasActiveEAR = !!(
            adminDetails?.account.emergencyRecoveryExpiresAt &&
            adminDetails.account.emergencyRecoveryExpiresAt > now
        );
        if (hasActiveEAR) {
            if (tickerRef.current === null) {
                tickerRef.current = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
            }
        } else {
            if (tickerRef.current !== null) {
                clearInterval(tickerRef.current);
                tickerRef.current = null;
            }
        }
        return () => {};
    }, [isAdmin, adminDetails, now]);

    useEffect(() => {
        return () => {
            if (tickerRef.current !== null) clearInterval(tickerRef.current);
        };
    }, []);

    const sortedAdminCharacters = useMemo(
        () => (adminDetails ? sortByLastUsed(adminDetails.characters) : []),
        [adminDetails],
    );

    const selectedAdminCharacter = useMemo(() => {
        if (!adminDetails) return null;
        if (players ? lobbyShowCampaignData : isCampaignDataSelected) return null;
        const charId = players ? lobbyAdminSelectedCharId : characterIdParam;
        return adminDetails.characters.find((c) => c.id === charId) ?? null;
    }, [
        adminDetails,
        players,
        lobbyAdminSelectedCharId,
        characterIdParam,
        lobbyShowCampaignData,
        isCampaignDataSelected,
    ]);

    const inventoryCounts = useMemo(
        () => buildCounts(adminDetails?.account.inventoryItemIds ?? []),
        [adminDetails],
    );

    const expiresAt = adminDetails?.account.emergencyRecoveryExpiresAt;
    const earSecondsLeft = expiresAt ? Math.max(0, expiresAt - now) : 0;
    const inEAR = earSecondsLeft > 0;
    const isAdminAccount = adminDetails?.account.role === 'admin';

    const refreshAdminPlayer = useCallback(async () => {
        if (!playerIdParam) return;
        await loadAdminDetails(playerIdParam);
    }, [loadAdminDetails, playerIdParam]);

    const handleGrantItem = useCallback(async () => {
        if (!playerIdParam || !grantItemId) return;
        try {
            await api.grantAccountItem(playerIdParam, grantItemId);
            await refreshAdminPlayer();
        } catch (error) {
            console.error('Failed to grant item:', error);
        }
    }, [grantItemId, api, refreshAdminPlayer, playerIdParam]);

    const handleRemoveItem = useCallback(async (itemId: string) => {
        if (!playerIdParam) return;
        try {
            await api.removeAccountItem(playerIdParam, itemId);
            await refreshAdminPlayer();
        } catch (error) {
            console.error('Failed to remove item:', error);
        }
    }, [api, refreshAdminPlayer, playerIdParam]);

    const handleInventoryDragStart = useCallback((itemId: string, event: React.DragEvent<HTMLDivElement>) => {
        event.dataTransfer.setData('text/plain', itemId);
        event.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleGrantKnowledge = useCallback(async () => {
        if (!playerIdParam || !lobbyClient) return;
        try {
            await lobbyClient.grantAccountKnowledge(playerIdParam, grantKnowledgeKey, {});
            await refreshAdminPlayer();
        } catch (error) {
            console.error('Failed to grant knowledge:', error);
        }
    }, [grantKnowledgeKey, lobbyClient, refreshAdminPlayer, playerIdParam]);

    const handleDeleteAdminCharacter = useCallback(async (characterId: string) => {
        await api.deleteCharacter(characterId);
        if (characterIdParam === characterId && playerIdParam != null) {
            navigate(playerCharactersPath(playerIdParam), { replace: true });
        }
        await refreshAdminPlayer();
    }, [api, characterIdParam, playerIdParam, navigate, refreshAdminPlayer]);

    const handleSetEmergencyRecovery = useCallback(async (action: 'enable' | 'disable') => {
        if (!playerIdParam || !lobbyClient) return;
        try {
            await lobbyClient.setEmergencyRecovery(playerIdParam, action);
            await refreshAdminPlayer();
        } catch (error) {
            console.error('Failed to set emergency recovery:', error);
        }
    }, [lobbyClient, refreshAdminPlayer, playerIdParam]);

    // ── Player mode: handlers ─────────────────────────────────────────────────
    const handleDeletePlayerCharacter = useCallback(async (characterId: string) => {
        await api.deleteCharacter(characterId);
        if (characterIdParam === characterId && user) {
            navigate(playerCharactersPath(user.id), { replace: true });
        }
        await loadPlayerCharacters();
    }, [api, characterIdParam, user, navigate, loadPlayerCharacters]);

    const handlePlayerCreated = useCallback(async (characterId: string) => {
        setCreatorOpen(false);
        await loadPlayerCharacters();
        if (user) navigate(playerCharacterPath(user.id, characterId), { replace: true });
    }, [loadPlayerCharacters, user, navigate]);

    // ── Admin render: lobby context (players prop provided) ──────────────────
    if (isAdmin && players) {
        const playerList = sortPlayers(players);

        if (!lobbySelectedPlayerId) {
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
                                    onSelect={() => { setLobbySelectedPlayerId(player.id); setLobbyAdminSelectedCharId(null); setLobbyShowCampaignData(false); }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        const selectedLobbyPlayer = players[lobbySelectedPlayerId] ?? null;
        const lobbyInventoryCounts = buildCounts(adminDetails?.account.inventoryItemIds ?? []);

        return (
            <div className="w-full h-full overflow-hidden p-5">
                <div className="mx-auto flex h-full max-w-[1600px] min-h-0 flex-col gap-4">
                    <div className="flex items-center justify-between gap-3 shrink-0">
                        <div>
                            <h2 className="text-[32px] font-bold">Players</h2>
                            <p className="text-sm text-muted">
                                {selectedLobbyPlayer?.name ?? `Player ${lobbySelectedPlayerId}`}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setLobbySelectedPlayerId(null); setAdminDetails(null); setLobbyShowCampaignData(false); }}
                            className="rounded-lg border border-border-custom bg-surface-light px-4 py-2 text-sm font-medium text-white hover:bg-border-custom"
                        >
                            Back
                        </button>
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto rounded-lg border border-border-custom bg-surface px-4 py-3 shrink-0">
                        <span className="text-sm font-semibold text-muted shrink-0">Items</span>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(lobbyInventoryCounts).length > 0 ? (
                                Object.entries(lobbyInventoryCounts).map(([itemId, count]) => (
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
                                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-secondary hover:bg-primary-hover"
                            >
                                Give
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
                        <div className="w-[200px] shrink-0 overflow-auto rounded-lg border border-border-custom bg-surface p-3">
                            {lobbyClient && (
                                <button
                                    type="button"
                                    data-testid={TestIds.campaignDataRow}
                                    data-selected={lobbyShowCampaignData ? 'true' : 'false'}
                                    onClick={() => {
                                        setLobbyShowCampaignData(true);
                                        setLobbyAdminSelectedCharId(null);
                                    }}
                                    className={`mb-3 w-full rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
                                        lobbyShowCampaignData
                                            ? 'border-primary bg-surface-light shadow-[0_0_0_1px_rgba(78,205,196,0.2)]'
                                            : 'border-border-custom bg-surface hover:bg-white/5'
                                    }`}
                                >
                                    <p className="text-sm font-semibold text-white">Campaign data</p>
                                    <p className="text-[10px] text-muted">DarknessStrength & more</p>
                                </button>
                            )}
                            <p className="mb-3 text-sm font-semibold text-white">Characters</p>
                            <div className="space-y-3">
                                {adminLoading && <p className="text-sm text-muted">Loading…</p>}
                                {!adminLoading && sortedAdminCharacters.length === 0 && (
                                    <p className="text-sm text-muted">No characters found</p>
                                )}
                                {sortedAdminCharacters.map((character) => (
                                    <CharacterListCard
                                        key={character.id}
                                        character={character}
                                        selected={!lobbyShowCampaignData && lobbyAdminSelectedCharId === character.id}
                                        onSelect={() => {
                                            setLobbyShowCampaignData(false);
                                            setLobbyAdminSelectedCharId(character.id);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 overflow-hidden rounded-lg border border-border-custom bg-surface">
                            {lobbyShowCampaignData && lobbyClient ? (
                                <CampaignDataPanel
                                    lobbyClient={lobbyClient}
                                    characters={adminDetails?.characters ?? []}
                                    account={adminDetails?.account ?? null}
                                />
                            ) : selectedAdminCharacter ? (
                                <CharacterEditor
                                    key={selectedAdminCharacter.id}
                                    character={selectedAdminCharacter}
                                    api={api}
                                    onSaved={() => void refreshAdminPlayer()}
                                    onClose={() => {}}
                                    editMode
                                    inventoryItems={adminDetails?.account.inventoryItemIds ?? []}
                                    showInventoryPanel
                                    account={adminDetails?.account ?? null}
                                    viewerAccount={user ?? null}
                                    campaign={null}
                                    hideMissionMap
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

    // ── Admin render: campaign home context (URL-based) ───────────────────────
    if (isAdmin) {
        return (
            <>
                <PanelLayout
                    title={`${adminDetails?.account.name ?? (playerIdParam ? `Account #${playerIdParam}` : 'Loading…')}'s Characters`}
                    subtitle={inEAR ? (
                        <span className="font-semibold text-red-400">
                            Emergency Recovery: ({formatCountdown(earSecondsLeft)})
                        </span>
                    ) : undefined}
                    actions={
                        <>
                            {!isAdminAccount && adminDetails && (
                                inEAR ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleSetEmergencyRecovery('disable')}
                                        className="rounded-lg border border-red-500 bg-surface-light px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-60"
                                        disabled={adminLoading}
                                    >
                                        Disable Recovery
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void handleSetEmergencyRecovery('enable')}
                                        className="rounded-lg border border-red-700 bg-surface-light px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-900/30 disabled:opacity-60"
                                        disabled={adminLoading}
                                    >
                                        Emergency Account Recovery
                                    </button>
                                )
                            )}
                            <button
                                type="button"
                                onClick={() => void refreshAdminPlayer()}
                                className="rounded-lg border border-border-custom bg-surface-light px-4 py-2 text-sm font-medium text-white hover:bg-border-custom disabled:opacity-60"
                                disabled={adminLoading}
                            >
                                {adminLoading ? 'Refreshing…' : 'Refresh'}
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
                        <div className="flex flex-col gap-2 p-3">
                            {adminDetails && (
                                <button
                                    type="button"
                                    data-testid={TestIds.campaignDataRow}
                                    data-selected={isCampaignDataSelected ? 'true' : 'false'}
                                    onClick={() => {
                                        if (playerIdParam != null) {
                                            navigate(playerCampaignDataPath(playerIdParam));
                                        }
                                    }}
                                    className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                                        isCampaignDataSelected
                                            ? 'border-primary bg-surface-light shadow-[0_0_0_1px_rgba(78,205,196,0.2)]'
                                            : 'border-border-custom bg-surface hover:bg-white/5'
                                    }`}
                                >
                                    <p className="font-semibold text-white">Campaign data</p>
                                    <p className="text-[10px] text-muted">DarknessStrength & more</p>
                                </button>
                            )}
                            {/* Only on initial load — during refreshes the stale list stays put so it doesn't shift */}
                            {adminLoading && !adminDetails && <p className="text-sm text-muted">Loading…</p>}
                            {!adminLoading && sortedAdminCharacters.length === 0 && (
                                <p className="text-sm text-muted">No characters found</p>
                            )}
                            {sortedAdminCharacters.map((character) => (
                                <CharacterCard
                                    key={character.id}
                                    character={character}
                                    selected={!isCampaignDataSelected && characterIdParam === character.id}
                                    onSelect={() => playerIdParam != null && navigate(playerCharacterPath(playerIdParam, character.id))}
                                    onDelete={() => void handleDeleteAdminCharacter(character.id)}
                                    subtitle={character.id}
                                />
                            ))}
                            {adminDetails && (
                                <button
                                    ref={adminCreateBtnRef}
                                    type="button"
                                    onClick={() => setAdminCreatorOpen(true)}
                                    className="w-full rounded-lg border-2 border-dashed border-border-custom px-4 py-3 text-sm text-muted hover:border-primary hover:text-white transition-colors cursor-pointer text-left"
                                >
                                    + Create new character
                                </button>
                            )}
                        </div>
                    }
                    leftSize="small"
                    center={
                        isCampaignDataSelected ? (
                            lobbyClient ? (
                                <CampaignDataPanel
                                    lobbyClient={lobbyClient}
                                    characters={adminDetails?.characters ?? []}
                                    account={adminDetails?.account ?? null}
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center p-6 text-muted">
                                    Campaign data requires lobby client
                                </div>
                            )
                        ) : selectedAdminCharacter ? (
                            <CharacterEditor
                                key={selectedAdminCharacter.id}
                                character={selectedAdminCharacter}
                                api={api}
                                onSaved={() => void refreshAdminPlayer()}
                                onClose={() => {}}
                                editMode
                                inventoryItems={adminDetails?.account.inventoryItemIds ?? []}
                                showInventoryPanel
                                account={adminDetails?.account ?? null}
                                viewerAccount={user ?? null}
                                campaign={null}
                                onStartMission={
                                    onStartMissionForCharacter && adminDetails?.account
                                        ? (missionId) => onStartMissionForCharacter(missionId, selectedAdminCharacter, adminDetails.account)
                                        : undefined
                                }
                                onStartQuest={
                                    onStartQuestForCharacter && adminDetails?.account
                                        ? (questDefId, options) =>
                                              onStartQuestForCharacter(
                                                  questDefId,
                                                  selectedAdminCharacter,
                                                  adminDetails.account,
                                                  options,
                                              )
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
                                                disabled={adminLoading}
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
                                            {Object.keys(adminDetails?.account.knowledge ?? {}).length > 0 ? (
                                                Object.keys(adminDetails?.account.knowledge ?? {}).sort().map((key) => (
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
                                                disabled={adminLoading}
                                            >
                                                Grant
                                            </button>
                                        </div>
                                    </div>
                                }
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center p-6 text-muted">
                                {adminLoading ? 'Loading…' : 'Select a character to edit it'}
                            </div>
                        )
                    }
                    centerClassName="overflow-hidden"
                />

                {adminCreatorOpen && adminDetails && (() => {
                    const campaignId = adminDetails.characters[0]?.campaignId ?? STORYLINES[0]?.id ?? 'world_of_darkness';
                    const missionId = STORYLINES.find((s) => s.id === campaignId)?.startMissionId ?? STORYLINES[0]?.startMissionId ?? 'dark_awakening';
                    return (
                        <CharacterCreator
                            campaignId={campaignId}
                            missionId={missionId}
                            onCreate={async (characterId) => {
                                setAdminCreatorOpen(false);
                                if (playerIdParam != null) {
                                    await loadAdminDetails(playerIdParam);
                                    navigate(playerCharacterPath(playerIdParam, characterId), { replace: true });
                                }
                            }}
                            onClose={() => setAdminCreatorOpen(false)}
                            createCharacter={async (payload) => {
                                const { character } = await api.createCharacter(payload);
                                return { id: character.id, portraitId: character.portraitId, name: character.name };
                            }}
                            anchorRef={adminCreateBtnRef}
                            localPlayerId={user?.id}
                        />
                    );
                })()}
            </>
        );
    }

    // ── Player render ─────────────────────────────────────────────────────────
    const defaultCampaignId = sortedPlayerCharacters[0]?.campaignId ?? STORYLINES[0]?.id ?? 'world_of_darkness';
    const defaultMissionId = STORYLINES.find((s) => s.id === defaultCampaignId)?.startMissionId ?? STORYLINES[0]?.startMissionId ?? 'dark_awakening';

    const leftPanel = playerCharacters.length > 0 ? (
        <div className="flex flex-col gap-2 p-3">
            {sortedPlayerCharacters.map((c) => (
                <CharacterCard
                    key={c.id}
                    character={c}
                    selected={c.id === characterIdParam}
                    onSelect={() => { if (user) navigate(playerCharacterPath(user.id, c.id)); }}
                    onDelete={() => void handleDeletePlayerCharacter(c.id)}
                />
            ))}
            <button
                ref={createButtonRef}
                type="button"
                data-testid={TestIds.charactersCreate}
                onClick={() => setCreatorOpen(true)}
                className="w-full rounded-lg border-2 border-dashed border-border-custom px-4 py-3 text-sm text-muted hover:border-primary hover:text-white transition-colors cursor-pointer text-left"
            >
                + Create new character
            </button>
        </div>
    ) : undefined;

    const centerPanel = (() => {
        if (playerLoading && playerCharacters.length === 0) {
            return <div className="p-5 text-sm text-muted" data-testid={TestIds.charactersLoading}>Loading characters…</div>;
        }
        if (!playerLoading && playerCharacters.length === 0) {
            return (
                <div className="p-5 flex flex-col items-start gap-3">
                    <div className="text-sm text-muted">No characters yet.</div>
                    <button
                        ref={createButtonRef}
                        type="button"
                        data-testid={TestIds.charactersCreate}
                        onClick={() => setCreatorOpen(true)}
                        className="px-4 py-2 rounded-lg bg-primary text-secondary text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                    >
                        + Create new character
                    </button>
                </div>
            );
        }
        if (selectedPlayerCharacter) {
            return (
                <CharacterEditor
                    key={selectedPlayerCharacter.id}
                    character={selectedPlayerCharacter}
                    api={api}
                    onSaved={() => void loadPlayerCharacters()}
                    editMode={false}
                    allowNameEdit={false}
                    showInventoryPanel={false}
                    account={user ?? null}
                    viewerAccount={user ?? null}
                    campaign={null}
                    onStartMission={
                        onStartMissionForCharacter && user
                            ? (missionId) => onStartMissionForCharacter(missionId, selectedPlayerCharacter, user)
                            : undefined
                    }
                    onStartQuest={
                        onStartQuestForCharacter && user
                            ? (questDefId, options) =>
                                  onStartQuestForCharacter(
                                      questDefId,
                                      selectedPlayerCharacter,
                                      user,
                                      options,
                                  )
                            : undefined
                    }
                />
            );
        }
        return (
            <div className="flex h-full items-center justify-center p-6 text-muted">
                Select a character
            </div>
        );
    })();

    return (
        <>
            <PanelLayout
                title="My Characters"
                subtitle="View your campaign progress and mission history"
                left={leftPanel}
                leftSize="small"
                center={centerPanel}
                centerClassName="overflow-hidden"
            />

            {creatorOpen && (
                <CharacterCreator
                    campaignId={defaultCampaignId}
                    missionId={defaultMissionId}
                    onCreate={(characterId) => { void handlePlayerCreated(characterId); }}
                    onClose={() => setCreatorOpen(false)}
                    createCharacter={async (payload) => {
                        const { character } = await api.createCharacter(payload);
                        return { id: character.id, portraitId: character.portraitId, name: character.name };
                    }}
                    anchorRef={createButtonRef}
                    localPlayerId={user?.id}
                />
            )}
        </>
    );
}
