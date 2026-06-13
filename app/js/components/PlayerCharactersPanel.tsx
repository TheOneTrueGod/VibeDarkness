/**
 * Characters panel for non-admin players.
 * Shows the current user's characters with Mission Map and Upgrades tabs.
 * No account selector, no inventory management, no admin controls.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccountState } from '../types';
import { LobbyClient } from '../LobbyClient';
import CharacterEditor from '../games/minion_battles/ui/components/CharacterEditor/CharacterEditor';
import CharacterCreator from '../games/minion_battles/ui/components/CharacterEditor/CharacterCreator';
import { MinionBattlesApi } from '../games/minion_battles/api/minionBattlesApi';
import { fromCampaignCharacterData, type CampaignCharacter } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../games/minion_battles/character_defs/campaignCharacterTypes';
import { getPortrait } from '../games/minion_battles/character_defs/portraits';
import { useUser } from '../contexts/UserContext';
import { STORYLINES } from '../games/minion_battles/storylines/index';

function CharacterCard({
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
    const [confirming, setConfirming] = useState(false);
    return (
        <div className={`w-full rounded-lg border-2 transition-colors ${
            selected
                ? 'border-primary bg-surface-light shadow-[0_0_0_1px_rgba(78,205,196,0.2)]'
                : 'border-border-custom bg-surface'
        }`}>
            <button
                type="button"
                onClick={onSelect}
                className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors rounded-lg"
            >
                <div className="flex items-center gap-3">
                    {portrait?.picture && (
                        <div className="h-10 w-10 shrink-0 rounded-full border border-border-custom overflow-hidden bg-dark-700">
                            {portrait.picture.trimStart().startsWith('<') ? (
                                <div dangerouslySetInnerHTML={{ __html: portrait.picture }} className="w-full h-full" />
                            ) : (
                                <img src={portrait.picture} alt="" className="w-full h-full object-cover" />
                            )}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white truncate">{character.name}</p>
                        <p className="text-xs text-muted truncate">{character.campaignId}</p>
                    </div>
                    {!confirming && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
                            className="shrink-0 p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                            title="Delete character"
                            aria-label="Delete character"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                </div>
            </button>
            {confirming && (
                <div className="flex items-center justify-between gap-1 px-4 py-2 border-t border-border-custom bg-red-950/40">
                    <span className="text-xs text-red-300">Delete?</span>
                    <div className="flex gap-1">
                        <button type="button" onClick={() => setConfirming(false)} className="px-2 py-0.5 rounded text-xs border border-border-custom text-muted hover:text-white transition-colors cursor-pointer">Cancel</button>
                        <button type="button" onClick={() => { setConfirming(false); onDelete(); }} className="px-2 py-0.5 rounded text-xs bg-red-700 hover:bg-red-600 text-white transition-colors cursor-pointer">Delete</button>
                    </div>
                </div>
            )}
        </div>
    );
}

interface PlayerCharactersPanelProps {
    lobbyClient: LobbyClient;
    onStartMissionForCharacter?: (missionId: string, character: CampaignCharacter, ownerAccount: AccountState) => void;
}

export default function PlayerCharactersPanel({ lobbyClient, onStartMissionForCharacter }: PlayerCharactersPanelProps) {
    const { user } = useUser();
    const api = useMemo(() => new MinionBattlesApi(lobbyClient, '', '', ''), [lobbyClient]);

    const [characters, setCharacters] = useState<CampaignCharacter[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
    const [creatorOpen, setCreatorOpen] = useState(false);
    const createButtonRef = useRef<HTMLButtonElement>(null);

    const loadCharacters = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getMyCharacters();
            const mapped = (data as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d));
            setCharacters(mapped);
            if (mapped.length > 0 && !selectedCharacterId) {
                setSelectedCharacterId(mapped[0].id);
            }
        } catch (err) {
            console.error('Failed to load characters:', err);
        } finally {
            setLoading(false);
        }
    }, [api, selectedCharacterId]);

    useEffect(() => {
        void loadCharacters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedCharacter = useMemo(
        () => characters.find((c) => c.id === selectedCharacterId) ?? null,
        [characters, selectedCharacterId],
    );

    const handleSaved = useCallback(async () => {
        await loadCharacters();
    }, [loadCharacters]);

    const handleDeleteCharacter = useCallback(async (characterId: string) => {
        await api.deleteCharacter(characterId);
        if (selectedCharacterId === characterId) setSelectedCharacterId(null);
        await loadCharacters();
    }, [api, selectedCharacterId, loadCharacters]);

    const handleCreated = useCallback(async (characterId: string) => {
        setCreatorOpen(false);
        await loadCharacters();
        setSelectedCharacterId(characterId);
    }, [loadCharacters]);

    // Default campaign for new characters: first character's campaign, or first storyline.
    const defaultCampaignId = characters[0]?.campaignId ?? STORYLINES[0]?.id ?? 'world_of_darkness';
    const defaultMissionId = STORYLINES.find((s) => s.id === defaultCampaignId)?.startMissionId ?? STORYLINES[0]?.startMissionId ?? 'dark_awakening';

    return (
        <div className="w-full h-full overflow-auto p-5">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
                <div>
                    <h2 className="text-[32px] font-bold">My Characters</h2>
                    <p className="text-sm text-muted">View your campaign progress and mission history</p>
                </div>

                {loading && characters.length === 0 && (
                    <div className="text-sm text-muted">Loading characters…</div>
                )}
                {!loading && characters.length === 0 && (
                    <div className="flex flex-col items-start gap-3">
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
                )}

                {characters.length > 0 && (
                    <div className="flex gap-5 h-[700px]">
                        {/* Character list */}
                        <div className="w-56 shrink-0 flex flex-col gap-2 overflow-auto">
                            {characters.map((c) => (
                                <CharacterCard
                                    key={c.id}
                                    character={c}
                                    selected={c.id === selectedCharacterId}
                                    onSelect={() => setSelectedCharacterId(c.id)}
                                    onDelete={() => void handleDeleteCharacter(c.id)}
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

                        {/* Character editor */}
                        <div className="flex-1 min-w-0 overflow-hidden rounded-lg border border-border-custom bg-surface">
                            {selectedCharacter ? (
                                <CharacterEditor
                                    key={selectedCharacter.id}
                                    character={selectedCharacter}
                                    api={api}
                                    onSaved={handleSaved}
                                    editMode={false}
                                    allowNameEdit={false}
                                    showInventoryPanel={false}
                                    account={user ?? null}
                                    viewerAccount={user ?? null}
                                    campaign={null}
                                    onStartMission={
                                        onStartMissionForCharacter && user
                                            ? (missionId) =>
                                                  onStartMissionForCharacter(missionId, selectedCharacter, user)
                                            : undefined
                                    }
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center p-6 text-muted">
                                    Select a character
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {creatorOpen && (
                <CharacterCreator
                    campaignId={defaultCampaignId}
                    missionId={defaultMissionId}
                    onCreate={(characterId) => { void handleCreated(characterId); }}
                    onClose={() => setCreatorOpen(false)}
                    createCharacter={async (payload) => {
                        const { character } = await api.createCharacter(payload);
                        return { id: character.id, portraitId: character.portraitId, name: character.name };
                    }}
                    anchorRef={createButtonRef}
                    localPlayerId={user?.id}
                />
            )}
        </div>
    );
}
