import React from 'react';
import type { ReactNode } from 'react';
import CardWithTitle from '../CardWithTitle';

type LeftSize = 'small' | 'medium';

const LEFT_SIZE_CLASSES: Record<LeftSize, string> = {
    small: 'w-56',
    medium: 'w-80',
};

interface PanelLayoutProps {
    /**
     * Structured title bar: renders a consistent header with title on the left and
     * optional subtitle + right-side actions. Preferred over `header` for new panels.
     */
    title?: ReactNode;
    /** Subtitle rendered below the title in the structured title bar. */
    subtitle?: ReactNode;
    /** Right-side content in the structured title bar (buttons, selectors, etc). */
    actions?: ReactNode;
    /** Overrides the default card title heading class. */
    titleClassName?: string;

    /**
     * Fully custom header content. Used when `title` is not set. Kept for panels
     * that need a non-standard header layout (e.g. a toolbar with no page title).
     */
    header?: ReactNode;
    /** Extra classes on the custom header container. Default: 'px-4 py-3 border-b border-border-custom shrink-0'. */
    headerClassName?: string;

    /** Left column content (optional — omit to hide the left column entirely). */
    left?: ReactNode;
    /**
     * Preset left column width. 'small' = w-56 (ability-test sidebar),
     * 'medium' = w-80 (bestiary / lobby archive). Takes precedence over leftWidth.
     */
    leftSize?: LeftSize;
    /** Tailwind width class for the left column. Ignored when leftSize is set. Default: 'w-80'. */
    leftWidth?: string;
    /**
     * Extra classes on the left column div. Default: 'overflow-y-auto'.
     * Pass 'flex flex-col overflow-hidden' when the column has its own internal sub-layout
     * (e.g. a pinned header row + a scrollable list below).
     */
    leftClassName?: string;

    /** Center column content (required). */
    center: ReactNode;
    /**
     * Extra classes on the center column div. Default: 'overflow-y-auto'.
     * Pass 'overflow-hidden' when the child component manages its own scroll.
     * Pass 'overflow-auto' for both-axis scroll (e.g. a canvas wider than the viewport).
     */
    centerClassName?: string;

    /** Right column content (optional — omit to hide the right column entirely). */
    right?: ReactNode;
    /** Tailwind width class for the right column. Default: 'w-56'. */
    rightWidth?: string;
    /** Extra classes on the right column div. Default: 'overflow-y-auto'. */
    rightClassName?: string;
}

/**
 * Multi-column body inside {@link CardWithTitle}.
 * Height and max-width come from the parent (campaign-home tab frame, or lobby slot).
 */
export default function PanelLayout({
    title,
    subtitle,
    actions,
    titleClassName,
    header,
    headerClassName,
    left,
    leftSize,
    leftWidth = 'w-80',
    leftClassName,
    center,
    centerClassName,
    right,
    rightWidth = 'w-56',
    rightClassName,
}: PanelLayoutProps) {
    const resolvedLeftWidth = leftSize != null ? LEFT_SIZE_CLASSES[leftSize] : leftWidth;
    const columns = (
        <>
            {left != null && (
                <div className={`${resolvedLeftWidth} shrink-0 border-r border-border-custom ${leftClassName ?? 'overflow-y-auto'}`}>
                    {left}
                </div>
            )}
            <div className={`flex-1 min-w-0 ${centerClassName ?? 'overflow-y-auto'}`}>
                {center}
            </div>
            {right != null && (
                <div className={`${rightWidth} shrink-0 border-l border-border-custom ${rightClassName ?? 'overflow-y-auto'}`}>
                    {right}
                </div>
            )}
        </>
    );

    if (title != null) {
        return (
            <CardWithTitle title={title} subtitle={subtitle} actions={actions} titleClassName={titleClassName} bodyClassName="overflow-hidden">
                <div className="flex h-full min-h-0">{columns}</div>
            </CardWithTitle>
        );
    }

    return (
        <div className="h-full w-full rounded-lg border border-border-custom bg-surface overflow-hidden flex flex-col text-white">
            {header != null ? (
                <div className={headerClassName ?? 'px-4 py-3 border-b border-border-custom shrink-0'}>
                    {header}
                </div>
            ) : null}
            <div className="flex flex-1 min-h-0">{columns}</div>
        </div>
    );
}
