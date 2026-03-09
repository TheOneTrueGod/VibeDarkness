/**
 * Camera tests: start centered on target, dead zone panning, level bounds, viewport larger than world.
 */
import { describe, it, expect } from 'vitest';
import { Camera } from './Camera';

describe('Camera', () => {
    const WORLD_WIDTH = 1200;
    const WORLD_HEIGHT = 800;

    describe('initialization and snapTo (start centered on player)', () => {
        it('constructor starts camera at world center', () => {
            const cam = new Camera(400, 300, WORLD_WIDTH, WORLD_HEIGHT);
            expect(cam.x).toBe(WORLD_WIDTH / 2);
            expect(cam.y).toBe(WORLD_HEIGHT / 2);
        });

        it('snapTo moves camera to target position (e.g. player) when in bounds', () => {
            const cam = new Camera(400, 300, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(500, 400); // well within world bounds
            expect(cam.x).toBe(500);
            expect(cam.y).toBe(400);
        });
    });

    describe('bounded by level', () => {
        it('does not pan left beyond the left edge of the stage', () => {
            const cam = new Camera(400, 300, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(-100, WORLD_HEIGHT / 2);
            expect(cam.x).toBe(200); // half viewport width = 200
            expect(cam.y).toBe(WORLD_HEIGHT / 2);
        });

        it('does not pan right beyond the right edge of the stage', () => {
            const cam = new Camera(400, 300, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(WORLD_WIDTH + 100, WORLD_HEIGHT / 2);
            expect(cam.x).toBe(WORLD_WIDTH - 200);
            expect(cam.y).toBe(WORLD_HEIGHT / 2);
        });

        it('does not pan above the top edge of the stage', () => {
            const cam = new Camera(400, 300, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(WORLD_WIDTH / 2, -50);
            expect(cam.x).toBe(WORLD_WIDTH / 2);
            expect(cam.y).toBe(150); // half viewport height
        });

        it('does not pan below the bottom edge of the stage', () => {
            const cam = new Camera(400, 300, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(WORLD_WIDTH / 2, WORLD_HEIGHT + 100);
            expect(cam.x).toBe(WORLD_WIDTH / 2);
            expect(cam.y).toBe(WORLD_HEIGHT - 150);
        });
    });

    describe('viewport larger than level', () => {
        it('still follows target when viewport width is bigger than world (clamped to world bounds)', () => {
            const cam = new Camera(1600, 600, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(999, WORLD_HEIGHT / 2);
            expect(cam.x).toBe(999);
            expect(cam.y).toBe(WORLD_HEIGHT / 2);
        });

        it('still follows target when viewport height is bigger than world (clamped to world bounds)', () => {
            const cam = new Camera(800, 1000, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(WORLD_WIDTH / 2, 123);
            expect(cam.x).toBe(WORLD_WIDTH / 2);
            expect(cam.y).toBe(123);
        });

        it('clamps to world bounds when viewport is larger and target is past right edge', () => {
            const cam = new Camera(1600, 1000, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(WORLD_WIDTH + 100, WORLD_HEIGHT + 100);
            expect(cam.x).toBe(WORLD_WIDTH);
            expect(cam.y).toBe(WORLD_HEIGHT);
        });
    });

    describe('pan towards player only when outside center 1/4 (dead zone)', () => {
        it('pans when target is outside the center quarter of the screen', () => {
            const cam = new Camera(800, 600, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(400, 400); // center at (400, 400)
            // Target far to the right in world -> outside right side of dead zone in screen space
            cam.centerOn(800, 400);
            expect(cam.x).toBeGreaterThan(400);
            expect(cam.y).toBe(400);
        });

        it('does not pan when target is inside the center quarter of the screen', () => {
            const cam = new Camera(800, 600, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(400, 400);
            // Target (400, 400) is at screen center -> inside dead zone [200,150] to [600,450]
            cam.centerOn(400, 400);
            expect(cam.x).toBe(400);
            expect(cam.y).toBe(400);
        });

        it('does not pan when target is just inside dead zone boundary', () => {
            const cam = new Camera(800, 600, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(400, 400);
            // Screen center is (400, 400). Dead zone: x in [200, 600], y in [150, 450].
            // World (400+200, 400) = (600, 400) -> screen (600, 400) which is on the right edge of dead zone (600 is not > 600). So inside.
            cam.centerOn(600, 400);
            expect(cam.x).toBe(400);
            expect(cam.y).toBe(400);
        });

        it('pans when target is just outside dead zone boundary', () => {
            const cam = new Camera(800, 600, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(400, 400);
            // World (601, 400) -> screen (601, 400), 601 > 600 so outside
            cam.centerOn(601, 400);
            expect(cam.x).toBeGreaterThan(400);
        });
    });

    describe('coordinate conversion', () => {
        it('worldToScreen and screenToWorld round-trip', () => {
            const cam = new Camera(800, 600, WORLD_WIDTH, WORLD_HEIGHT);
            cam.snapTo(100, 200);
            const world = { x: 350, y: 420 };
            const screen = cam.worldToScreen(world.x, world.y);
            const back = cam.screenToWorld(screen.x, screen.y);
            expect(back.x).toBeCloseTo(world.x);
            expect(back.y).toBeCloseTo(world.y);
        });
    });
});
