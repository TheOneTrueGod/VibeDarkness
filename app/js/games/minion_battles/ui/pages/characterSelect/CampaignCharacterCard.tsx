import React, { useMemo } from 'react';
import type { PlayerState } from '../../../../../types';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getPortrait } from '../../../character_defs/portraits';

export interface CampaignCharacterCardProps {
    character: CampaignCharacter;
    campaignId: string;
    missionId: string;
    missionTraitFilter: { allowedTraits?: string[]; disallowedTraits?: string[] } | undefined;
    isMySelection: boolean;
    /** When true, this character is required for this session and cannot be changed or deleted. */
    isLocked?: boolean;
    playerSelections: Record<string, string>;
    players: Record<string, PlayerState>;
    onSelect: (characterId: string, portraitId: string, characterDisplayName?: string) => void;
    onDelete: (characterId: string) => void;
}

export function CampaignCharacterCard({
    character,
    campaignId,
    missionId,
    missionTraitFilter,
    isMySelection,
    isLocked = false,
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
                w-[200px] h-[200px] rounded-lg overflow-hidden relative flex flex-col
                transition-all
                ${isLocked
                    ? 'border-[3px] border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)] cursor-default'
                    : isMySelection
                        ? 'border-[3px] border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)] cursor-pointer'
                        : 'border-2 border-border-custom cursor-pointer'
                }
                ${!isLocked && canUse
                    ? 'hover:-translate-y-1 hover:shadow-[0_8px_16px_rgba(0,0,0,0.4)] hover:border-primary'
                    : !isLocked ? 'opacity-70 cursor-not-allowed' : ''
                }
                bg-surface
            `}
            onClick={() => !isLocked && canUse && onSelect(character.id, character.portraitId, displayName)}
            title={isLocked ? `${displayName} — locked for this mission` : canUse ? displayName : `${displayName} — ${disallowReason ?? 'Not available'}`}
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
            <div className="w-full flex-1 overflow-hidden flex items-center justify-center bg-background relative">
                {portrait?.picture && <img src={portrait.picture} alt="" className="w-full h-full object-cover" />}
            </div>

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

            <div className="px-3 py-2 bg-surface-light flex items-center justify-between gap-1">
                <span className="text-sm font-semibold truncate">{displayName}</span>
                {selectingPlayers.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                        {selectingPlayers.map((p) => (
                            <div
                                key={p.id}
                                className="w-4 h-4 rounded-full border border-white/50 shadow-sm"
                                style={{ backgroundColor: p.color }}
                                title={p.name}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
