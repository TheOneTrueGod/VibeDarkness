import React, { useState } from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getPortrait } from '../../../character_defs/portraits';
import CharacterPortrait from '../CharacterPortrait';

export function CharacterListCard({
    character,
    selected,
    onSelect,
    onDelete,
}: {
    character: CampaignCharacter;
    selected: boolean;
    onSelect: () => void;
    onDelete?: () => void;
}) {
    const portrait = getPortrait(character.portraitId);
    const displayName = character.name || portrait?.name || 'Character';
    const [confirming, setConfirming] = useState(false);

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={onSelect}
                className="block w-full text-left transition-opacity hover:opacity-95"
            >
                <CharacterPortrait
                    picture={portrait?.picture ?? ''}
                    name={displayName}
                    characterId={character.id}
                    selected={selected}
                    fill
                />
            </button>
            {confirming && onDelete ? (
                <div className="mt-1 flex items-center justify-between gap-1 rounded-lg border border-border-custom bg-red-950/40 px-2 py-1.5">
                    <span className="text-xs text-red-300">Delete?</span>
                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            className="cursor-pointer rounded border border-border-custom px-2 py-0.5 text-xs text-muted transition-colors hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => { setConfirming(false); onDelete(); }}
                            className="cursor-pointer rounded bg-red-700 px-2 py-0.5 text-xs text-white transition-colors hover:bg-red-600"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            ) : onDelete ? (
                <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="absolute right-1 top-1 z-10 cursor-pointer rounded p-1 text-zinc-500 transition-colors hover:bg-red-950/30 hover:text-red-400"
                    title="Delete character"
                    aria-label="Delete character"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            ) : null}
        </div>
    );
}
