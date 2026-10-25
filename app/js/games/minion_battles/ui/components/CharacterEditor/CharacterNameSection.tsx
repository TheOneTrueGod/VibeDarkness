import React from 'react';
import { Check, Pencil, X } from 'lucide-react';

export const MAX_CHARACTER_NAME_LENGTH = 15;

export interface CharacterNameSectionProps {
    canEditName: boolean;
    isEditingName: boolean;
    displayName: string;
    nameDraft: string;
    saving: boolean;
    placeholder: string;
    onStartEdit: () => void;
    /** Receives the raw input value; the caller sanitizes it. */
    onNameDraftChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
}

/** Name row for the Character Editor header: pencil / inline edit with apply + cancel. */
export default function CharacterNameSection({
    canEditName,
    isEditingName,
    displayName,
    nameDraft,
    saving,
    placeholder,
    onStartEdit,
    onNameDraftChange,
    onSave,
    onCancel,
}: CharacterNameSectionProps) {
    return (
        <>
                {canEditName && !isEditingName && (
                    <button
                        type="button"
                        className="h-6 w-6 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer shrink-0"
                        onClick={() => {
                            onStartEdit();
                        }}
                        aria-label="Edit character name"
                        title="Edit character name"
                    >
                        <Pencil className="h-3 w-3" aria-hidden />
                    </button>
                )}
                {canEditName && isEditingName ? (
                    <>
                        <button
                            type="button"
                            className="h-6 w-6 rounded border border-emerald-500/70 bg-emerald-600/20 text-emerald-300 flex items-center justify-center hover:bg-emerald-600/35 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-default"
                            onClick={() => onSave()}
                            aria-label="Apply name change"
                            title="Apply name change"
                            disabled={saving}
                        >
                            <Check className="h-3 w-3" aria-hidden />
                        </button>
                        <input
                            type="text"
                            value={nameDraft}
                            onChange={(e) => onNameDraftChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    onSave();
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    onCancel();
                                }
                            }}
                            className="flex-1 min-w-0 rounded border border-border-custom bg-surface px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder={placeholder}
                            aria-label="Character name"
                            maxLength={MAX_CHARACTER_NAME_LENGTH}
                            pattern="[A-Za-z0-9]{1,15}"
                            title="Use letters and numbers only (max 15 characters)."
                            spellCheck={false}
                            autoFocus
                        />
                        <button
                            type="button"
                            className="h-6 w-6 rounded border border-red-500/70 bg-red-600/20 text-red-300 flex items-center justify-center hover:bg-red-600/35 cursor-pointer shrink-0"
                            onClick={onCancel}
                            aria-label="Cancel name change"
                            title="Cancel name change"
                        >
                            <X className="h-3 w-3" aria-hidden />
                        </button>
                    </>
                ) : (
                    <span
                        className="text-lg font-semibold text-white truncate text-left min-w-0 flex-1"
                        title={displayName}
                    >
                        {displayName}
                    </span>
                )}
        </>
    );
}
