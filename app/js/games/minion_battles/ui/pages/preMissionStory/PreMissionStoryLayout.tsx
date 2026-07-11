import React, { useCallback, useLayoutEffect, useRef } from 'react';
import BattleUISlotLayout from '../../../../../components/battleUILayout/BattleUISlotLayout';
import {
    STORY_VIEWPORT_CONTAINER_LAPTOP_MAX_PX,
    STORY_VIEWPORT_WINDOW_LAPTOP_MAX_PX,
} from './storyViewportConstants';

export type StoryViewportLayoutMode = 'desktop' | 'laptop';

interface PreMissionStoryLayoutProps {
    backgroundImage?: string;
    bgOpacity: number;
    /** Dialogue uses bottom-aligned VN layout; choices / votes center in the scroll area. */
    contentJustify: 'end' | 'center';
    /** Notified when laptop vs desktop story chrome should be used (container height + window fallback). */
    onStoryViewportModeChange?: (mode: StoryViewportLayoutMode) => void;
    /** Header slot content, forwarded from GameScreen via Game.tsx. */
    headerSlot?: React.ReactNode;
    /** Right column slot content (chat), forwarded from GameScreen via Game.tsx. */
    chatSlot?: React.ReactNode;
    /** Bottom row slot content (player statuses). */
    bottomRow?: React.ReactNode;
    /** Loading/resync overlay, rendered absolutely within the center slot. */
    centerOverlay?: React.ReactNode;
    children: React.ReactNode;
}

export default function PreMissionStoryLayout({
    backgroundImage,
    bgOpacity,
    contentJustify,
    onStoryViewportModeChange,
    headerSlot,
    chatSlot,
    bottomRow,
    centerOverlay,
    children,
}: PreMissionStoryLayoutProps) {
    const justify = contentJustify === 'center' ? 'justify-center' : 'justify-end';
    const scrollRegionRef = useRef<HTMLDivElement>(null);
    const lastModeRef = useRef<StoryViewportLayoutMode | null>(null);

    const emitMode = useCallback(
        (mode: StoryViewportLayoutMode) => {
            if (lastModeRef.current === mode) return;
            lastModeRef.current = mode;
            onStoryViewportModeChange?.(mode);
        },
        [onStoryViewportModeChange],
    );

    useLayoutEffect(() => {
        if (!onStoryViewportModeChange) return;

        const scrollEl = scrollRegionRef.current;
        const compute = () => {
            const h = scrollEl?.getBoundingClientRect().height ?? 0;
            const winH = window.innerHeight;
            const laptop =
                (h > 0 && h < STORY_VIEWPORT_CONTAINER_LAPTOP_MAX_PX) ||
                winH < STORY_VIEWPORT_WINDOW_LAPTOP_MAX_PX;
            emitMode(laptop ? 'laptop' : 'desktop');
        };

        compute();

        let ro: ResizeObserver | undefined;
        if (scrollEl && typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => compute());
            ro.observe(scrollEl);
        }
        window.addEventListener('resize', compute);
        return () => {
            ro?.disconnect();
            window.removeEventListener('resize', compute);
        };
    }, [onStoryViewportModeChange, emitMode, contentJustify]);

    return (
        <BattleUISlotLayout
            header={headerSlot}
            rightColumn={chatSlot}
            bottomRow={bottomRow}
            center={
                <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
                    {backgroundImage && (
                        <div
                            className="absolute inset-0 bg-cover bg-center transition-opacity duration-500 z-0"
                            style={{ backgroundImage: `url(${backgroundImage})`, opacity: bgOpacity }}
                        />
                    )}
                    <div
                        ref={scrollRegionRef}
                        className={`relative z-10 flex-1 flex flex-col min-h-0 ${justify} items-center overflow-y-auto overflow-x-hidden`}
                    >
                        <div
                            className={`w-full max-w-[1200px] flex flex-col flex-1 min-h-0 ${justify} mx-auto px-3 sm:px-6 min-w-0`}
                        >
                            {children}
                        </div>
                    </div>
                    {centerOverlay}
                </div>
            }
        />
    );
}
