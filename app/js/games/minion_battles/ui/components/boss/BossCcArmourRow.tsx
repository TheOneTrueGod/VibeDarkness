import React, { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';

type BossCcArmourRowProps = {
    effectiveHardCcThreshold: number;
    hardCcArmourConsumed: number;
    /** Increments on absorb/land so impact animation can trigger. */
    hardCcArmourEventSerial: number;
    lastHardCcEventKind: 'absorbed' | 'landed' | null;
};

/** Crowd-control protection pips: outline slots fill with CC icons when absorbed. */
export function BossCcArmourRow({
    effectiveHardCcThreshold,
    hardCcArmourConsumed,
    hardCcArmourEventSerial,
    lastHardCcEventKind,
}: BossCcArmourRowProps) {
    const prevSerial = useRef(hardCcArmourEventSerial);
    const [pulseIndex, setPulseIndex] = useState<number | null>(null);

    useEffect(() => {
        if (hardCcArmourEventSerial !== prevSerial.current) {
            prevSerial.current = hardCcArmourEventSerial;
            if (lastHardCcEventKind === 'absorbed') {
                const idx = Math.max(0, hardCcArmourConsumed - 1);
                setPulseIndex(idx);
                const t = window.setTimeout(() => setPulseIndex(null), 240);
                return () => window.clearTimeout(t);
            }
            setPulseIndex(null);
        }
    }, [hardCcArmourEventSerial, hardCcArmourConsumed, lastHardCcEventKind]);

    if (effectiveHardCcThreshold <= 0) return null;

    const total = effectiveHardCcThreshold;
    const filled = Math.min(hardCcArmourConsumed, total);
    const label = `Crowd control protection: ${filled} of ${total} slots filled`;

    return (
        <div
            className="mt-2 flex justify-center gap-1.5 px-2"
            role="group"
            aria-label={label}
        >
            {Array.from({ length: total }, (_, i) => {
                const showIcon = i < filled;
                const pop = showIcon && pulseIndex === i;
                return (
                    <div
                        key={i}
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-500/70 bg-gray-900/80 shadow-inner"
                    >
                        {showIcon ? (
                            <Zap
                                className={`h-4 w-4 text-amber-400 ${pop ? 'animate-cc-pop' : ''}`}
                                aria-hidden
                                strokeWidth={2.5}
                            />
                        ) : (
                            <span className="block h-2 w-2 rounded-full bg-gray-700/80" aria-hidden />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
