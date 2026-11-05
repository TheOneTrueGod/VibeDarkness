import { useEffect, useState } from 'react';
import type { ResourceDisplay } from '../../../resources/Resource';

interface PipResourceBarProps {
    resource: ResourceDisplay;
}

/** Orb diameter, in pixels. */
const PIP_SIZE = 10;
/** How often a crackle re-forks (ms). */
const CRACKLE_FRAME_MS = 110;

/** Small deterministic hash in [0, 1), so each orb crackles differently every frame. */
function hash01(a: number, b: number, c: number): number {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** A jagged 4-segment bolt across the orb, re-randomized each frame; some frames show nothing (flicker). */
function cracklePath(pip: number, frame: number): string | null {
    if (hash01(pip, frame, 7) < 0.25) return null;
    const angle = hash01(pip, frame, 1) * Math.PI;
    const c = PIP_SIZE / 2;
    const r = PIP_SIZE * 0.55;
    const x0 = c - Math.cos(angle) * r;
    const y0 = c - Math.sin(angle) * r;
    const x1 = c + Math.cos(angle) * r;
    const y1 = c + Math.sin(angle) * r;
    const steps = 4;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const off = i === 0 || i === steps ? 0 : (hash01(pip, frame, 10 + i) - 0.5) * PIP_SIZE * 0.6;
        const x = x0 + (x1 - x0) * t - Math.sin(angle) * off;
        const y = y0 + (y1 - y0) * t + Math.cos(angle) * off;
        pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return pts.join(' ');
}

function useCrackleFrame(active: boolean): number {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        if (!active) return;
        const id = window.setInterval(() => setFrame((f) => f + 1), CRACKLE_FRAME_MS);
        return () => window.clearInterval(id);
    }, [active]);
    return frame;
}

/**
 * One orb per point of `max`, filled for each point of `current`, packed from the left.
 * Orbs wrap onto another row when there are more than fit, so a larger max still fits the bar.
 * With `pipCrackleColor`, each filled orb has a small lightning crackle flickering over it.
 */
export function PipResourceBar({ resource }: PipResourceBarProps) {
    const count = Math.max(0, Math.floor(resource.max));
    const filled = Math.floor(resource.current);
    const crackle = resource.pipCrackleColor;
    const frame = useCrackleFrame(crackle !== undefined && filled > 0);
    return (
        <div className="flex min-h-4 flex-wrap items-center gap-[3px]">
            {Array.from({ length: count }, (_, i) => {
                const isFilled = i < filled;
                const path = crackle && isFilled ? cracklePath(i, frame) : null;
                return (
                    <div
                        key={i}
                        className="relative shrink-0 rounded-full transition-colors duration-100"
                        style={{
                            width: PIP_SIZE,
                            height: PIP_SIZE,
                            border: `1px solid ${resource.color}`,
                            backgroundColor: isFilled ? resource.color : 'transparent',
                            boxShadow: isFilled ? `0 0 3px ${crackle ?? resource.color}` : undefined,
                            opacity: isFilled ? 1 : 0.45,
                        }}
                    >
                        {path && (
                            <svg
                                className="pointer-events-none absolute"
                                style={{ left: -1, top: -1, overflow: 'visible' }}
                                width={PIP_SIZE}
                                height={PIP_SIZE}
                                viewBox={`0 0 ${PIP_SIZE} ${PIP_SIZE}`}
                                aria-hidden
                            >
                                <polyline
                                    points={path}
                                    fill="none"
                                    stroke={crackle}
                                    strokeWidth={1.2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ filter: `drop-shadow(0 0 1.5px ${crackle})` }}
                                />
                            </svg>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
