import React, { useState } from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getPortrait } from '../../../character_defs/portraits';

export function CharacterListCard({
    character,
    selected,
    onSelect,
    onDelete,
    compact = false,
}: {
    character: CampaignCharacter;
    selected: boolean;
    onSelect: () => void;
    onDelete?: () => void;
    compact?: boolean;
}) {
    const portrait = getPortrait(character.portraitId);
    const displayName = character.name || portrait?.name || 'Character';
    const picture = portrait?.picture;
    const [confirming, setConfirming] = useState(false);
    const portraitHeight = compact ? 'h-24' : 'h-36';
    return (
        <div className={`w-full rounded-lg border-2 overflow-hidden transition-colors ${
            selected ? 'border-primary bg-surface-light' : 'border-border-custom bg-surface'
        }`}>
            <button
                type="button"
                onClick={onSelect}
                className="w-full text-left hover:bg-white/5 transition-colors block"
            >
                <div className={`${portraitHeight} bg-background flex items-center justify-center overflow-hidden`}>
                    {picture ? (
                        picture.trimStart().startsWith('<') ? (
                            <div dangerouslySetInnerHTML={{ __html: picture }} className="w-full h-full" />
                        ) : (
                            <img src={picture} alt="" className="w-full h-full object-cover" />
                        )
                    ) : null}
                </div>
            </button>
            {confirming && onDelete ? (
                <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-t border-border-custom bg-red-950/40">
                    <span className="text-xs text-red-300">Delete?</span>
                    <div className="flex gap-1">
                        <button type="button" onClick={() => setConfirming(false)} className="px-2 py-0.5 rounded text-xs border border-border-custom text-muted hover:text-white transition-colors cursor-pointer">Cancel</button>
                        <button type="button" onClick={() => { setConfirming(false); onDelete(); }} className="px-2 py-0.5 rounded text-xs bg-red-700 hover:bg-red-600 text-white transition-colors cursor-pointer">Delete</button>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-2 px-2 py-1.5 border-t border-border-custom">
                    <button type="button" onClick={onSelect} className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                        <p className="text-[10px] text-muted truncate">{character.id}</p>
                    </button>
                    {onDelete && (
                        <button
                            type="button"
                            onClick={() => setConfirming(true)}
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
            )}
        </div>
    );
}
