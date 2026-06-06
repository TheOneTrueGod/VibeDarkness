import { describe, expect, it } from 'vitest';
import { createSeismicGuardRuntimeState, handleSeismicGuardAttackStart } from './0529Ability';
import { Unit } from '../../../game/units/Unit';
import { getEarthCoreArmour } from '../0527_EarthCoreShared/earthCoreArmour';

function makeUnit(config: { id: string; teamId: 'player' | 'enemy'; x: number; y: number }): Unit {
    return new Unit({
        x: config.x,
        y: config.y,
        hp: 100,
        speed: 100,
        teamId: config.teamId,
        ownerId: config.teamId === 'player' ? 'p1' : 'ai',
        characterId: config.teamId === 'player' ? 'player' : 'dark_wolf',
        name: config.teamId === 'player' ? 'player' : 'dark_wolf',
    });
}

describe('Seismic Guard', () => {
    it('triggers exactly once at attack start when ally is in tremorsense', () => {
        const owner = makeUnit({ id: 'owner', teamId: 'player', x: 0, y: 0 });
        const ally = makeUnit({ id: 'ally', teamId: 'player', x: 40, y: 0 });
        const attacker = makeUnit({ id: 'attacker', teamId: 'enemy', x: 120, y: 0 });
        const runtime = createSeismicGuardRuntimeState();

        const first = handleSeismicGuardAttackStart(owner, {
            attackInstanceId: 'attack_1',
            attacker,
            target: ally,
        }, runtime);
        const duplicate = handleSeismicGuardAttackStart(owner, {
            attackInstanceId: 'attack_1',
            attacker,
            target: ally,
        }, runtime);
        const outOfRange = handleSeismicGuardAttackStart(owner, {
            attackInstanceId: 'attack_2',
            attacker,
            target: makeUnit({ id: 'far_ally', teamId: 'player', x: 260, y: 0 }),
        }, runtime);

        expect(first).toBe(true);
        expect(duplicate).toBe(false);
        expect(outOfRange).toBe(false);
        expect(getEarthCoreArmour(ally)).toBe(1);
    });
});
