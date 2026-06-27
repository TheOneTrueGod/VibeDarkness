interface GravityBarProps {
    current: number;
    max: number;
}

// Streak positions as left-offset percentages within the fill area.
// Each streak is a thin slanted band that drifts right on a slow loop.
const STREAKS = [
    { delay: '0s', left: '15%' },
    { delay: '1.1s', left: '40%' },
    { delay: '2.2s', left: '68%' },
];

export function GravityBar({ current, max }: GravityBarProps) {
    const fillPct = (current / Math.max(max, 1)) * 100;

    return (
        <>
            <style>{`
                @keyframes gravity-streak {
                    0%   { transform: translateX(-40px) skewX(-20deg); opacity: 0; }
                    20%  { opacity: 1; }
                    80%  { opacity: 0.6; }
                    100% { transform: translateX(40px) skewX(-20deg); opacity: 0; }
                }
                @keyframes gravity-pulse {
                    0%, 100% { opacity: 0.85; }
                    50%       { opacity: 1; }
                }
            `}</style>
            <div className="relative h-5 w-full overflow-hidden rounded bg-purple-950/60">
                {/* Fill */}
                <div
                    className="absolute inset-y-0 left-0 bg-purple-700 transition-[width] duration-150"
                    style={{
                        width: `${fillPct}%`,
                        animation: 'gravity-pulse 2s ease-in-out infinite',
                    }}
                />
                {/* Streaks — only visible within the fill */}
                {fillPct > 0 && STREAKS.map((s, i) => (
                    <div
                        key={i}
                        className="pointer-events-none absolute inset-y-0 w-2 bg-purple-300/25"
                        style={{
                            left: s.left,
                            animation: `gravity-streak 3s ease-in-out infinite`,
                            animationDelay: s.delay,
                        }}
                    />
                ))}
            </div>
        </>
    );
}
