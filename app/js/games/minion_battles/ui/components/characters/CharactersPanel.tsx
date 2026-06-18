import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AccountState, PlayerState } from '../../../../../types';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import CharacterEditor from '../CharacterEditor/CharacterEditor';
import CharacterCreator from '../CharacterEditor/CharacterCreator';
import { fromCampaignCharacterData, type CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../../../character_defs/campaignCharacterTypes';
import { ALL_PLAYER_ITEMS } from '../../../character_defs/items';
import { useUser } from '../../../../../contexts/UserContext';
import { STORYLINES } from '../../../storylines/index';
import PanelLayout from '../../../../../components/minionBattlesHomePage/PanelLayout';
import { playerCharactersPath, playerCharacterPath } from '../../../../../components/ability-tests/campaignTabPaths';
import { ItemCard } from './ItemCard';
import { CharacterCard } from './CharacterCard';
import { CharacterListCard } from './CharacterListCard';
import { PlayerCard } from './PlayerCard';
import { buildCounts, sortByLastUsed, sortPlayers, getItemName } from './characterUtils';

interface CharactersPanelProps {
    api: MinionBattlesApi;
    players?: Record<string, PlayerState>;
    onStartMissionForCharacter?: (missionId: string, character: CampaignCharacter, ownerAccount: AccountState) => void;
}

export default function CharactersPanel({ api, players, onStartMissionForCharacter }: CharactersPanelProps) {
    const { user } = useUser();
    const isAdmin = user?.role === 'admin';

    // ── Admin state ──────────────────────────────────────────────────────────
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
    const [adminDetails, setAdminDetails] = useState<{
        account: AccountState;
        characters: CampaignCharacter[];
    } | null>(null);
    const [adminLoading, setAdminLoading] = useState(false);
    const [adminSelectedCharId, setAdminSelectedCharId] = useState<string | null>(null);
    const [grantItemId, setGrantItemId] = useState(ALL_PLAYER_ITEMS[0] ?? '');

    // ── Player state ─────────────────────────────────────────────────────────
    const { playerId: playerIdParam, characterId: characterIdParam } = useParams<{ playerId?: string; characterId?: string }>();
    const navigate = useNavigate();
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

    useEffect(() => {
        if (!isAdmin || !selectedPlayerId) {
            setAdminDetails(null);
            setAdminSelectedCharId(null);
            return;
        }
        void loadAdminDetails(selectedPlayerId);
    }, [isAdmin, loadAdminDetails, selectedPlayerId]);

    const sortedAdminCharacters = useMemo(
        () => (adminDetails ? sortByLastUsed(adminDetails.characters) : []),
        [adminDetails],
    );

    useEffect(() => {
        if (!adminDetails) { setAdminSelectedCharId(null); return; }
        if (sortedAdminCharacters.length === 0) { setAdminSelectedCharId(null); return; }
        if (!adminSelectedCharId || !sortedAdminCharacters.some((c) => c.id === adminSelectedCharId)) {
            setAdminSelectedCharId(sortedAdminCharacters[0].id);
        }
    }, [adminDetails, adminSelectedCharId, sortedAdminCharacters]);

    const selectedAdminCharacter = useMemo(
        () => adminDetails?.characters.find((c) => c.id === adminSelectedCharId) ?? null,
        [adminDetails, adminSelectedCharId],
    );

    const inventoryCounts = useMemo(
        () => buildCounts(adminDetails?.account.inventoryItemIds ?? []),
        [adminDetails],
    );

    const refreshAdminPlayer = useCallback(async () => {
        if (!selectedPlayerId) return;
        await loadAdminDetails(selectedPlayerId);
    }, [loadAdminDetails, selectedPlayerId]);

    const handleGrantItem = useCallback(async () => {
        if (!selectedPlayerId || !grantItemId) return;
        try {
            await api.grantAccountItem(selectedPlayerId, grantItemId);
            await refreshAdminPlayer();
        } catch (error) {
            console.error('Failed to grant item:', error);
        }
    }, [grantItemId, api, refreshAdminPlayer, selectedPlayerId]);

    const handleRemoveItem = useCallback(async (itemId: string) => {
        if (!selectedPlayerId) return;
        try {
            await api.removeAccountItem(selectedPlayerId, itemId);
            await refreshAdminPlayer();
        } catch (error) {
            console.error('Failed to remove item:', error);
        }
    }, [api, refreshAdminPlayer, selectedPlayerId]);

    const handleInventoryDragStart = useCallback((itemId: string, event: React.DragEvent<HTMLDivElement>) => {
        event.dataTransfer.setData('text/plain', itemId);
        event.dataTransfer.effectAllowed = 'copy';
    }, []);

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

    // ── Admin render ──────────────────────────────────────────────────────────
    if (isAdmin) {
        const playerList = sortPlayers(players ?? {});

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

        const selectedPlayer = players ? players[selectedPlayerId] ?? null : null;

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
                                        selected={adminSelectedCharId === character.id}
                                        onSelect={() => setAdminSelectedCharId(character.id)}
                                        compact
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 overflow-hidden rounded-lg border border-border-custom bg-surface">
                            {selectedAdminCharacter ? (
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
                onClick={() => setCreatorOpen(true)}
                className="w-full rounded-lg border-2 border-dashed border-border-custom px-4 py-3 text-sm text-muted hover:border-primary hover:text-white transition-colors cursor-pointer text-left"
            >
                + Create new character
            </button>
        </div>
    ) : undefined;

    const centerPanel = (() => {
        if (playerLoading && playerCharacters.length === 0) {
            return <div className="p-5 text-sm text-muted">Loading characters…</div>;
        }
        if (!playerLoading && playerCharacters.length === 0) {
            return (
                <div className="p-5 flex flex-col items-start gap-3">
                    <div className="text-sm text-muted">No characters yet.</div>
                    <button
                        ref={createButtonRef}
                        type="button"
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
