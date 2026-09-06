import React, { useRef, useState } from 'react';
import { AnchoredPortalTooltip } from '../../components/AnchoredPortalTooltip';
import { TestIds } from '../../../../../testing/testIds';

export const UNAVAILABLE_CHOICE_REASON = 'Unavailable';

interface DisabledStoryChoiceTooltipProps {
    reason?: string;
    children: React.ReactNode;
}

/** Hover tip for a disabled story choice — wraps the button so disabled controls still receive hover. */
export default function DisabledStoryChoiceTooltip({
    reason,
    children,
}: DisabledStoryChoiceTooltipProps) {
    const anchorRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const text = reason ?? UNAVAILABLE_CHOICE_REASON;

    return (
        <div
            ref={anchorRef}
            className="flex h-full min-h-0 w-full min-w-0"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            {children}
            <AnchoredPortalTooltip
                anchorRef={anchorRef}
                open={open}
                placement="top"
                className="max-w-[220px] px-2.5 py-1.5 text-left"
            >
                <p
                    data-testid={TestIds.storyChoiceDisabledTooltip}
                    className="text-xs leading-snug"
                >
                    {text}
                </p>
            </AnchoredPortalTooltip>
        </div>
    );
}
