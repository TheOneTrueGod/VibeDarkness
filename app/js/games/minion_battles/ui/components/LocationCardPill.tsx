/**
 * LocationCardPill — pill showing a location card with icon, name, and optional count.
 * On hover/focus, opens a tooltip via AnchoredPortalTooltip with description and modifications.
 */

import React, { useRef, useState } from 'react';
import { Mountain } from 'lucide-react';
import type { LocationCardInstance } from '../../storylines/locationCards';
import { AnchoredPortalTooltip, PORTAL_TOOLTIP_SURFACE_CLASS } from './AnchoredPortalTooltip';
import { RESOURCE_PILL_SIZE_CLASS, type ResourcePillSize } from '../../../../components/ResourcePill';
import { getLocationCardPillView } from './locationCardPillView';

export interface LocationCardPillProps {
    /** The numeric ID of the location card. */
    locationCardId: number;
    /** Optional instance with displayNameOverride and modifications. */
    instance?: LocationCardInstance;
    /** Pill size (small, medium, default). Defaults to 'default'. */
    size?: ResourcePillSize;
    /** Optional count displayed as ×N. */
    count?: number;
    /** Optional CSS class to apply to the pill. */
    className?: string;
}

export default function LocationCardPill({
    locationCardId,
    instance,
    size = 'default',
    count,
    className = '',
}: LocationCardPillProps) {
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const pillView = getLocationCardPillView(locationCardId, instance);

    // Unknown id: render muted pill with no tooltip.
    if (!pillView) {
        const sizeClass = RESOURCE_PILL_SIZE_CLASS[size];
        return (
            <span
                className={`inline-flex shrink-0 items-center font-semibold leading-snug cursor-default select-none bg-surface-light ${sizeClass.pill} ${className}`}
                style={{
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: '#6b7280',
                    color: '#9ca3af',
                }}
                title="Unknown location card"
            >
                <Mountain className={`${sizeClass.icon} shrink-0`} aria-hidden />
                Unknown location
            </span>
        );
    }

    const sizeClass = RESOURCE_PILL_SIZE_CLASS[size];
    const color = '#6d28d9'; // violet-700 — readable on the light gray card background

    return (
        <>
            <div
                ref={anchorRef}
                className={`inline-flex shrink-0 items-center font-semibold leading-snug cursor-default select-none ${sizeClass.pill} ${className}`}
                style={{
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: color,
                    color,
                    backgroundColor: '#d1d5db', // gray-300, solid
                    gap: '0.25rem',
                }}
                role="button"
                tabIndex={0}
                onMouseEnter={() => setTooltipOpen(true)}
                onMouseLeave={() => setTooltipOpen(false)}
                onFocus={() => setTooltipOpen(true)}
                onBlur={() => setTooltipOpen(false)}
                onTouchEnd={(e) => {
                    e.preventDefault();
                    setTooltipOpen(!tooltipOpen);
                }}
                aria-label={`${pillView.name}${count ? ` ×${count}` : ''}`}
            >
                <Mountain className={`${sizeClass.icon} shrink-0`} aria-hidden />
                <span className="truncate">{pillView.name}</span>
                {count != null && count > 1 ? <span className="shrink-0">×{count}</span> : null}
            </div>

            <AnchoredPortalTooltip
                anchorRef={anchorRef}
                open={tooltipOpen}
                placement="top"
                autoFlip
                className={`w-72 ${PORTAL_TOOLTIP_SURFACE_CLASS}`}
                style={{
                    padding: '12px',
                }}
            >
                <div className="flex flex-col gap-2">
                    {/* Name */}
                    <h4 className="text-white font-bold text-sm">Location Card: {pillView.name}</h4>

                    {/* Description */}
                    <p className="text-gray-200 text-xs leading-relaxed">{pillView.description}</p>

                    {/* Flavour text (italic, muted) */}
                    <p className="text-gray-400 text-xs italic leading-relaxed">{pillView.flavourText}</p>

                    {/* Tags (small muted rounded chips) */}
                    {pillView.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {pillView.tags.map((tag, i) => (
                                <span
                                    key={i}
                                    className="inline-flex px-2 py-1 text-[10px] border border-gray-600 rounded text-gray-400 leading-tight"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Modifications list */}
                    {pillView.modifications.length > 0 && (
                        <div className="pt-1 border-t border-gray-700">
                            <p className="text-gray-300 text-xs font-semibold mb-1">Modifications:</p>
                            <ul className="text-gray-300 text-xs space-y-0.5">
                                {pillView.modifications.map((mod, i) => (
                                    <li key={i} className="ml-2">
                                        • {mod}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </AnchoredPortalTooltip>
        </>
    );
}
