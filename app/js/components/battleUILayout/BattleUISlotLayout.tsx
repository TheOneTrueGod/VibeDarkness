/**
 * BattleUISlotLayout - fixed-region slot shell shared by the battle phase and the
 * pre/post-mission story phases so both look and behave consistently.
 *
 * Every region is always present and sized independently of its contents (fixed width/height,
 * clips at that size); an omitted slot still renders its container, just empty.
 */
import React from 'react';

/** Height of the bottom band (corners + row); fixed regardless of what's slotted in. */
const BOTTOM_BAND_HEIGHT_PX = 238;

/** Content max width on very large screens, centered with a gradient fade to the edges. */
const MAX_CONTENT_WIDTH_PX = 1600;

/** How far inside the content edges the gradient's flat center zone stops, on each side. */
const GRADIENT_INSET_PX = 100;

/** tailwind.config.js `surface` (UI blue) — solid across the centered flat zone. */
const GRADIENT_CENTER_COLOR = '#16213e';
/** Darker than tailwind.config.js `background`, shown past the content edges on wide screens. */
const GRADIENT_EDGE_COLOR = '#141424';

interface BattleUISlotLayoutProps {
    header?: React.ReactNode;
    leftColumn?: React.ReactNode;
    center: React.ReactNode;
    rightColumn?: React.ReactNode;
    bottomLeftCorner?: React.ReactNode;
    /** Set false to let bottomLeftCorner's content fill the corner edge-to-edge. Defaults to true. */
    bottomLeftCornerPadded?: boolean;
    bottomRow?: React.ReactNode;
    bottomRightCorner?: React.ReactNode;
    /** Set false to let bottomRightCorner's content fill the corner edge-to-edge. Defaults to true. */
    bottomRightCornerPadded?: boolean;
    /** Optional className for the bottom-row content cell (default `px-3 py-4`). */
    bottomRowClassName?: string;
}

export default function BattleUISlotLayout({
    header,
    leftColumn,
    center,
    rightColumn,
    bottomLeftCorner,
    bottomLeftCornerPadded = true,
    bottomRow,
    bottomRightCorner,
    bottomRightCornerPadded = true,
    bottomRowClassName,
}: BattleUISlotLayoutProps) {
    return (
        <div
            className="flex h-full min-h-0 w-full justify-center"
            style={{
                background: `linear-gradient(to right, ${GRADIENT_EDGE_COLOR}, ${GRADIENT_CENTER_COLOR} calc(50% - ${
                    MAX_CONTENT_WIDTH_PX / 2 - GRADIENT_INSET_PX
                }px), ${GRADIENT_CENTER_COLOR} calc(50% + ${
                    MAX_CONTENT_WIDTH_PX / 2 - GRADIENT_INSET_PX
                }px), ${GRADIENT_EDGE_COLOR})`,
            }}
        >
            <div className="flex h-full min-h-0 w-full flex-col" style={{ maxWidth: MAX_CONTENT_WIDTH_PX }}>
                <div className="shrink-0 border-b border-l border-r border-border-custom">{header}</div>

                <div className="flex min-h-0 flex-1 flex-row">
                    <div className="flex w-80 shrink-0 min-h-0 flex-col overflow-hidden border-l border-r border-border-custom">
                        {leftColumn}
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{center}</div>
                    <div className="flex w-80 shrink-0 min-h-0 flex-col overflow-hidden border-r border-border-custom">
                        {rightColumn}
                    </div>
                </div>

                <div
                    className="flex w-full shrink-0 flex-row border-t border-border-custom bg-dark-900/80"
                    style={{ height: BOTTOM_BAND_HEIGHT_PX }}
                >
                    <div
                        className={`flex h-full w-80 shrink-0 flex-col overflow-hidden border-l border-r border-border-custom ${
                            bottomLeftCornerPadded ? 'p-4' : ''
                        }`}
                    >
                        {bottomLeftCorner}
                    </div>
                    <div
                        className={`flex h-full min-w-0 flex-1 flex-col ${
                            bottomRowClassName ?? 'px-3 py-4'
                        }`}
                    >
                        {bottomRow}
                    </div>
                    <div
                        className={`flex h-full w-80 shrink-0 flex-col overflow-hidden border-l border-r border-border-custom ${
                            bottomRightCornerPadded ? 'p-4' : ''
                        }`}
                    >
                        {bottomRightCorner}
                    </div>
                </div>
            </div>
        </div>
    );
}
