import React, { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';

type BossCcArmourRowProps = {
    /** `overlay`: trailing row for bottom-corner HUD; default centered under bar. */
    placement?: 'default' | 'overlay';
    effectiveHardCcThreshold: number;
    hardCcArmourConsumed: number;
    /** Increments on absorb/land so impact animation can trigger. */
    hardCcArmourEventSerial: number;
    lastHardCcEventKind: 'absorbed' | 'landed' | null;
};

/** Crowd-control protection pips: outline slots fill with CC icons when absorbed. */
export function BossCcArmourRow({
    placement = 'default',
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

    const rowClass =
        placement === 'overlay'
            ? 'flex flex-row justify-end gap-1.5'
            : 'mt-2 flex justify-center gap-1.5 px-2';

    const pipClass =
        placement === 'overlay'
            ? 'flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-500 bg-gray-900 shadow-inner'
            : 'flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-500 bg-gray-900 shadow-inner';

    const iconClass = placement === 'overlay' ? 'h-3 w-3' : 'h-4 w-4';
    const iconStroke = placement === 'overlay' ? 2.25 : 2.5;

    return (
        <div
            className={rowClass}
            role="group"
            aria-label={label}
        >
            {Array.from({ length: total }, (_, i) => {
                const showIcon = i < filled;
                const pop = showIcon && pulseIndex === i;
                return (
                    <div key={i} className={pipClass}>
                        {showIcon ? (
                            <Zap
                                className={`${iconClass} text-amber-400 ${pop ? 'animate-cc-pop' : ''}`}
                                aria-hidden
                                strokeWidth={iconStroke}
                            />
                        ) : (
                            <span
                                className={`block rounded-full bg-gray-600 ${
                                    placement === 'overlay' ? 'h-1.5 w-1.5' : 'h-2 w-2'
                                }`}
                                aria-hidden
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
