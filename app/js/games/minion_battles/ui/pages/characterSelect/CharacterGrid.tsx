import React, { useMemo } from 'react';
import type { PlayerState } from '../../../../../types';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { SPECTATOR_ID, CONTROL_ENEMY_ALPHA_WOLF } from '../../../state';
import { CampaignCharacterCard } from './CampaignCharacterCard';
import { RequiredPlayerSlot } from './RequiredPlayerSlot';
import { SpectatorCard } from './SpectatorCard';
import { ControlEnemyCard } from './ControlEnemyCard';
import { CreateCharacterCard } from './CreateCharacterCard';

interface CharacterGridProps {
    charactersLoading: boolean;
    myLockedCharacterId: string | null;
    sortedCharacters: CampaignCharacter[];
    campaignId: string;
    missionId: string;
    missionTraitFilter: { allowedTraits?: string[]; disallowedTraits?: string[] } | undefined;
    mySelection: string | null;
    characterSelections: Record<string, string>;
    players: Record<string, PlayerState>;
    resolvedRequiredPlayers: Array<{ playerName: string; characterId: string; connectedPlayer: PlayerState | null }>;
    isAdmin: boolean;
    controlEnemySelectedBy: string | null;
    playerId: string;
    onSelect: (characterId: string, portraitId: string, characterDisplayName?: string) => void;
    onDelete: (characterId: string) => void;
    onOpenCreator: () => void;
    setCreateCardRef: (el: HTMLDivElement | null) => void;
}

export function CharacterGrid({
    charactersLoading,
    myLockedCharacterId,
    sortedCharacters,
    campaignId,
    missionId,
    missionTraitFilter,
    mySelection,
    characterSelections,
    players,
    resolvedRequiredPlayers,
    isAdmin,
    controlEnemySelectedBy,
    playerId,
    onSelect,
    onDelete,
    onOpenCreator,
    setCreateCardRef,
}: CharacterGridProps) {
    // Show the local player's current selection as an ordinary, unselected card so it
    // can always be picked again — even when it's their only character.
    const otherPlayerSelections = useMemo(() => {
        const { [playerId]: _mine, ...rest } = characterSelections;
        return rest;
    }, [characterSelections, playerId]);

    return (
        <div className="flex-1 overflow-auto px-5 pb-5 pt-4">
            <div className="grid grid-cols-[repeat(auto-fill,200px)] justify-center gap-6">
                {charactersLoading ? (
                    <div className="w-[200px] h-[200px] flex items-center justify-center text-gray-400">
                        Loading…
                    </div>
                ) : myLockedCharacterId ? (
                    (() => {
                        const lockedChar = sortedCharacters.find((c) => c.id === myLockedCharacterId);
                        return lockedChar ? (
                            <CampaignCharacterCard
                                key={lockedChar.id}
                                character={lockedChar}
                                campaignId={campaignId}
                                missionId={missionId}
                                missionTraitFilter={missionTraitFilter}
                                isLocked
                                playerSelections={otherPlayerSelections}
                                players={players}
                                onSelect={onSelect}
                                onDelete={onDelete}
                            />
                        ) : null;
                    })()
                ) : (
                    sortedCharacters.map((char) => (
                        <CampaignCharacterCard
                            key={char.id}
                            character={char}
                            campaignId={campaignId}
                            missionId={missionId}
                            missionTraitFilter={missionTraitFilter}
                            playerSelections={otherPlayerSelections}
                            players={players}
                            onSelect={onSelect}
                            onDelete={onDelete}
                        />
                    ))
                )}
                {resolvedRequiredPlayers
                    .filter((r) => r.connectedPlayer === null)
                    .map((r) => (
                        <RequiredPlayerSlot key={r.playerName} playerName={r.playerName} />
                    ))}
                {!myLockedCharacterId && (
                    <>
                        <CreateCharacterCard ref={setCreateCardRef} onClick={onOpenCreator} />
                        <SpectatorCard
                            isMySelection={mySelection === SPECTATOR_ID}
                            onSelect={() => onSelect(SPECTATOR_ID, '')}
                        />
                        {missionId === 'monster' && isAdmin && (
                            <ControlEnemyCard
                                isMySelection={mySelection === CONTROL_ENEMY_ALPHA_WOLF}
                                isDisabled={controlEnemySelectedBy != null && controlEnemySelectedBy !== playerId}
                                onSelect={() => onSelect(CONTROL_ENEMY_ALPHA_WOLF, '')}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
