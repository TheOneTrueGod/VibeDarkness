/**
 * BattleNoticeSlot - reusable notice container shown just above the "Your Turn" plaque.
 *
 * Invisible (renders null) unless there is a notice. Each notice is a starburst badge:
 * red outer layer, blue inner layer inset by the border width (same two-layer technique as
 * the plaque endcaps). Never intercepts pointer events.
 */

import React from 'react';
import type { BattleNotice } from './battleNotices';
import { starburstClipPath } from './battleNotices';

const STARBURST_CLIP = starburstClipPath(12, 0.85);
const STARBURST_BORDER_PX = 3;

export interface BattleNoticeSlotProps {
    notices: readonly BattleNotice[];
}

export default function BattleNoticeSlot({ notices }: BattleNoticeSlotProps) {
    if (notices.length === 0) return null;
    return (
        <div
            className="pointer-events-none flex flex-col items-center gap-1"
            role="status"
            aria-live="polite"
        >
            <style>{`@keyframes battle-notice-in{from{opacity:0;transform:scale(0.6)}to{opacity:1;transform:scale(1)}}`}</style>
            {notices.map((notice) => (
                <div
                    key={notice.id}
                    className="relative"
                    style={{ animation: 'battle-notice-in 180ms ease-out' }}
                >
                    {/* Outer red layer */}
                    <div
                        className="absolute inset-0 bg-red-600"
                        style={{ clipPath: STARBURST_CLIP }}
                        aria-hidden="true"
                    />
                    {/* Inner blue layer */}
                    <div
                        className="absolute bg-blue-700"
                        style={{ inset: `${STARBURST_BORDER_PX}px`, clipPath: STARBURST_CLIP }}
                        aria-hidden="true"
                    />
                    <div className="relative flex min-h-[3.25rem] min-w-[9rem] max-w-[16rem] flex-col items-center justify-center px-7 py-3 text-center">
                        <span className="text-sm font-extrabold uppercase tracking-wider text-white">
                            {notice.title}
                        </span>
                        {notice.detail && (
                            <span className="mt-0.5 text-[11px] leading-tight text-white/90">
                                {notice.detail}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
