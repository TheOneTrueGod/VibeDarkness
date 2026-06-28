interface EarthPowerBarProps {
    current: number;
    max: number;
}

type Pt = [number, number];

// Sutherland-Hodgman half-plane clip: keeps vertices where a·x + b·y + c ≥ 0
function clipHalfPlane(poly: Pt[], a: number, b: number, c: number): Pt[] {
    if (poly.length === 0) return [];
    const out: Pt[] = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const [x0, y0] = poly[i];
        const [x1, y1] = poly[(i + 1) % n];
        const d0 = a * x0 + b * y0 + c;
        const d1 = a * x1 + b * y1 + c;
        if (d0 >= 0) out.push([x0, y0]);
        if ((d0 >= 0) !== (d1 >= 0)) {
            const t = d0 / (d0 - d1);
            out.push([x0 + t * (x1 - x0), y0 + t * (y1 - y0)]);
        }
    }
    return out;
}

// Voronoi cell for seeds[idx] clipped to [0,W]×[0,H]
function voronoiCell(seeds: Pt[], idx: number, W: number, H: number): Pt[] {
    const [px, py] = seeds[idx];
    let poly: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]];
    for (let i = 0; i < seeds.length; i++) {
        if (i === idx || poly.length === 0) continue;
        const [qx, qy] = seeds[i];
        // Half-plane keeping points closer to P than Q
        const a = 2 * (px - qx);
        const b = 2 * (py - qy);
        const c = qx * qx - px * px + qy * qy - py * py;
        poly = clipHalfPlane(poly, a, b, c);
    }
    return poly;
}

// Mulberry32 — fast, seedable PRNG; fixed seed → identical layout on every load
function makePrng(seed: number) {
    let s = seed;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface Rock { poly: Pt[]; cx: number; }

function buildRocks(): Rock[] {
    const rand = makePrng(0x4ea7d0e5);

    // Interior seeds — rejection sampling keeps rocks roughly uniform in size
    const interior: Pt[] = [];
    let attempts = 0;
    while (interior.length < 40 && attempts < 100_000) {
        attempts++;
        const x = 4 + rand() * 152;
        const y = 2.5 + rand() * 11;
        if (!interior.some(p => Math.abs(p[0] - x) < 5.5 && Math.abs(p[1] - y) < 3.8)) {
            interior.push([x, y]);
        }
    }

    // Guard seeds placed just outside each edge. Bisectors between guards and
    // nearby interior seeds fall inside the bar, giving jagged Voronoi edges
    // instead of the rectangular clip at the boundary.
    const guards: Pt[] = [];
    for (let i = 0; i < 22; i++) guards.push([rand() * 170 - 5, -2.5 + rand() * 1.5]);  // top
    for (let i = 0; i < 22; i++) guards.push([rand() * 170 - 5, 17 + rand() * 1.5]);    // bottom
    for (let i = 0; i < 6;  i++) guards.push([-2.5 + rand() * 1.5, rand() * 16]);        // left
    for (let i = 0; i < 6;  i++) guards.push([161.5 + rand() * 1.5, rand() * 16]);       // right

    const allSeeds: Pt[] = [...interior, ...guards];

    return interior
        .map((seed, i) => ({
            poly: voronoiCell(allSeeds, i, 160, 16),
            cx: seed[0],
        }))
        .filter(r => r.poly.length >= 3)
        .sort((a, b) => a.cx - b.cx);
}

// Computed once at module load — same seed → same layout every render
const ROCKS = buildRocks();
const ROCK_COUNT = ROCKS.length;

export function EarthPowerBar({ current, max }: EarthPowerBarProps) {
    const filledCount = Math.round((current / Math.max(max, 1)) * ROCK_COUNT);

    return (
        <div className="h-4 w-full overflow-hidden rounded ring-1 ring-inset ring-stone-600/50">
            <svg viewBox="0 0 160 16" className="h-full w-full" preserveAspectRatio="none">
                {ROCKS.map((rock, i) =>
                    i < filledCount ? (
                        <polygon
                            key={i}
                            points={rock.poly.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}
                            fill="#78716c"
                            stroke="#a8a29e"
                            strokeWidth="0.5"
                        />
                    ) : null
                )}
            </svg>
        </div>
    );
}
