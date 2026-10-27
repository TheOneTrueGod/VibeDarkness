import { describe, expect, it, vi } from 'vitest';
import { createUnitFromSpawnConfig } from '../game/units/index';
import { UnitTag } from '../game/units/unitTag';
import { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import { AbilityEventType } from '../abilities/Ability';
import { triggerAbilityEvent } from '../abilities/events/AbilityEventRuntime';
import { StrongPunchAbility } from '../card_defs/0117_StrongPunch/0117Ability';
import { canCcInterrupt } from './ccInterrupt';

function alphaWolf(): Unit {
    return createUnitFromSpawnConfig(
        {
            characterId: 'alpha_wolf',
            name: 'Alpha',
            x: 40,
            y: 0,
            teamId: 'enemy',
            ownerId: 'ai',
            unitTags: [UnitTag.Boss],
        },
        new EventBus(),
    );
}

function punchCaster(): Unit {
    return createUnitFromSpawnConfig(
        { characterId: 'player', name: 'Max', x: 0, y: 0, teamId: 'player', ownerId: 'p1' },
        new EventBus(),
    );
}

function strongPunchHit(caster: Unit, target: Unit, interruptUnitAndRefundAbilities = vi.fn()): void {
    triggerAbilityEvent({
        engine: {
            gameTime: 0,
            roundNumber: 1,
            getUnit: () => undefined,
            generateRandomInteger: (min) => min,
            interruptUnitAndRefundAbilities,
            eventBus: new EventBus(),
        },
        caster,
        ability: StrongPunchAbility,
        eventType: AbilityEventType.ON_ATTACK_HIT,
        currentTime: 0,
        prevTime: 0,
        hitResult: 'hit',
        targets: [],
        primaryTarget: target,
    });
}

describe('canCcInterrupt', () => {
    it('is false while a boss still has CC armour, true once Exposed', () => {
        const wolf = alphaWolf();
        expect(canCcInterrupt(wolf, 0)).toBe(false);
        wolf.ccArmour.hardFloor = 0;
        wolf.ccArmour.bonusHard = 0;
        expect(canCcInterrupt(wolf, 0)).toBe(true);
    });
});

describe('Strong Punch vs an armoured alpha wolf', () => {
    it('does not interrupt its abilities (e.g. the howl) while armour holds', () => {
        const wolf = alphaWolf();
        const interruptAll = vi.spyOn(wolf, 'interruptAllAbilities').mockImplementation(() => {});
        const refundInterrupt = vi.fn();
        strongPunchHit(punchCaster(), wolf, refundInterrupt);
        expect(interruptAll).not.toHaveBeenCalled();
        expect(refundInterrupt).not.toHaveBeenCalled();
    });

    it('interrupts once enough CC breaks the armour', () => {
        const wolf = alphaWolf();
        const interruptAll = vi.spyOn(wolf, 'interruptAllAbilities').mockImplementation(() => {});
        const refundInterrupt = vi.fn();
        const caster = punchCaster();
        for (let i = 0; i < 4 && !wolf.hasBuff('exposed'); i++) strongPunchHit(caster, wolf, refundInterrupt);
        expect(wolf.hasBuff('exposed')).toBe(true);
        expect(interruptAll.mock.calls.length + refundInterrupt.mock.calls.length).toBeGreaterThan(0);
    });
});
