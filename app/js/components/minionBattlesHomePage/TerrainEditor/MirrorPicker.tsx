import React from 'react';
import type { MirrorMode } from '../../../games/minion_battles/terrain/mapTools';

interface MirrorPickerProps {
    mirrorMode: MirrorMode;
    onChange: (mode: MirrorMode) => void;
}

const MIRROR_OPTIONS: { mode: MirrorMode; label: string; title: string }[] = [
    { mode: 'none', label: 'No mirror', title: 'Paint without symmetry' },
    { mode: 'horizontal', label: '⇆ Left/Right', title: 'Mirror across the vertical centre line' },
    { mode: 'vertical', label: '⇅ Top/Bottom', title: 'Mirror across the horizontal centre line' },
    { mode: 'both', label: '✣ Both', title: 'Mirror into all four quadrants' },
];

/** Symmetry toggle for every terrain tool (applied in the PAINT_CELLS reducer). */
export default function MirrorPicker({ mirrorMode, onChange }: MirrorPickerProps) {
    return (
        <div className="grid grid-cols-2 gap-1">
            {MIRROR_OPTIONS.map(({ mode, label, title }) => {
                const isActive = mirrorMode === mode;
                return (
                    <button
                        key={mode}
                        title={title}
                        onClick={() => onChange(mode)}
                        className={[
                            'px-2 py-1.5 rounded text-xs font-medium transition-colors',
                            isActive
                                ? 'bg-primary text-white'
                                : 'bg-surface border border-border-custom text-muted hover:border-primary',
                        ].join(' ')}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
