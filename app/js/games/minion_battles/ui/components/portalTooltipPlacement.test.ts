import { describe, expect, it } from 'vitest';
import {
    clampToViewport,
    computeTooltipPosition,
    orderPlacements,
} from './portalTooltipPlacement';

const SIZE = { width: 180, height: 200 };
const VIEWPORT = { width: 1000, height: 800 };
const GAP = 8;
const PAD = 8;

describe('orderPlacements', () => {
    it('puts preferred first and opposite second for vertical', () => {
        expect(orderPlacements('top')).toEqual(['top', 'bottom', 'right', 'left']);
        expect(orderPlacements('bottom')).toEqual(['bottom', 'top', 'right', 'left']);
    });

    it('puts preferred first and opposite second for horizontal', () => {
        expect(orderPlacements('right')).toEqual(['right', 'left', 'top', 'bottom']);
    });
});

describe('computeTooltipPosition', () => {
    it('places above when there is room', () => {
        const anchor = { left: 400, top: 400, right: 508, bottom: 526, width: 108, height: 126 };
        const pos = computeTooltipPosition({
            anchor,
            size: SIZE,
            viewport: VIEWPORT,
            preferredPlacement: 'top',
            gapPx: GAP,
            paddingPx: PAD,
        });
        expect(pos.placement).toBe('top');
        expect(pos.top).toBe(anchor.top - GAP - SIZE.height);
        expect(pos.left).toBe(anchor.left + anchor.width / 2 - SIZE.width / 2);
    });

    it('flips below when the anchor is near the top of the viewport', () => {
        const anchor = { left: 400, top: 40, right: 508, bottom: 166, width: 108, height: 126 };
        const pos = computeTooltipPosition({
            anchor,
            size: SIZE,
            viewport: VIEWPORT,
            preferredPlacement: 'top',
            gapPx: GAP,
            paddingPx: PAD,
        });
        expect(pos.placement).toBe('bottom');
        expect(pos.top).toBe(anchor.bottom + GAP);
    });

    it('flips left when preferred right would overflow', () => {
        const anchor = {
            left: 900,
            top: 300,
            right: 960,
            bottom: 340,
            width: 60,
            height: 40,
        };
        const pos = computeTooltipPosition({
            anchor,
            size: SIZE,
            viewport: VIEWPORT,
            preferredPlacement: 'right',
            gapPx: GAP,
            paddingPx: PAD,
        });
        expect(pos.placement).toBe('left');
    });

    it('pins to the top-left inset when the tip is larger than the viewport', () => {
        const tinyViewport = { width: 200, height: 180 };
        const anchor = { left: 10, top: 10, right: 50, bottom: 50, width: 40, height: 40 };
        const pos = computeTooltipPosition({
            anchor,
            size: SIZE,
            viewport: tinyViewport,
            preferredPlacement: 'top',
            gapPx: GAP,
            paddingPx: PAD,
            autoFlip: false,
        });
        expect(pos.left).toBe(PAD);
        expect(pos.top).toBe(PAD);
    });
});

describe('clampToViewport', () => {
    it('pulls overflow back inside', () => {
        const clamped = clampToViewport(
            { left: 950, top: -20, placement: 'top' },
            SIZE,
            VIEWPORT,
            PAD,
        );
        expect(clamped.left).toBe(VIEWPORT.width - PAD - SIZE.width);
        expect(clamped.top).toBe(PAD);
    });
});
