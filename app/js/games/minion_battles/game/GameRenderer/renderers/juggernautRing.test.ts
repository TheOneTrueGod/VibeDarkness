import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { Unit } from '../../units/Unit';
import {
    JUGGERNAUT_RING_INNER_COLOR,
    JUGGERNAUT_RING_LABEL,
    shouldShowJuggernautRing,
    syncJuggernautRing,
} from './juggernautRing';

function slime(): Unit {
    return new Unit({
        id: 'slime', x: 0, y: 0, hp: 50, maxHp: 50, speed: 100,
        teamId: 'enemy', ownerId: 'ai', characterId: 'slime', name: 'Slime',
    });
}

function visualWithGlow(): { visual: Container; glow: Graphics; body: Graphics } {
    const visual = new Container();
    const glow = new Graphics();
    glow.label = 'glow';
    const body = new Graphics();
    body.label = 'body';
    visual.addChild(glow, body);
    return { visual, glow, body };
}

describe('juggernaut ring', () => {
    it('uses the juggernaut timing colour (sky blue) for the inner border', () => {
        expect(JUGGERNAUT_RING_INNER_COLOR).toBe(0x7dd3fc);
    });

    it('shows only for an enemy of the viewer in a juggernaut window', () => {
        const unit = slime();
        const spy = vi.spyOn(unit, 'isInJuggernautWindow').mockReturnValue(true);
        expect(shouldShowJuggernautRing(unit, 1, true)).toBe(true);
        expect(shouldShowJuggernautRing(unit, 1, false)).toBe(false);
        spy.mockReturnValue(false);
        expect(shouldShowJuggernautRing(unit, 1, true)).toBe(false);
    });

    it('replaces the glow while shown, sits under the body, and hides again afterwards', () => {
        const unit = slime();
        const { visual, glow, body } = visualWithGlow();

        syncJuggernautRing(visual, unit, true);
        const ring = visual.children.find((c) => c.label === JUGGERNAUT_RING_LABEL)!;
        expect(ring.visible).toBe(true);
        expect(glow.visible).toBe(false);
        expect(visual.getChildIndex(ring)).toBe(visual.getChildIndex(glow) + 1);
        expect(visual.getChildIndex(ring)).toBeLessThan(visual.getChildIndex(body));

        syncJuggernautRing(visual, unit, false);
        expect(ring.visible).toBe(false);
        // Reuses the same ring next time.
        syncJuggernautRing(visual, unit, true);
        expect(visual.children.filter((c) => c.label === JUGGERNAUT_RING_LABEL)).toHaveLength(1);
    });
});
