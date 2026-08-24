import type { CSSProperties } from 'react';
import {
    LIGHT_BAR_FILL_GRADIENT,
    isLightOrbFilled,
    shouldRenderLightAsOrbs,
} from './lightBarDisplay';

interface LightBarProps {
    current: number;
    max: number;
}

const LIGHT_WARM_PULSE = 'light-warm-pulse 3s ease-in-out infinite alternate';

const LIGHT_FILL_STYLE: CSSProperties = {
    background: LIGHT_BAR_FILL_GRADIENT,
    backgroundSize: '200% 100%',
    animation: LIGHT_WARM_PULSE,
};

function LightWarmPulseStyle() {
    return (
        <style>{`
            @keyframes light-warm-pulse {
                0%   { background-position: 0% 50%; }
                100% { background-position: 100% 50%; }
            }
        `}</style>
    );
}

function LightOrbRow({ current, max }: LightBarProps) {
    const orbCount = Math.max(0, Math.floor(max));
    return (
        <div
            className="flex h-4 w-full items-center gap-1"
            role="img"
            aria-label={`Light ${Math.floor(current)} of ${orbCount}`}
        >
            {Array.from({ length: orbCount }, (_, i) => {
                const filled = isLightOrbFilled(current, i);
                return (
                    <div
                        key={i}
                        className={
                            filled
                                ? 'h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full shadow-[0_0_4px_rgba(253,224,71,0.65)]'
                                : 'h-3.5 w-3.5 shrink-0 rounded-full bg-neutral-900 shadow-[inset_0_1px_3px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-black/70'
                        }
                        style={filled ? LIGHT_FILL_STYLE : undefined}
                    />
                );
            })}
        </div>
    );
}

function LightContinuousBar({ current, max }: LightBarProps) {
    const ratio = current / Math.max(max, 1);
    const fillPct = ratio * 100;
    // Brightness scales with fill: near-empty = dim candle, full = radiant sun
    const opacity = 0.15 + ratio * 0.85;

    return (
        <div className="relative h-4 w-full overflow-hidden rounded bg-dark-800/40">
            <div
                className="absolute inset-y-0 left-0 transition-[width] duration-150"
                style={{
                    width: `${fillPct}%`,
                    opacity,
                    ...LIGHT_FILL_STYLE,
                }}
            />
        </div>
    );
}

export function LightBar({ current, max }: LightBarProps) {
    return (
        <>
            <LightWarmPulseStyle />
            {shouldRenderLightAsOrbs(max) ? (
                <LightOrbRow current={current} max={max} />
            ) : (
                <LightContinuousBar current={current} max={max} />
            )}
        </>
    );
}
