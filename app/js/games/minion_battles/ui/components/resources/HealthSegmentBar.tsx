interface HealthSegmentBarProps {
    hp: number;
    maxHp: number;
}

const SEGMENTS = 4;

function segmentColor(hp: number, maxHp: number): string {
    if (maxHp <= 0) return 'bg-gray-600';
    const pct = (hp / maxHp) * 100;
    if (pct > 60) return 'bg-green-500';
    if (pct > 30) return 'bg-yellow-500';
    return 'bg-red-500';
}

export function HealthSegmentBar({ hp, maxHp }: HealthSegmentBarProps) {
    const color = segmentColor(hp, maxHp);
    const hpPerSegment = maxHp / SEGMENTS;

    return (
        <div className="flex w-full gap-0.5">
            {Array.from({ length: SEGMENTS }, (_, i) => {
                const segmentStart = i * hpPerSegment;
                const segmentEnd = (i + 1) * hpPerSegment;
                const fill = Math.max(0, Math.min(1, (hp - segmentStart) / hpPerSegment));
                const isEmpty = hp <= segmentStart;
                return (
                    <div
                        key={i}
                        className="relative h-3 flex-1 overflow-hidden rounded-sm bg-dark-700"
                    >
                        {!isEmpty && (
                            <div
                                className={`absolute inset-y-0 left-0 ${color} transition-[width] duration-150`}
                                style={{ width: `${fill * 100}%` }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
