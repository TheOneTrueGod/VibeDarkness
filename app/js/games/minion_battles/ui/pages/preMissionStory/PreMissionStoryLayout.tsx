import React from 'react';
import BattleUISlotLayout from '../../../../../components/battleUILayout/BattleUISlotLayout';

interface PreMissionStoryLayoutProps {
    backgroundImage?: string;
    bgOpacity: number;
    /** Dialogue/VN text stays bottom-aligned; group votes center in the scroll area. Defaults to 'center'. */
    contentJustify?: 'end' | 'center';
    /** Header slot content, forwarded from GameScreen via Game.tsx. */
    headerSlot?: React.ReactNode;
    /** Right column slot content (chat), forwarded from GameScreen via Game.tsx. */
    chatSlot?: React.ReactNode;
    /** Left column slot content (player statuses). */
    leftColumn?: React.ReactNode;
    /** Bottom-left corner slot content (e.g. dialogue speaker portrait). */
    bottomLeftCorner?: React.ReactNode;
    /** Set false to let bottomLeftCorner's content fill the corner edge-to-edge. Defaults to true. */
    bottomLeftCornerPadded?: boolean;
    /** Bottom-right corner slot content (e.g. dialogue speaker portrait). */
    bottomRightCorner?: React.ReactNode;
    /** Set false to let bottomRightCorner's content fill the corner edge-to-edge. Defaults to true. */
    bottomRightCornerPadded?: boolean;
    /** Bottom row slot content (e.g. dialogue text or choice grid). */
    bottomRow?: React.ReactNode;
    /** Optional className for the bottom-row content cell. */
    bottomRowClassName?: string;
    /** Floating action (e.g. dialogue "Next"), pinned bottom-center of the center slot, just above the bottom row. */
    centerFloatingNext?: React.ReactNode;
    /** Loading/resync overlay, rendered absolutely within the center slot. */
    centerOverlay?: React.ReactNode;
    children: React.ReactNode;
}

export default function PreMissionStoryLayout({
    backgroundImage,
    bgOpacity,
    contentJustify = 'center',
    headerSlot,
    chatSlot,
    leftColumn,
    bottomLeftCorner,
    bottomLeftCornerPadded,
    bottomRightCorner,
    bottomRightCornerPadded,
    bottomRow,
    bottomRowClassName,
    centerFloatingNext,
    centerOverlay,
    children,
}: PreMissionStoryLayoutProps) {
    const justify = contentJustify === 'center' ? 'justify-center' : 'justify-end';
    return (
        <BattleUISlotLayout
            header={headerSlot}
            leftColumn={leftColumn}
            rightColumn={chatSlot}
            bottomLeftCorner={bottomLeftCorner}
            bottomLeftCornerPadded={bottomLeftCornerPadded}
            bottomRightCorner={bottomRightCorner}
            bottomRightCornerPadded={bottomRightCornerPadded}
            bottomRow={bottomRow}
            bottomRowClassName={bottomRowClassName}
            center={
                <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
                    {backgroundImage && (
                        <div
                            className="absolute inset-0 bg-cover bg-center transition-opacity duration-500 z-0"
                            style={{ backgroundImage: `url(${backgroundImage})`, opacity: bgOpacity }}
                        />
                    )}
                    <div className={`relative z-10 flex-1 flex flex-col min-h-0 ${justify} items-center overflow-y-auto overflow-x-hidden`}>
                        <div className={`w-full max-w-[1200px] flex flex-col flex-1 min-h-0 ${justify} mx-auto px-3 sm:px-6 min-w-0`}>
                            {children}
                        </div>
                    </div>
                    {centerFloatingNext && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-4">
                            <div className="pointer-events-auto">{centerFloatingNext}</div>
                        </div>
                    )}
                    {centerOverlay}
                </div>
            }
        />
    );
}
