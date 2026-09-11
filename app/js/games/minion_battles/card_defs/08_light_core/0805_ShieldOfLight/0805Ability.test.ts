import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { updateUnit } from '../../../game/units/unitMovementTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { getAbilityDisabledReason } from '../../../ui/components/abilityDisabledReason';
import { getAbilityResourceCosts } from '../../../abilities/Ability';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../../buffs/ShieldBuff';
import { Light } from '../../../resources/Light';
import type { TeamId } from '../../../game/teams';
import { ROUND_DURATION } from '../../../game/gameConstants';
import {
    LIGHT_SHIELD_DRAIN_PER_SECOND,
    LIGHT_SHIELD_DURATION_ROUNDS,
    LIGHT_SHIELD_FLARE_DAMAGE,
    LIGHT_SHIELD_FLARE_KNOCKBACK_TIER,
    LIGHT_SHIELD_FLARE_RESOURCE_COST_ADD,
    LIGHT_SHIELD_FLARE_TAG,
    LIGHT_SHIELD_HP,
    LIGHT_SHIELD_LIGHT_COST,
    LIGHT_SHIELD_PREFIRE_TIME,
    SHIELD_OF_LIGHT_ABILITY_ID,
} from './0805Constants';
import { ShieldOfLightAbility } from './0805Ability';

const CARD_ID = SHIELD_OF_LIGHT_ABILITY_ID;
const TICK_DT = 0.01;
const ACTIVE_TICK_ADVANCE = LIGHT_SHIELD_PREFIRE_TIME + 0.02;
const FLARE_LIGHT_COST = LIGHT_SHIELD_LIGHT_COST + LIGHT_SHIELD_FLARE_RESOURCE_COST_ADD;
const DARK_CREATURE_CHARACTER_ID = 'slime';
const BEAST_CHARACTER_ID = 'thornling';

function makeCaster(initialLight: number, withFlare = false): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 50,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
        abilities: [CARD_ID],
        radius: DEFAULT_UNIT_RADIUS,
    });
    unit.abilityRuntime[CARD_ID] = {
        currentUses: 1,
        maxUses: 1,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    if (withFlare) {
        unit.abilityModifiers[CARD_ID] = {
            resourceCostFlat: LIGHT_SHIELD_FLARE_RESOURCE_COST_ADD,
            explosionDamageFlat: LIGHT_SHIELD_FLARE_DAMAGE,
            knockbackTier: LIGHT_SHIELD_FLARE_KNOCKBACK_TIER,
            addTags: [LIGHT_SHIELD_FLARE_TAG],
        };
    }
    const light = new Light();
    light.add(initialLight);
    light.attach(unit, new EventBus());
    unit.resources.push(light);
    return unit;
}

