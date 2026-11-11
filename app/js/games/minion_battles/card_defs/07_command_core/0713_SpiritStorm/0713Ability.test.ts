import { describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { Unit } from '../../../game/units/Unit';
import { EventBus } from '../../../game/EventBus';
import { petStateOf } from '../../../game/units/components/petComponent';
import {
    LinkedAreaPulseBehaviour,
    linkedAreaPulseShare,
    linkedAreaTouches,
} from '../../../abilities/CastBehaviours/LinkedAreaPulseBehaviour';
import { PetRelocateBehaviour, PetSpinBehaviour } from '../../../abilities/CastBehaviours/PetBehaviours';
import { resolveCasterPetAnchor } from '../../../abilities/targeting';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { CastBehaviour, CastBehaviourRenderContext, CastBehaviourSetupContext, CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import { isUnitHeldByCast } from '../../../game/units/castHold';
import { FLING_THORN_ABILITY_ID } from '../0705_FlingThorn/0705Ability';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { SPIRIT_STORM_ABILITY_ID, SPIRIT_STORM_PULSES } from './0713Ability';

function makeUnit(id: string, x: number, y: number, teamId: 'player' | 'enemy', characterId = 'target_dummy'): Unit {
    return new Unit({ id, x, y, hp: 100, maxHp: 100, speed: 100, teamId, ownerId: teamId === 'player' ? 'p1' : 'ai', characterId, name: id });
}

function run(behaviour: CastBehaviour, caster: Unit, units: Unit[], target: ResolvedTarget, bus = new EventBus(), steps = 40): void {
    let payload: unknown;
    const engine = {
        units, gameTime: 0, eventBus: bus, terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        addEffect: () => {},
    } as unknown as AbilityEngineContext;
    const base = { caster, abilityId: SPIRIT_STORM_ABILITY_ID, target, allTargets: [target], castPayload: {}, setBehaviourPayload: (d: unknown) => { payload = d; }, engine };
    behaviour.onSetup?.({ ...base, behaviourPayload: undefined, windowSeconds: 1.6 } as CastBehaviourSetupContext);
    for (let i = 1; i <= steps; i++) {
        behaviour.onTick?.({
            ...base, behaviourPayload: payload, windowProgress: i / steps, prevWindowProgress: (i - 1) / steps,
            isFirstTick: i === 1, isLastTick: i === steps,
        } as CastBehaviourTickContext);
    }
}

function withSpirit(owner: Unit, x: number, y: number): Unit {
    const spirit = makeUnit('spirit', x, y, 'player', 'dog');
    petStateOf(spirit).ownerUnitId = owner.id;
    petStateOf(spirit).defId = 'dog';
    return spirit;
}

const none: ResolvedTarget = { type: 'pixel', position: { x: 0, y: 0 } };

describe('linked area', () => {
    const area = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, radius: 50, lineHalfWidth: 15 };

    it('covers both circles and the band between them', () => {
        expect(linkedAreaTouches(area, { x: 0, y: 45 })).toBe(true);
        expect(linkedAreaTouches(area, { x: 200, y: -45 })).toBe(true);
        expect(linkedAreaTouches(area, { x: 100, y: 10 })).toBe(true);
        expect(linkedAreaTouches(area, { x: 100, y: 30 })).toBe(false);
        expect(linkedAreaTouches(area, { x: 100, y: 30 }, 16)).toBe(true);
    });

    it('spreads pulses evenly through the window', () => {
        expect([0, 1, 2, 3].map((k) => linkedAreaPulseShare(k, 4))).toEqual([0.125, 0.375, 0.625, 0.875]);
    });
});

describe('Spirit Storm pulses', () => {
    it('pulses four times and hits an enemy once per pulse even where the parts overlap', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const spirit = withSpirit(caster, 60, 0);
        // Inside the caster circle, the spirit circle and the band at once.
        const enemy = makeUnit('enemy', 30, 0, 'enemy');
        const far = makeUnit('far', 30, 300, 'enemy');
        const bus = new EventBus();
        const hits: string[] = [];
        bus.on('damage_taken', (e) => hits.push(e.unitId));
        const pulse = new LinkedAreaPulseBehaviour()
            .withLink((ctx) => resolveCasterPetAnchor(ctx.caster, ctx.engine))
            .withRadius(50).withLineWidth(30).withPulses(4).withDamage(4);
        run(pulse, caster, [caster, spirit, enemy, far], none, bus);
        expect(hits).toEqual(['enemy', 'enemy', 'enemy', 'enemy']);
        expect(enemy.hp).toBe(84);
    });

    it('never hits allies or the spirit', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const spirit = withSpirit(caster, 60, 0);
        const ally = makeUnit('ally', 10, 0, 'player');
        const pulse = new LinkedAreaPulseBehaviour().withLink((ctx) => resolveCasterPetAnchor(ctx.caster, ctx.engine)).withPulses(4);
        run(pulse, caster, [caster, spirit, ally], none);
        expect(ally.hp).toBe(100);
        expect(spirit.hp).toBe(100);
    });

    it('is wired as four pulses on the ability, with a reposition pick anchored on the spirit', () => {
        const storm = getAbility(SPIRIT_STORM_ABILITY_ID)!;
        expect(SPIRIT_STORM_PULSES).toBe(4);
        const reposition = (storm.abilityTimings as { id?: string; targetDef?: { anchorUnit?: string; pickAtEntry?: boolean } }[])
            .find((t) => t.id === 'reposition');
        expect(reposition?.targetDef?.anchorUnit).toBe('casterPet');
        expect(reposition?.targetDef?.pickAtEntry).toBe(true);
    });
});

