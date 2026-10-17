import { afterEach, describe, expect, it } from 'vitest';
import { getHudAnchorRect, registerHudAnchor, unregisterHudAnchor } from './hudAnchors';

function fakeEl(x: number): HTMLElement {
    const rect = { x, y: 0, width: 10, height: 10, left: x, top: 0, right: x + 10, bottom: 10 } as DOMRect;
    return { getBoundingClientRect: () => rect } as unknown as HTMLElement;
}

describe('hudAnchors', () => {
    afterEach(() => unregisterHudAnchor('objectives'));

    it('returns null for a missing id', () => {
        expect(getHudAnchorRect('objectives')).toBeNull();
    });

    it('returns the registered element rect', () => {
        registerHudAnchor('objectives', fakeEl(5));
        expect(getHudAnchorRect('objectives')?.x).toBe(5);
    });

    it('overwrites a prior registration', () => {
        registerHudAnchor('objectives', fakeEl(5));
        registerHudAnchor('objectives', fakeEl(20));
        expect(getHudAnchorRect('objectives')?.x).toBe(20);
    });

    it('unregisters', () => {
        registerHudAnchor('objectives', fakeEl(5));
        unregisterHudAnchor('objectives');
        expect(getHudAnchorRect('objectives')).toBeNull();
    });

    it('does not unregister when a different element is passed', () => {
        registerHudAnchor('objectives', fakeEl(5));
        unregisterHudAnchor('objectives', fakeEl(5));
        expect(getHudAnchorRect('objectives')).not.toBeNull();
    });
});
