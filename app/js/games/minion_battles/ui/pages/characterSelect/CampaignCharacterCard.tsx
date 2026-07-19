import React, { useMemo } from 'react';
import type { PlayerState } from '../../../../../types';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getPortrait } from '../../../character_defs/portraits';
import CharacterPortrait from '../../components/CharacterPortrait';

export interface CampaignCharacterCardProps {
    character: CampaignCharacter;
    campaignId: string;
    missionId: string;
    missionTraitFilter: { allowedTraits?: string[]; disallowedTraits?: string[] } | undefined;
    /** When true, this character is required for this session and cannot be changed or deleted. */
    isLocked?: boolean;
    /** Local player's current selection. */
    isMySelection?: boolean;
    playerSelections: Record<string, string>;
    players: Record<string, PlayerState>;
    onSelect: (characterId: string, portraitId: string, characterDisplayName?: string) => void;
    onDelete: (characterId: string) => void;
}

const PORTRAIT_SIZE_PX = 200;

export function CampaignCharacterCard({
    character,
    campaignId,
    missionId,
    missionTraitFilter,
    isLocked = false,
    isMySelection = false,
    playerSelections,
    players,
    onSelect,
    onDelete,
}: CampaignCharacterCardProps) {
    const portrait = getPortrait(character.portraitId);
    const displayName = character.name || (portrait?.name ?? 'Character');
    const canUse = isLocked || character.canBeUsedOnMission(campaignId, missionId, missionTraitFilter);
    const disallowReason = isLocked ? null : character.getDisallowReason(campaignId, missionId, missionTraitFilter);

    const selectingPlayers = useMemo(() => {
        return Object.entries(playerSelections)
            .filter(([, charId]) => charId === character.id)
            .map(([pid]) => players[pid])
            .filter(Boolean);
    }, [playerSelections, character.id, players]);

    return (
        <div
            className={`
                relative transition-all
                ${canUse
                    ? 'cursor-pointer hover:-translate-y-1'
                    : 'opacity-70 cursor-not-allowed'
                }
            `}
            style={{ width: PORTRAIT_SIZE_PX }}
            onClick={() => canUse && onSelect(character.id, character.portraitId, displayName)}
            title={isLocked ? `${displayName} — required for this mission` : canUse ? displayName : `${displayName} — ${disallowReason ?? 'Not available'}`}
        >
            {!isLocked && (
                <button
                    type="button"
                    className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-red-600/90 hover:bg-red-500 text-white text-sm font-bold flex items-center justify-center shadow-lg cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); onDelete(character.id); }}
                    title="Delete character"
                    aria-label="Delete character"
                >
                    ×
                </button>
            )}

            <CharacterPortrait
                picture={portrait?.picture ?? ''}
                name={displayName}
                selected={isMySelection}
                sizePx={PORTRAIT_SIZE_PX}
                className={canUse && !isMySelection ? 'hover:border-primary' : ''}
                footerTrailing={
                    selectingPlayers.length > 0 ? (
                        <>
                            {selectingPlayers.map((p) => (
                                <div
                                    key={p.id}
                                    className="w-4 h-4 rounded-full border border-white/50 shadow-sm"
                                    style={{ backgroundColor: p.color }}
                                    title={p.name}
                                />
                            ))}
                        </>
                    ) : undefined
                }
            />

            {disallowReason != null && (
                <div className="absolute inset-0 bottom-8 flex items-center justify-center pointer-events-none overflow-hidden">
                    <span
                        className="text-yellow-400 font-black text-lg tracking-widest opacity-90 select-none uppercase"
                        style={{ transform: 'rotate(-35deg)' }}
                    >
                        {disallowReason}
                    </span>
                </div>
            )}
        </div>
    );
}
