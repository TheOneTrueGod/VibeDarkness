/**
 * The spirit animal (Command Core): ethereal body, anchor orders (Order: Move / Guard), owner weapon-hit
 * reactions, and the dash strike that Spirit Strike and Spirit Flurry are built from.
 */
import { describe, expect, it } from 'vitest';
import '../../abilities/AbilityRegistry';
import { Unit } from './Unit';
import { EventBus } from '../EventBus';
import { findEnemies } from './unitAI/utils';
import type { PetAITreeContext } from './unitAI/pet/context';
import { resolvePetAnchor } from './unitAI/pet/pet_follow';
import { commandPetGuard, commandPetOrderMove } from '../../abilities/petCommands';
import { handlePetReactionsOnAttackHit } from './petReactions';
import { DashStrikeBehaviour } from '../../abilities/CastBehaviours/DashStrikeBehaviour';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import type { CastBehaviourSetupContext, CastBehaviourTickContext } from '../../abilities/castBehaviourTypes';
import type { ResolvedTarget } from '../types';
import { getPetDef } from './pet_defs/petDef';
import { petStateOf } from './components/petComponent';
import { getAbility } from '../../abilities/AbilityRegistry';
import { SPIRIT_FLURRY_ABILITY_ID } from '../../card_defs/07_command_core/0711_SpiritFlurry/0711Ability';

function makeUnit(id: string, x: number, y: number, teamId: 'player' | 'enemy', characterId = 'target_dummy'): Unit {
    return new Unit({
        id, x, y, hp: 100, maxHp: 100, speed: 100, teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai', characterId, name: id,
    });
}

function makeSpirit(owner: Unit, x = 50, y = 50): Unit {
    const pet = makeUnit('spirit', x, y, 'player', 'dog');
    pet.aiContext = { aiTree: 'pet' } as PetAITreeContext;
    petStateOf(pet).ownerUnitId = owner.id;
    petStateOf(pet).defId = 'dog';
    pet.abilities = [...getPetDef('dog')!.abilityIds];
    return pet;
}

describe('ethereal spirit', () => {
    it('is untargetable, so enemies never pick it', () => {
        const owner = makeUnit('owner', 0, 0, 'player');
        const spirit = makeSpirit(owner);
        const enemy = makeUnit('enemy', 100, 0, 'enemy');
        expect(spirit.isUntargetable()).toBe(true);
        expect(findEnemies(enemy, [owner, spirit, enemy]).map((u) => u.id)).toEqual(['owner']);
    });

    it('takes no damage', () => {
        const owner = makeUnit('owner', 0, 0, 'player');
        const spirit = makeSpirit(owner);
        spirit.takeDamage(50, 'enemy', new EventBus());
        expect(spirit.hp).toBe(100);
    });
});

describe('anchor orders', () => {
    it('Order: Move anchors on the point, Guard anchors back on the owner', () => {
        const owner = makeUnit('owner', 0, 0, 'player');
        const spirit = makeSpirit(owner);
        commandPetOrderMove([spirit], { x: 300, y: 120 }, { gameTime: 0, gameTick: 0 });
        const ctx = spirit.aiContext as PetAITreeContext;
        expect(resolvePetAnchor(ctx, owner)).toEqual({ x: 300, y: 120 });
        commandPetGuard([spirit], {});
        expect(resolvePetAnchor(ctx, owner)).toBe(owner);
    });

    it('the spirit def never auto-engages and wanders within 50px', () => {
        const def = getPetDef('dog')!;
        expect(def.autoEngage).toBe(false);
        expect(def.anchorRadius).toBe(50);
    });
});

function reactionEngine(units: Unit[]) {
    const queued: { tick: number; order: { unitId: string; abilityId: string; targets: ResolvedTarget[] } }[] = [];
    const engine = {
        units,
        gameTick: 10,
        getUnit: (id: string) => units.find((u) => u.id === id),
        state: { orderMgr: { queueOrder: (tick: number, order: (typeof queued)[number]['order']) => queued.push({ tick, order }) } },
    } as unknown as AbilityEngineContext;
    return { engine, queued };
}

