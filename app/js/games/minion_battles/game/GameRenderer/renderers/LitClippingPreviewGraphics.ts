import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';

type Point = { x: number; y: number };
type StrokeOptions = { color: number; width: number; alpha?: number };
type FillOptions = { color: number; alpha?: number };

// Roughly one sample point per this many world-space pixels along a drawn path/circumference —
// fine enough that the lit/dark boundary reads as a clean edge, coarse enough to stay cheap.
const SAMPLE_SPACING_PX = 8;
const MIN_CIRCLE_SEGMENTS = 24;
const MAX_CIRCLE_SEGMENTS = 96;

/**
 * Wraps an `IAbilityPreviewGraphics` so `stroke()`/`fill()` only draw the portions of the
 * pending path or circle whose sample points pass `isLit`, instead of an ability's entire
 * telegraph being shown or hidden based on the caster's own visibility. Ability preview code
 * (ThornStomp, ThornbinderBramble, SlimeShot, the generic shrinking-circle/growing-line
 * telegraph) draws through this wrapper unmodified — it has no idea clipping is happening.
 */
export class LitClippingPreviewGraphics implements IAbilityPreviewGraphics {
    private path: Point[] = [];
    private pendingCircle: { x: number; y: number; r: number } | null = null;

    constructor(
        private readonly target: IAbilityPreviewGraphics,
        private readonly isLit: (x: number, y: number) => boolean,
    ) {}

    clear(): void {
        this.target.clear();
        this.path = [];
        this.pendingCircle = null;
    }

    moveTo(x: number, y: number): void {
        this.path = [{ x, y }];
        this.pendingCircle = null;
    }

    lineTo(x: number, y: number): void {
        this.path.push({ x, y });
    }

    circle(x: number, y: number, radius: number): void {
        this.pendingCircle = { x, y, r: radius };
        this.path = [];
    }

    fill(options: FillOptions): void {
        // Only ever used here for tiny solid dots (e.g. SlimeShot's aim-point marker) — clipping
        // by the center point alone is enough; there's no meaningful "half the dot is lit" case.
        if (this.pendingCircle && this.isLit(this.pendingCircle.x, this.pendingCircle.y)) {
            this.target.circle(this.pendingCircle.x, this.pendingCircle.y, this.pendingCircle.r);
            this.target.fill(options);
        }
        this.pendingCircle = null;
        this.path = [];
    }

    stroke(options: StrokeOptions): void {
        if (this.pendingCircle) {
            drawLitClippedCircle(this.target, this.isLit, this.pendingCircle, options);
        } else if (this.path.length >= 2) {
            drawLitClippedPolyline(this.target, this.isLit, this.path, options);
        }
        this.pendingCircle = null;
        this.path = [];
    }
}

function drawLitClippedCircle(
    target: IAbilityPreviewGraphics,
    isLit: (x: number, y: number) => boolean,
    circle: { x: number; y: number; r: number },
    options: StrokeOptions,
): void {
    const { x: cx, y: cy, r } = circle;
    if (r <= 0) return;
    const segments = Math.max(
        MIN_CIRCLE_SEGMENTS,
        Math.min(MAX_CIRCLE_SEGMENTS, Math.round((2 * Math.PI * r) / SAMPLE_SPACING_PX)),
    );
    const points: Point[] = [];
    const lit: boolean[] = [];
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        points.push({ x: px, y: py });
        lit.push(isLit(px, py));
    }

    if (lit.every((v) => v)) {
        target.circle(cx, cy, r);
        target.stroke(options);
        return;
    }
    if (lit.every((v) => !v)) return;

    // Rotate the start index to a dark->lit transition so a run never gets split by the
    // array wrap-around (guaranteed to exist since the circle isn't uniformly lit or dark).
    let startIdx = 0;
    for (let i = 0; i < segments; i++) {
        if (lit[i] && !lit[(i - 1 + segments) % segments]) {
            startIdx = i;
            break;
        }
    }

    let i = 0;
    while (i < segments) {
        const idx = (startIdx + i) % segments;
        if (!lit[idx]) {
            i++;
            continue;
        }
        const run: Point[] = [points[idx]!];
        let j = i + 1;
        while (j < segments) {
            const idx2 = (startIdx + j) % segments;
            if (!lit[idx2]) break;
            run.push(points[idx2]!);
            j++;
        }
        if (run.length >= 2) {
            target.moveTo(run[0]!.x, run[0]!.y);
            for (let k = 1; k < run.length; k++) target.lineTo(run[k]!.x, run[k]!.y);
            target.stroke(options);
        }
        i = j;
    }
}

function drawLitClippedPolyline(
    target: IAbilityPreviewGraphics,
    isLit: (x: number, y: number) => boolean,
    path: Point[],
    options: StrokeOptions,
): void {
    const samples: Point[] = [path[0]!];
    for (let s = 0; s < path.length - 1; s++) {
        const a = path[s]!;
        const b = path[s + 1]!;
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.round(segLen / SAMPLE_SPACING_PX));
        for (let t = 1; t <= steps; t++) {
            const f = t / steps;
            samples.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
        }
    }
    const lit = samples.map((p) => isLit(p.x, p.y));

    let i = 0;
    while (i < samples.length) {
        if (!lit[i]) {
            i++;
            continue;
        }
        const runStart = i;
        while (i < samples.length && lit[i]) i++;
        const run = samples.slice(runStart, i);
        if (run.length >= 2) {
            target.moveTo(run[0]!.x, run[0]!.y);
            for (let k = 1; k < run.length; k++) target.lineTo(run[k]!.x, run[k]!.y);
            target.stroke(options);
        }
    }
}
