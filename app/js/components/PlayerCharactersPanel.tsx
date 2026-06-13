/**
 * Characters panel for non-admin players.
 * Shows the current user's characters with Mission Map and Upgrades tabs.
 * No account selector, no inventory management, no admin controls.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccountState } from '../types';
import { LobbyClient } from '../LobbyClient';
import CharacterEditor from '../games/minion_battles/ui/components/CharacterEditor/CharacterEditor';
import { MinionBattlesApi } from '../games/minion_battles/api/minionBattlesApi';
import { fromCampaignCharacterData, type CampaignCharacter } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../games/minion_battles/character_defs/campaignCharacterTypes';
import { getPortrait } from '../games/minion_battles/character_defs/portraits';
import { useUser } from '../contexts/UserContext';

function CharacterCard({
    character,
    selected,
    onSelect,
}: {
    character: CampaignCharacter;
    selected: boolean;
    onSelect: () => void;
}) {
    const portrait = getPortrait(character.portraitId);
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
            <div className="flex items-center gap-3">
                {portrait && (
                    <div
                        className="h-10 w-10 shrink-0 rounded-full border border-border-custom overflow-hidden bg-dark-700"
                        dangerouslySetInnerHTML={{ __html: portrait.picture ?? '' }}
                    />
                )}
                <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{character.name}</p>
                    <p className="text-xs text-muted truncate">{character.campaignId}</p>
                </div>
            </div>
        </button>
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
                    <div className="text-sm text-muted">No characters found.</div>
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
                                />
                            ))}
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
        </div>
    );
}
