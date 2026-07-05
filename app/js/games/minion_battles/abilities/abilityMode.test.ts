import { describe, expect, it, vi, beforeEach } from 'vitest';
import { defineAbility } from './defineAbility';
import { AbilityPhase } from './abilityTimings';
import { registerAbilityForTest } from './AbilityRegistry';
import type { CastBehaviourSetupContext } from './castBehaviourTypes';
import { executeUnitAbility } from '../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../game/units/unitAbilityTick';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import type { EngineContext } from '../game/EngineContext';
import { serializeUnit } from '../game/units/unitToJSON';

const TEST_ABILITY_ID = 'test_ability_mode';
const MODE_PUSH = 'push';
const MODE_PULL = 'pull';

let capturedBehaviourMode: string | undefined;

const modeProbeBehaviour = {
    onSetup(ctx: CastBehaviourSetupContext) {
        capturedBehaviourMode = ctx.abilityMode;
    },
};

const TestModeAbility = defineAbility({
    id: TEST_ABILITY_ID,
    name: 'Mode Probe',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityModes: { modes: [MODE_PUSH, MODE_PULL], defaultMode: MODE_PUSH },
    abilityTimings: [
        {
            id: 'active',
            start: 0,
            end: 1,
            abilityPhase: AbilityPhase.Active,
            castBehaviours: [{ timingStart: 'start', behaviour: modeProbeBehaviour }],
        },
    ],
    getTooltipText: () => ['Mode probe'],
    getRange: () => ({ minRange: 0, maxRange: 100 }),
});

function makeUnit(): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 100,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
        abilities: [TEST_ABILITY_ID],
    });
    unit.abilityRuntime[TEST_ABILITY_ID] = {
        currentUses: 1,
        maxUses: 1,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    return unit;
}

function makeEngine(): EngineContext {
    const eventBus = new EventBus();
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus,
        trackAbilityUse: vi.fn(),
        getUnit: vi.fn(),
        addEffectEmitter: vi.fn(),
        units: [],
    } as unknown as EngineContext;
}

describe('abilityMode', () => {
    beforeEach(() => {
        capturedBehaviourMode = undefined;
        registerAbilityForTest(TestModeAbility);
    });

    it('copies pull from the order onto ActiveAbility and cast behaviour context', () => {
        const unit = makeUnit();
        const engine = makeEngine();

        executeUnitAbility(unit, TestModeAbility, [], engine, MODE_PULL);

        const active = unit.activeAbilities[0];
        expect(active?.abilityMode).toBe(MODE_PULL);

        tickUnitActiveAbilities(unit, 0.01, engine, vi.fn());
        expect(capturedBehaviourMode).toBe(MODE_PULL);
    });

    it('defaults to the def defaultMode when the order omits abilityMode', () => {
        const unit = makeUnit();
        const engine = makeEngine();

        executeUnitAbility(unit, TestModeAbility, [], engine);

        expect(unit.activeAbilities[0]?.abilityMode).toBe(MODE_PUSH);

        tickUnitActiveAbilities(unit, 0.01, engine, vi.fn());
        expect(capturedBehaviourMode).toBe(MODE_PUSH);
    });

    it('survives a unit toJSON/fromJSON round trip mid-cast', () => {
        const unit = makeUnit();
        const engine = makeEngine();
        executeUnitAbility(unit, TestModeAbility, [], engine, MODE_PULL);

        const eventBus = new EventBus();
        const json = serializeUnit(unit, 0);
        const restored = Unit.fromJSON(json, eventBus, 0);

        expect(restored.activeAbilities[0]?.abilityMode).toBe(MODE_PULL);
    });
});
