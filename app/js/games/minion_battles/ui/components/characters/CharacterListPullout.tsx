import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { TestIds } from '../../../../../testing/testIds';

/** Matches the Character Editor left column so the pull-out covers it. */
export const CHARACTER_EDITOR_LEFT_WIDTH_CLASS = 'w-[232px]';

export const CHANGE_CHARACTERS_LABEL = 'Change Characters';

interface CharacterListPulloutProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
}

/** Left-edge drawer that slides over the character-editor sidebar. */
export function CharacterListPullout({ open, onClose, children }: CharacterListPulloutProps) {
    return (
        <div
            className={`absolute inset-y-0 left-0 z-20 flex ${CHARACTER_EDITOR_LEFT_WIDTH_CLASS} flex-col border-r border-border-custom bg-surface shadow-lg transition-transform duration-200 ease-out ${
                open ? 'translate-x-0' : '-translate-x-full pointer-events-none'
            }`}
            data-testid={TestIds.charactersListPullout}
            aria-hidden={!open}
        >
            <div className="flex shrink-0 justify-end p-2">
                <button
                    type="button"
                    data-testid={TestIds.charactersListClose}
                    onClick={onClose}
                    className="h-7 w-7 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer"
                    aria-label="Close character list"
                    title="Close"
                >
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
    );
}

interface CharacterListPulloutHostProps {
    list: ReactNode;
    open: boolean;
    onClose: () => void;
    children: ReactNode;
}

/** Positions {@link CharacterListPullout} over the left of a full-height editor. */
export function CharacterListPulloutHost({
    list,
    open,
    onClose,
    children,
}: CharacterListPulloutHostProps) {
    return (
        <div className="relative h-full min-h-0 overflow-hidden">
            {children}
            <CharacterListPullout open={open} onClose={onClose}>
                {list}
            </CharacterListPullout>
        </div>
    );
}
