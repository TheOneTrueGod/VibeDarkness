import { describe, expect, it } from 'vitest';
import { EventBus } from '../EventBus';
import { Unit } from './Unit';
import type { TeamId } from '../teams';
import { DamageLinkBuff } from '../../buffs/DamageLinkBuff';
import { ShieldBuff } from '../../buffs/ShieldBuff';
import { HpDrainBuff } from '../../buffs/HpDrainBuff';
import { buffFromJSON } from '../../buffs/buffRegistry';
import { registerDamageLinkListeners } from './unitDamageLinks';
import type { EngineContext } from '../EngineContext';

function makeUnit(id: string, hp = 100): Unit {
    return new Unit({
        id,
        x: 0,
        y: 0,
        hp,
        maxHp: 100,
        speed: 100,
        teamId: 'player' as TeamId,
        ownerId: 'p1',
        characterId: 'player',
        name: id,
    });
}

function setup(withListeners = true) {
    const eventBus = new EventBus();
    const caster = makeUnit('caster');
    const ally = makeUnit('ally');
    const units = [caster, ally];
    if (withListeners) {
        registerDamageLinkListeners({
            eventBus,
            getUnit: (id) => units.find((u) => u.id === id),
            getUnits: () => units,
        });
    }
    ally.addBuff(new DamageLinkBuff({
        linkedUnitId: caster.id,
        redirectFraction: 0.5,
        linkedShieldShare: 0.5,
        durationSeconds: 20,
    }), 0, 1);
    return { eventBus, caster, ally, units };
}

describe('damage links', () => {
    it('moves half of the linked unit\'s HP loss onto the caster', () => {
        const { eventBus, caster, ally } = setup();
        const hpDamage = ally.takeDamage(20, 'enemy', eventBus);
        expect(hpDamage).toBe(10);
        expect(ally.hp).toBe(90);
        expect(caster.hp).toBe(90);
    });

    it('lets the caster\'s shields soak half of the redirected share (a quarter of the hit)', () => {
        const { eventBus, caster, ally } = setup();
        const shield = new ShieldBuff(30, 0);
        caster.addBuff(shield, 0, 1);
        ally.takeDamage(20, 'enemy', eventBus);
        expect(ally.hp).toBe(90);
        expect(shield.remainingHp).toBe(25);
        expect(caster.hp).toBe(95);
    });

    it('only redirects life loss — damage soaked by the ally\'s own shield is not shared', () => {
        const { eventBus, caster, ally } = setup();
        ally.addBuff(new ShieldBuff(12, 0), 0, 1);
        ally.takeDamage(20, 'enemy', eventBus);
        expect(ally.hp).toBe(96);
        expect(caster.hp).toBe(96);
    });

    it('keeps the full hit on the ally when nothing handles the redirect', () => {
        const { eventBus, caster, ally } = setup(false);
        ally.takeDamage(20, 'enemy', eventBus);
        expect(ally.hp).toBe(80);
        expect(caster.hp).toBe(100);
    });

    it('drops links to a caster that dies, and the ally keeps damage after that', () => {
        const { eventBus, caster, ally } = setup();
        caster.takeDamage(1000, 'enemy', eventBus);
        expect(caster.isAlive()).toBe(false);
        expect(ally.hasBuff('damage_link')).toBe(false);
        ally.takeDamage(20, 'enemy', eventBus);
        expect(ally.hp).toBe(80);
    });

    it('does not chain through the caster\'s own links', () => {
        const { eventBus, caster, ally } = setup();
        caster.addBuff(new DamageLinkBuff({
            linkedUnitId: ally.id,
            redirectFraction: 0.5,
            linkedShieldShare: 1,
            durationSeconds: 20,
        }), 0, 1);
        ally.takeDamage(20, 'enemy', eventBus);
        expect(ally.hp).toBe(90);
        expect(caster.hp).toBe(90);
    });

    it('round-trips DamageLinkBuff through JSON', () => {
        const buff = new DamageLinkBuff({ linkedUnitId: 'c', redirectFraction: 0.5, linkedShieldShare: 0.25, durationSeconds: 20 });
        buff.appliedAtTime = 3;
        const restored = buffFromJSON(buff.toJSON()) as DamageLinkBuff;
        expect(restored.toJSON()).toEqual(buff.toJSON());
    });
});

describe('HpDrainBuff', () => {
    function engineAt(gameTime: number): EngineContext {
        return { gameTime } as unknown as EngineContext;
    }

    it('drains the total evenly over its duration', () => {
        const unit = makeUnit('u');
        const drain = new HpDrainBuff(5, 20);
        unit.addBuff(drain, 0, 1);
        drain.onGameTick(unit, engineAt(10), 0.1);
        expect(unit.hp).toBeCloseTo(97.5);
        drain.onGameTick(unit, engineAt(20), 0.1);
        expect(unit.hp).toBeCloseTo(95);
        drain.onGameTick(unit, engineAt(25), 0.1);
        expect(unit.hp).toBeCloseTo(95);
    });

    it('never drops the unit below 1 HP', () => {
        const unit = makeUnit('u', 2);
        const drain = new HpDrainBuff(5, 20);
        unit.addBuff(drain, 0, 1);
        drain.onGameTick(unit, engineAt(20), 0.1);
        expect(unit.hp).toBe(1);
    });

    it('round-trips through JSON mid-drain', () => {
        const drain = new HpDrainBuff(5, 20);
        drain.drained = 2;
        drain.appliedAtTime = 4;
        const restored = buffFromJSON(drain.toJSON()) as HpDrainBuff;
        expect(restored.toJSON()).toEqual(drain.toJSON());
    });
});