function makeEnemy(id: string, characterId: string, x: number): Unit {
    return new Unit({
        id,
        x,
        y: 100,
        hp: 40,
        maxHp: 40,
        speed: 100,
        teamId: 'enemy' as TeamId,
        ownerId: 'ai',
        characterId,
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function makeEngine(units: Unit[]): EngineContext {
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus: new EventBus(),
        units,
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
    } as unknown as EngineContext;
}

function advanceSimulation(units: Unit[], engine: EngineContext, totalSeconds: number): void {
    const steps = Math.ceil(totalSeconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        for (const unit of units) {
            tickUnitActiveAbilities(unit, TICK_DT, engine, vi.fn());
            updateUnit(unit, TICK_DT, engine);
        }
    }
}

function casterShield(caster: Unit): ShieldBuff | undefined {
    return caster.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
}

describe('ShieldOfLightAbility', () => {
    it('grants the caster a light-themed ShieldBuff at the starting armour pool', () => {
        const caster = makeCaster(LIGHT_SHIELD_LIGHT_COST + 1);
        const engine = makeEngine([caster]);

        executeUnitAbility(caster, ShieldOfLightAbility, [], engine);
        advanceSimulation([caster], engine, ACTIVE_TICK_ADVANCE);

        const shield = casterShield(caster);
        expect(shield).toBeDefined();
        expect(shield?.remainingHp).toBeCloseTo(LIGHT_SHIELD_HP, 0);
        expect(shield?.theme).toBe('light');
        expect(shield?.drainPerSecond).toBe(LIGHT_SHIELD_DRAIN_PER_SECOND);
    });

    it('drains an undamaged shield to expired over one round', () => {
        const caster = makeCaster(LIGHT_SHIELD_LIGHT_COST + 1);
        const engine = makeEngine([caster]);

        executeUnitAbility(caster, ShieldOfLightAbility, [], engine);
        advanceSimulation(
            [caster],
            engine,
            ACTIVE_TICK_ADVANCE + LIGHT_SHIELD_DURATION_ROUNDS * ROUND_DURATION + 0.05,
        );

        expect(casterShield(caster)).toBeUndefined();
    });

    it('is disabled without enough Light and castable at the base cost', () => {
        const broke = makeCaster(LIGHT_SHIELD_LIGHT_COST - 1);
        const funded = makeCaster(LIGHT_SHIELD_LIGHT_COST);

        expect(getAbilityDisabledReason({
            playerUnit: broke,
            ability: ShieldOfLightAbility,
            abilityId: CARD_ID,
            currentUses: 1,
            isMyTurn: true,
            allUnits: [broke, funded],
            conditionalCancelContext: null,
        })).toEqual({ reason_id: 'cannot_afford', resourceId: 'light' });

        expect(getAbilityDisabledReason({
            playerUnit: funded,
            ability: ShieldOfLightAbility,
            abilityId: CARD_ID,
            currentUses: 1,
            isMyTurn: true,
            allUnits: [broke, funded],
            conditionalCancelContext: null,
        })).toBeNull();
    });

    it('adds resourceCostFlat from research onto the displayed Light cost', () => {
        const caster = makeCaster(FLARE_LIGHT_COST, true);
        expect(getAbilityResourceCosts(ShieldOfLightAbility)).toEqual([
            { resourceId: 'light', amount: LIGHT_SHIELD_LIGHT_COST },
        ]);
        expect(getAbilityResourceCosts(ShieldOfLightAbility, caster)).toEqual([
            { resourceId: 'light', amount: FLARE_LIGHT_COST },
        ]);
    });

    it('Blinding Flare damages and knocks back darkness creatures only', () => {
        const caster = makeCaster(FLARE_LIGHT_COST, true);
        const dark = makeEnemy('dark', DARK_CREATURE_CHARACTER_ID, 80);
        const beast = makeEnemy('beast', BEAST_CHARACTER_ID, 90);
        const engine = makeEngine([caster, dark, beast]);
        const darkHpBefore = dark.hp;
        const beastHpBefore = beast.hp;

        executeUnitAbility(caster, ShieldOfLightAbility, [], engine);
        advanceSimulation([caster, dark, beast], engine, ACTIVE_TICK_ADVANCE);

        expect(dark.hp).toBe(darkHpBefore - LIGHT_SHIELD_FLARE_DAMAGE);
        expect(dark.knockback).toBeDefined();
        expect(dark.knockback).not.toBeNull();
        expect(beast.hp).toBe(beastHpBefore);
        expect(beast.knockback).toBeNull();
        expect(casterShield(caster)?.theme).toBe('light');
    });

    it('Blinding Flare raises the Light cost by the research add', () => {
        const broke = makeCaster(LIGHT_SHIELD_LIGHT_COST, true);
        const funded = makeCaster(FLARE_LIGHT_COST, true);

        expect(getAbilityDisabledReason({
            playerUnit: broke,
            ability: ShieldOfLightAbility,
            abilityId: CARD_ID,
            currentUses: 1,
            isMyTurn: true,
            allUnits: [broke, funded],
            conditionalCancelContext: null,
        })).toEqual({ reason_id: 'cannot_afford', resourceId: 'light' });

        expect(getAbilityDisabledReason({
            playerUnit: funded,
            ability: ShieldOfLightAbility,
            abilityId: CARD_ID,
            currentUses: 1,
            isMyTurn: true,
            allUnits: [broke, funded],
            conditionalCancelContext: null,
        })).toBeNull();
    });
});
