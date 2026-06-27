interface EarthPowerBarProps {
    current: number;
    max: number;
}

// Pre-defined pebble positions as percentages of the SVG viewBox (100 × 20).
// Sorted left-to-right so filling left-to-right is natural.
// Simulates rocks dropped into a rectangular container — tight packing with
// row offsets to break the grid and give a natural stacked appearance.
const PEBBLES: Array<{ cx: number; cy: number; rx: number; ry: number }> = [
    // Bottom row
    { cx: 4,   cy: 15, rx: 3.5, ry: 2.8 },
    { cx: 10,  cy: 16, rx: 3.2, ry: 2.5 },
    { cx: 16,  cy: 15, rx: 3.8, ry: 2.6 },
    { cx: 22,  cy: 16, rx: 3.0, ry: 2.4 },
    { cx: 28,  cy: 15, rx: 3.6, ry: 2.7 },
    { cx: 34,  cy: 16, rx: 3.3, ry: 2.5 },
    { cx: 40,  cy: 15, rx: 3.5, ry: 2.6 },
    { cx: 46,  cy: 16, rx: 3.1, ry: 2.4 },
    { cx: 52,  cy: 15, rx: 3.7, ry: 2.7 },
    { cx: 58,  cy: 16, rx: 3.2, ry: 2.5 },
    { cx: 64,  cy: 15, rx: 3.5, ry: 2.6 },
    { cx: 70,  cy: 16, rx: 3.0, ry: 2.4 },
    { cx: 76,  cy: 15, rx: 3.6, ry: 2.7 },
    { cx: 82,  cy: 16, rx: 3.3, ry: 2.5 },
    { cx: 88,  cy: 15, rx: 3.4, ry: 2.6 },
    { cx: 94,  cy: 16, rx: 3.2, ry: 2.4 },
    // Middle row (offset to nestle between bottom row pebbles)
    { cx: 7,   cy: 9,  rx: 3.3, ry: 2.5 },
    { cx: 13,  cy: 8,  rx: 3.6, ry: 2.7 },
    { cx: 19,  cy: 9,  rx: 3.1, ry: 2.4 },
    { cx: 25,  cy: 8,  rx: 3.5, ry: 2.6 },
    { cx: 31,  cy: 9,  rx: 3.3, ry: 2.5 },
    { cx: 37,  cy: 8,  rx: 3.7, ry: 2.7 },
    { cx: 43,  cy: 9,  rx: 3.2, ry: 2.4 },
    { cx: 49,  cy: 8,  rx: 3.5, ry: 2.6 },
    { cx: 55,  cy: 9,  rx: 3.3, ry: 2.5 },
    { cx: 61,  cy: 8,  rx: 3.6, ry: 2.7 },
    { cx: 67,  cy: 9,  rx: 3.1, ry: 2.4 },
    { cx: 73,  cy: 8,  rx: 3.5, ry: 2.6 },
    { cx: 79,  cy: 9,  rx: 3.4, ry: 2.5 },
    { cx: 85,  cy: 8,  rx: 3.2, ry: 2.4 },
    { cx: 91,  cy: 9,  rx: 3.6, ry: 2.7 },
    { cx: 97,  cy: 8,  rx: 3.0, ry: 2.3 },
    // Top row (sparse, nestled above middle row)
    { cx: 10,  cy: 3,  rx: 3.0, ry: 2.2 },
    { cx: 22,  cy: 2,  rx: 3.2, ry: 2.3 },
    { cx: 34,  cy: 3,  rx: 2.9, ry: 2.1 },
    { cx: 46,  cy: 2,  rx: 3.1, ry: 2.3 },
    { cx: 58,  cy: 3,  rx: 3.0, ry: 2.2 },
    { cx: 70,  cy: 2,  rx: 3.2, ry: 2.3 },
    { cx: 82,  cy: 3,  rx: 2.9, ry: 2.1 },
    { cx: 94,  cy: 2,  rx: 3.1, ry: 2.2 },
];

// Sort by cx so filling left-to-right aligns with resource amount
const SORTED_PEBBLES = [...PEBBLES].sort((a, b) => a.cx - b.cx);
const PEBBLE_COUNT = SORTED_PEBBLES.length;

export function EarthPowerBar({ current, max }: EarthPowerBarProps) {
    const filledCount = Math.round((current / Math.max(max, 1)) * PEBBLE_COUNT);

    return (
        <svg
            viewBox="0 0 100 20"
            className="h-5 w-full"
            preserveAspectRatio="none"
        >
            {SORTED_PEBBLES.map((p, i) => (
                <ellipse
                    key={i}
                    cx={p.cx}
                    cy={p.cy}
                    rx={p.rx}
                    ry={p.ry}
                    fill={i < filledCount ? '#78716c' : '#1c1917'}
                    stroke={i < filledCount ? '#a8a29e' : '#292524'}
                    strokeWidth="0.5"
                />
            ))}
        </svg>
    );
}
