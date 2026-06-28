interface LightBarProps {
    current: number;
    max: number;
}

export function LightBar({ current, max }: LightBarProps) {
    const ratio = current / Math.max(max, 1);
    const fillPct = ratio * 100;
    // Brightness scales with fill: near-empty = dim candle, full = radiant sun
    const opacity = 0.15 + ratio * 0.85;

    return (
        <>
            <style>{`
                @keyframes light-warm-pulse {
                    0%   { background-position: 0% 50%; }
                    100% { background-position: 100% 50%; }
                }
            `}</style>
            <div className="relative h-4 w-full overflow-hidden rounded bg-dark-800/40">
                <div
                    className="absolute inset-y-0 left-0 transition-[width] duration-150"
                    style={{
                        width: `${fillPct}%`,
                        opacity,
                        // Two-stop gradient shifted wider than the bar so background-position
                        // animation creates a gentle warmth drift between tone pairs
                        background:
                            'linear-gradient(90deg, #fffbeb, #fef08a, #fde047, #fbbf24)',
                        backgroundSize: '200% 100%',
                        animation: 'light-warm-pulse 3s ease-in-out infinite alternate',
                    }}
                />
            </div>
        </>
    );
}
