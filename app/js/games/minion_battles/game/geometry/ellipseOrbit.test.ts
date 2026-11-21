import { describe, expect, it } from 'vitest';
import {
    ellipseOrbitAdvance,
    ellipseOrbitAngle,
    ellipseOrbitClockwiseArc,
    ellipseOrbitPoint,
    moveAroundEllipseOrbit,
    type EllipseOrbitDef,
} from './ellipseOrbit';

const CIRCLE: EllipseOrbitDef = { cx: 500, cy: 500, rx: 200, ry: 200, thicknessPx: 80 };
const OVAL: EllipseOrbitDef = { cx: 800, cy: 600, rx: 440, ry: 320, thicknessPx: 140 };

describe('ellipse orbits', () => {
    it('walks an arc length along the middle line (a circle: arc = radius x angle)', () => {
        const t = ellipseOrbitAdvance(CIRCLE, 0, 100);
        expect(t).toBeCloseTo(100 / 200, 3);
    });

    it('turns clockwise on screen for a positive arc (east -> south, y down) and back for a negative one', () => {
        const east = { x: CIRCLE.cx + CIRCLE.rx, y: CIRCLE.cy };
        const quarter = (Math.PI / 2) * CIRCLE.rx;
        const south = moveAroundEllipseOrbit(CIRCLE, east, quarter, 0);
        expect(south.x).toBeCloseTo(CIRCLE.cx, 0);
        expect(south.y).toBeCloseTo(CIRCLE.cy + CIRCLE.ry, 0);
        const north = moveAroundEllipseOrbit(CIRCLE, east, -quarter, 0);
        expect(north.y).toBeCloseTo(CIRCLE.cy - CIRCLE.ry, 0);
    });

    it('lands inside or outside the middle line by the depth, never past half the thickness', () => {
        const east = { x: OVAL.cx + OVAL.rx, y: OVAL.cy };
        expect(moveAroundEllipseOrbit(OVAL, east, 0, 50).x).toBeCloseTo(OVAL.cx + OVAL.rx + 50, 3);
        expect(moveAroundEllipseOrbit(OVAL, east, 0, -500).x).toBeCloseTo(OVAL.cx + OVAL.rx - OVAL.thicknessPx / 2, 3);
    });

    it('a unit off the band starts from its own direction from the centre', () => {
        const farNorthWest = { x: OVAL.cx - 1000, y: OVAL.cy - 1000 * (OVAL.ry / OVAL.rx) };
        const onBand = moveAroundEllipseOrbit(OVAL, farNorthWest, 0, 0);
        expect(ellipseOrbitAngle(OVAL, onBand)).toBeCloseTo(ellipseOrbitAngle(OVAL, farNorthWest), 6);
        expect(onBand).toEqual(ellipseOrbitPoint(OVAL, ellipseOrbitAngle(OVAL, farNorthWest), 0));
    });

    it('measures the clockwise arc between two angles, matching the walk', () => {
        for (const from of [0, 1, 2.5, -2]) {
            for (const arc of [120, 300, 900]) {
                const to = ellipseOrbitAdvance(OVAL, from, arc);
                expect(ellipseOrbitClockwiseArc(OVAL, from, to)).toBeCloseTo(arc, 0);
            }
        }
    });
});
