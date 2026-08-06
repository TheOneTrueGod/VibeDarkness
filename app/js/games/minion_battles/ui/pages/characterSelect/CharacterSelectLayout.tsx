import React from 'react';
import BattleUISlotLayout from '../../../../../components/battleUILayout/BattleUISlotLayout';

interface CharacterSelectLayoutProps {
    /** Header slot content, forwarded from GameScreen via Game.tsx. */
    headerSlot?: React.ReactNode;
    /** Right column slot content (chat), forwarded from GameScreen via Game.tsx. */
    chatSlot?: React.ReactNode;
    /** Left column slot content (player statuses). */
    leftColumn?: React.ReactNode;
    /** Bottom-left corner (loadout portrait). */
    bottomLeftCorner?: React.ReactNode;
    /** Bottom row (ability list). */
    bottomRow?: React.ReactNode;
    /** Bottom-right corner (admin tabs). */
    bottomRightCorner?: React.ReactNode;
    /** Loading/resync overlay, rendered absolutely within the center slot. */
    centerOverlay?: React.ReactNode;
    /**
     * Tighter bottom-row padding when action buttons sit above ability cards
     * (keeps the shared 238px band height).
     */
    compactBottomRow?: boolean;
    children: React.ReactNode;
}

/**
 * Character-select shell: same BattleUISlotLayout regions as pre/post-mission story
 * (header + left statuses + center body + right chat + optional bottom band).
 */
export default function CharacterSelectLayout({
    headerSlot,
    chatSlot,
    leftColumn,
    bottomLeftCorner,
    bottomRow,
    bottomRightCorner,
    centerOverlay,
    compactBottomRow = false,
    children,
}: CharacterSelectLayoutProps) {
    return (
        <BattleUISlotLayout
            header={headerSlot}
            leftColumn={leftColumn}
            rightColumn={chatSlot}
            bottomLeftCorner={bottomLeftCorner}
            bottomRow={bottomRow}
            bottomRightCorner={bottomRightCorner}
            bottomRowClassName={compactBottomRow ? 'px-3 py-0' : undefined}
            center={
                <div className="relative flex h-full w-full min-h-0 flex-col overflow-hidden">
                    <div className="mx-auto flex h-full w-full max-w-[1200px] min-h-0 flex-col px-3 sm:px-6">
                        {children}
                    </div>
                    {centerOverlay}
                </div>
            }
        />
    );
}
