import { describe, expect, it } from 'vitest';
import { Unit } from '../../game/units/Unit';
import type { ResolvedTarget } from '../../game/types';
import { EventBus } from '../../game/EventBus';
import { Projectile } from '../../game/projectiles/Projectile';
import { getAbility } from '../../abilities/AbilityRegistry';

function makeUnit(): Unit {
    return new Unit({
        id: 'caster',
        x: 0,
        y: 0,
        hp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
    });
}

describe('Knock', () => {
    it('spawns projectile with Stonephase modifier', () => {
        const ability = getAbility('0604_knock');
        expect(ability).toBeDefined();
        const caster = makeUnit();
        const projectiles: Projectile[] = [];
        const engine = {
            addProjectile: (projectile: Projectile) => {
                projectiles.push(projectile);
            },
            eventBus: new EventBus(),
        };
        const targets: ResolvedTarget[] = [{ type: 'pixel', position: { x: 140, y: 0 } }];

        ability!.doCardEffect(engine, caster, targets, 0.1, 0.26);

        expect(projectiles).toHaveLength(1);
        expect(projectiles[0]?.modifiers).toContain('stonephase');
    });
});
