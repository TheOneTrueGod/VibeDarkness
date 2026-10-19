import { describe, expect, it } from 'vitest';
import { renderSelectTargetDef } from './PreviewRenderer';
import { Unit } from '../../units/Unit';
import type { GameEngine } from '../../GameEngine';
import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';
import type { TeamId } from '../../teams';
import type { SelectTargetDef } from '../../../abilities/timingTargetDef';
import { getSelectTargetDefsFromTimings } from '../../../abilities/targeting';
import { BloodyClawsAbility_0306 } from '../../../card_defs/03_blood_mage/0306_BloodyClaws/0306Ability';

/** Records how many shapes were filled (each claw hitbox preview fills once). */
function recordingGraphics(): IAbilityPreviewGraphics & { fills: number } {
    const gr = {
        fills: 0,
        clear: () => gr,
        moveTo: () => gr,
        lineTo: () => gr,
        circle: () => gr,
        stroke: () => gr,
        fill: () => {
            gr.fills += 1;
            return gr;
        },
    };
    return gr as unknown as IAbilityPreviewGraphics & { fills: number };
}

function setup() {
    const caster = new Unit({
        id: 'caster', x: 0, y: 0, hp: 100, maxHp: 100, speed: 100,
        teamId: 'player' as TeamId, ownerId: 'p1', characterId: 'player', name: 'Caster',
        abilities: [BloodyClawsAbility_0306.id],
    });
    // No enemies anywhere: the primary claw finds no target.
    const engine = { units: [caster], getUnit: (id: string) => (id === caster.id ? caster : undefined) } as unknown as GameEngine;
    const xStrike = getSelectTargetDefsFromTimings(BloodyClawsAbility_0306, caster, engine)
        .find((d) => d.label === 'X strike')!;
    return { caster, engine, xStrike };
}

describe('select preview companion hitboxes', () => {
    it('draws an independent companion (Bloody Claws second claw) even when the primary has no target', () => {
        const { caster, engine, xStrike } = setup();
        const gr = recordingGraphics();
        renderSelectTargetDef(gr, BloodyClawsAbility_0306, caster, xStrike, { x: 60, y: 0 }, engine);
        expect(gr.fills).toBe(2);
    });

    it('still hides a dependent companion when the primary has no target', () => {
        const { caster, engine, xStrike } = setup();
        const dependent: SelectTargetDef = {
            ...xStrike,
            companionHitboxes: xStrike.companionHitboxes!.map((c) => ({ ...c, independent: false })),
        };
        const gr = recordingGraphics();
        renderSelectTargetDef(gr, BloodyClawsAbility_0306, caster, dependent, { x: 60, y: 0 }, engine);
        expect(gr.fills).toBe(1);
    });
});
