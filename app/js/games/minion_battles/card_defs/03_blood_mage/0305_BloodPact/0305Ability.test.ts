import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { registerDamageLinkListeners } from '../../../game/units/unitDamageLinks';
import { DAMAGE_LINK_BUFF_TYPE, type DamageLinkBuff } from '../../../buffs/DamageLinkBuff';
import { HP_DRAIN_BUFF_TYPE } from '../../../buffs/HpDrainBuff';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import {
    BLOOD_PACT_CASTER_SHIELD_SHARE,
    BLOOD_PACT_DURATION_SECONDS,
    BLOOD_PACT_REDIRECT_FRACTION,
    BLOOD_PACT_WINDUP_DURATION,
    BloodPactAbility_0305,
} from './0305Ability';
import { BLOOD_MAGE_NODE_CORE, BLOOD_MAGE_NODE_PACT, bloodMageTree } from '../../../../../researchTrees/trees/blood_mage';

const CARD_ID = BloodPactAbility_0305.id;
const TICK_DT = 0.01;

function makeUnit(id: string, x: number): Unit {
    const unit = new Unit({
        id,
        x,
        y: 0,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player' as TeamId,
        ownerId: id === 'caster' ? 'p1' : 'p2',
        characterId: 'player',
        name: id,
        abilities: id === 'caster' ? [CARD_ID] : [],
        radius: DEFAULT_UNIT_RADIUS,
    });
    if (id === 'caster') {
        unit.abilityRuntime[CARD_ID] = {
            currentUses: 1,
            maxUses: 1,
            recoveryChargesByType: {},
            active: true,
            replacedAbilityId: null,
        };
    }
    return unit;
}

function setup() {
    const caster = makeUnit('caster', 0);
    const ally = makeUnit('ally', 100);
    const units = [caster, ally];
    const eventBus = new EventBus();
    registerDamageLinkListeners({ eventBus, getUnit: (id) => units.find((u) => u.id === id), getUnits: () => units });
    const engine = {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus,
        units,
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
        addProjectile: vi.fn(),
    } as unknown as EngineContext;
    return { caster, ally, engine };
}

function castOn(caster: Unit, target: Unit, engine: EngineContext): void {
    const targets: ResolvedTarget[] = [{ type: 'unit', unitId: target.id }];
    executeUnitAbility(caster, BloodPactAbility_0305, targets, engine);
    const steps = Math.ceil((BLOOD_PACT_WINDUP_DURATION + 0.05) / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        tickUnitActiveAbilities(caster, TICK_DT, engine, vi.fn());
    }
}

describe('BloodPactAbility_0305', () => {
    it('links the ally to the caster for 2 rounds and starts the HP drain instead of paying up front', () => {
        const { caster, ally, engine } = setup();
        castOn(caster, ally, engine);

        const link = ally.buffs.find((b) => b._type === DAMAGE_LINK_BUFF_TYPE) as DamageLinkBuff | undefined;
        expect(link?.linkedUnitId).toBe(caster.id);
        expect(link?.redirectFraction).toBe(BLOOD_PACT_REDIRECT_FRACTION);
        expect(link?.linkedShieldShare).toBe(BLOOD_PACT_CASTER_SHIELD_SHARE);
        expect(link?.duration).toEqual({ value: BLOOD_PACT_DURATION_SECONDS, unit: 'seconds' });
        expect(caster.hasBuff(HP_DRAIN_BUFF_TYPE)).toBe(true);
        expect(caster.hp).toBe(100);
    });

    it('sends half of the ally\'s life loss to the caster once the pact is up', () => {
        const { caster, ally, engine } = setup();
        castOn(caster, ally, engine);
        ally.takeDamage(20, null, engine.eventBus);
        expect(ally.hp).toBe(90);
        expect(caster.hp).toBe(90);
    });

    it('recasting on the same ally refreshes the pact instead of stacking it', () => {
        const { caster, ally, engine } = setup();
        castOn(caster, ally, engine);
        caster.abilityRuntime[CARD_ID]!.currentUses = 1;
        castOn(caster, ally, engine);
        expect(ally.buffs.filter((b) => b._type === DAMAGE_LINK_BUFF_TYPE)).toHaveLength(1);
    });
});

describe('Blood Pact research node', () => {
    it('is a tier-12 node requiring Blood Mage Core that grants card 0305', () => {
        const node = bloodMageTree.nodes.find((n) => n.id === BLOOD_MAGE_NODE_PACT);
        expect(node?.tier).toBe(12);
        expect(node?.prereqNodeIds).toEqual([BLOOD_MAGE_NODE_CORE]);
        expect(node?.effects).toContainEqual({ type: 'addCard', cardId: CARD_ID });
    });
});