describe('spirit movement in the storm', () => {
    it('relocates the spirit to the picked point', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const spirit = withSpirit(caster, 60, 0);
        run(new PetRelocateBehaviour(), caster, [caster, spirit], { type: 'pixel', position: { x: 160, y: 40 } }, new EventBus(), 10);
        expect(spirit.x).toBeCloseTo(160);
        expect(spirit.y).toBeCloseTo(40);
    });

    it('spins the spirit as a render offset so its real position (and the storm) stays centred', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const spirit = withSpirit(caster, 100, 100);
        let maxOffset = 0;
        const spin = new PetSpinBehaviour().withRadius(7);
        const units = [caster, spirit];
        let payload: unknown;
        const engine = { units, getUnit: (id: string) => units.find((u) => u.id === id) } as unknown as AbilityEngineContext;
        const base = { caster, abilityId: 'x', target: none, allTargets: [none], castPayload: {}, setBehaviourPayload: (d: unknown) => { payload = d; }, engine };
        spin.onSetup({ ...base, behaviourPayload: undefined, windowSeconds: 1.6 } as CastBehaviourSetupContext);
        for (let i = 1; i <= 40; i++) {
            const windowProgress = i / 40;
            spin.onTick({ ...base, behaviourPayload: payload, windowProgress, prevWindowProgress: (i - 1) / 40, isFirstTick: i === 1, isLastTick: i === 40 } as CastBehaviourTickContext);
            expect(spirit.x).toBe(100);
            expect(spirit.y).toBe(100);
            const offsets = spin.getUnitRenderOffsets({ ...base, behaviourPayload: payload, windowProgress, gameTime: 0 } as CastBehaviourRenderContext)!;
            expect(offsets[0]!.unitId).toBe('spirit');
            maxOffset = Math.max(maxOffset, Math.hypot(offsets[0]!.x, offsets[0]!.y));
        }
        expect(maxOffset).toBeGreaterThan(5);
        expect(maxOffset).toBeLessThanOrEqual(7.0001);
        expect(spin.spinOffset(1, 1.6)).toEqual({ x: 0, y: 0 });
    });
});

describe('Spirit Storm needs a free spirit', () => {
    function castOn(spirit: Unit, abilityId: string, castPriority?: number): void {
        spirit.activeAbilities.push({
            abilityId, startTime: 0, targets: [], castBehaviourPayloads: {}, evadeFired: false,
            ...(castPriority !== undefined ? { castPriority } : {}),
        } as unknown as ActiveAbility);
    }

    it('sources from the nearest free spirit', () => {
        expect(getAbility(SPIRIT_STORM_ABILITY_ID)!.abilitySource).toEqual({ type: 'pet', selector: 'nearest', requireFree: true });
    });

    it('leaves a spirit mid–Fling Thorns windup alone: no relocate, no spin, storm on the player only', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const spirit = withSpirit(caster, 60, 0);
        castOn(spirit, FLING_THORN_ABILITY_ID, CAST_PRIORITY.Major);
        const units = [caster, spirit];
        const bus = new EventBus();
        const ended: string[] = [];
        bus.on('cast_ended_early', (e) => ended.push(e.abilityId));

        run(new PetRelocateBehaviour(), caster, units, { type: 'pixel', position: { x: 160, y: 40 } }, bus, 10);
        expect(spirit.x).toBe(60);
        expect(spirit.y).toBe(0);
        expect(spirit.activeAbilities.map((a) => a.abilityId)).toEqual([FLING_THORN_ABILITY_ID]);
        expect(ended).toEqual([]);
        expect(isUnitHeldByCast(spirit, units)).toBe(false);

        const engine = { units, gameTime: 0, getUnit: (id: string) => units.find((u) => u.id === id) };
        expect(resolveCasterPetAnchor(caster, engine, { requireFree: true })).toBeNull();
    });

    it('preempts a bite on a free spirit, then relocates it', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const spirit = withSpirit(caster, 60, 0);
        castOn(spirit, '0701');
        const bus = new EventBus();
        const ended: { abilityId: string; reason: string }[] = [];
        bus.on('cast_ended_early', (e) => ended.push({ abilityId: e.abilityId, reason: e.reason }));

        run(new PetRelocateBehaviour(), caster, [caster, spirit], { type: 'pixel', position: { x: 160, y: 40 } }, bus, 10);
        expect(spirit.activeAbilities).toEqual([]);
        expect(ended).toEqual([{ abilityId: '0701', reason: 'preempted' }]);
        expect(spirit.x).toBeCloseTo(160);
        expect(spirit.y).toBeCloseTo(40);
    });
});
