/**
 * ComboMeter - scoreboard-style "COMBO: 012" badge shown just above the "Your Turn" plaque
 * while the local player has a combo in progress (see getComboMeterCount).
 *
 * Same starburst badge as BattleNoticeSlot: black outer layer, yellow inner layer inset by the
 * border width. Polls the engine itself (the battle page does not re-render every tick) and only
 * re-renders when the count changes. Never intercepts pointer events.
 */

import React, { useEffect, useState } from 'react';
import type { GameEngine } from '../../game/GameEngine';
import { starburstClipPath } from './battleNotices';
import { formatComboMeterCount, getComboMeterCount } from './comboMeterCount';

const STARBURST_CLIP = starburstClipPath(12, 0.85);
const STARBURST_BORDER_PX = 3;
const POLL_INTERVAL_MS = 100;

export interface ComboMeterProps {
    getEngine: () => GameEngine | null;
}

export default function ComboMeter({ getEngine }: ComboMeterProps) {
    const [count, setCount] = useState<number | null>(() => getComboMeterCount(getEngine()));

    useEffect(() => {
        const poll = () => setCount(getComboMeterCount(getEngine()));
        poll();
        const id = window.setInterval(poll, POLL_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [getEngine]);

    if (count == null) return null;
    return (
        <div className="pointer-events-none" role="status" aria-live="polite" aria-label={`Combo ${count}`}>
            <style>{`@keyframes combo-meter-bump{from{transform:scale(1.25)}to{transform:scale(1)}}`}</style>
            {/* Re-keyed per count so each new hit replays the bump. */}
            <div key={count} className="relative" style={{ animation: 'combo-meter-bump 160ms ease-out' }}>
                {/* Outer black layer (border) */}
                <div
                    className="absolute inset-0 bg-black"
                    style={{ clipPath: STARBURST_CLIP }}
                    aria-hidden="true"
                />
                {/* Inner yellow layer */}
                <div
                    className="absolute bg-yellow-400"
                    style={{ inset: `${STARBURST_BORDER_PX}px`, clipPath: STARBURST_CLIP }}
                    aria-hidden="true"
                />
                <div className="relative flex min-h-[3.25rem] min-w-[9rem] items-center justify-center px-7 py-3">
                    <span className="font-mono text-sm font-extrabold tracking-wider text-black" aria-hidden="true">
                        COMBO: {formatComboMeterCount(count)}
                    </span>
                </div>
            </div>
        </div>
    );
}
