import { describe, expect, it } from 'vitest';
import { actionTitlePose } from './HudEffectLayer';
import { ActionTitleEffect } from '../../effect_defs/hudEffects';

describe('ActionTitle', () => {
    it('flies in from off-screen left, drifts right through centre, then flies out right', () => {
        expect(actionTitlePose(0).offset).toBe(-1);
        const held = [0.2, 0.4, 0.6, 0.79].map(actionTitlePose);
        for (const p of held) expect(p.offset).toBe(0);
        // Just short of centre when it lands, just past when it leaves.
        expect(held[0]!.drift).toBeLessThan(0);
        expect(held[3]!.drift).toBeGreaterThan(0);
        for (let i = 1; i < held.length; i++) expect(held[i]!.drift).toBeGreaterThan(held[i - 1]!.drift);
        expect(actionTitlePose(1).offset).toBe(1);
        // Fast in: most of the way there a third of the way through the fly-in.
        expect(actionTitlePose(0.05).offset).toBeGreaterThan(-0.4);
    });

    it('runs on render time, not the game clock', () => {
        const effect = new ActionTitleEffect('Crystal Laser', 2.2);
        effect.renderUpdate(1.1);
        expect(effect.progress).toBeCloseTo(0.5);
        effect.renderUpdate(1.2);
        expect(effect.active).toBe(false);
    });
});