describe('owner weapon-hit reaction', () => {
    it('orders an idle spirit to Spirit Strike the enemy hit by a weapon ability', () => {
        const owner = makeUnit('owner', 0, 0, 'player');
        owner.weaponAbilityIds = ['0001'];
        const spirit = makeSpirit(owner);
        const enemy = makeUnit('enemy', 80, 0, 'enemy');
        const { engine, queued } = reactionEngine([owner, spirit, enemy]);
        handlePetReactionsOnAttackHit(engine, { sourceUnitId: 'owner', targetUnitId: 'enemy', abilityId: '0001' });
        expect(queued).toEqual([{ tick: 11, order: { unitId: 'spirit', abilityId: '0710', targets: [{ type: 'unit', unitId: 'enemy' }] } }]);
    });

    it('ignores non-weapon hits and a busy spirit', () => {
        const owner = makeUnit('owner', 0, 0, 'player');
        owner.weaponAbilityIds = ['0001'];
        const spirit = makeSpirit(owner);
        const enemy = makeUnit('enemy', 80, 0, 'enemy');
        const { engine, queued } = reactionEngine([owner, spirit, enemy]);
        handlePetReactionsOnAttackHit(engine, { sourceUnitId: 'owner', targetUnitId: 'enemy', abilityId: '0501' });
        spirit.activeAbilities.push({ abilityId: '0711', startTime: 0, targets: [] } as Unit['activeAbilities'][number]);
        handlePetReactionsOnAttackHit(engine, { sourceUnitId: 'owner', targetUnitId: 'enemy', abilityId: '0001' });
        expect(queued).toHaveLength(0);
    });
});

function runStrike(strike: DashStrikeBehaviour, caster: Unit, units: Unit[], targetId: string, eventBus: EventBus): void {
    let payload: unknown;
    const engine = {
        units, gameTime: 0, eventBus, terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        addEffect: () => {},
    } as unknown as AbilityEngineContext;
    const target: ResolvedTarget = { type: 'unit', unitId: targetId };
    const base = { caster, abilityId: '0710', target, allTargets: [target], castPayload: {}, setBehaviourPayload: (d: unknown) => { payload = d; }, engine };
    strike.onSetup({ ...base, behaviourPayload: undefined, windowSeconds: 0.12 } as CastBehaviourSetupContext);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
        const ctx: CastBehaviourTickContext = {
            ...base, behaviourPayload: payload, windowProgress: i / steps, prevWindowProgress: (i - 1) / steps,
            isFirstTick: i === 1, isLastTick: i === steps,
        };
        strike.onTick(ctx);
    }
}

describe('dash strike', () => {
    it('blinks to the near side, dashes through the target and hits only it, once', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const target = makeUnit('target', 200, 0, 'enemy');
        const bystander = makeUnit('bystander', 200, 0, 'enemy');
        const bus = new EventBus();
        const hits: string[] = [];
        bus.on('damage_taken', (e) => hits.push(`${e.unitId}:${e.amount}`));
        runStrike(new DashStrikeBehaviour().withDamage(3), caster, [caster, target, bystander], 'target', bus);
        expect(hits).toEqual(['target:3']);
        // Ended on the far side of the target, along the approach line.
        expect(caster.x).toBeGreaterThan(200 + target.radius);
        expect(Math.abs(caster.y)).toBeLessThan(1e-6);
    });

    it('rotates the approach by its angle offset', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const target = makeUnit('target', 200, 0, 'enemy');
        runStrike(new DashStrikeBehaviour().withAngleOffset(90), caster, [caster, target], 'target', new EventBus());
        expect(Math.abs(caster.x - 200)).toBeLessThan(1e-6);
        expect(caster.y).toBeGreaterThan(target.radius);
    });
});

describe('Spirit Flurry', () => {
    it('is four dash strikes over about a second', () => {
        const flurry = getAbility(SPIRIT_FLURRY_ABILITY_ID)!;
        const strikes = (flurry.abilityTimings as { id?: string; end?: number }[]).filter((t) => t.id?.startsWith('strike'));
        expect(strikes).toHaveLength(4);
        const end = Math.max(...strikes.map((t) => t.end ?? 0));
        expect(end).toBeGreaterThanOrEqual(0.8);
        expect(end).toBeLessThanOrEqual(1.2);
    });
});
