/**
 * MultiChargeAttack aiming: each dash aims at the start of its own telegraph. When the cast was aimed
 * at a unit (AI orders derive the pixel aim from a unit), every follow-up dash re-aims at that unit's
 * position at that moment; a plain ground aim keeps the fixed point.
 */
import { describe, it, expect } from 'vitest';
import '../AbilityRegistry';
import { Unit } from '../../game/units/Unit';
import type { TeamId } from '../../game/teams';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import { AlphaWolfTripleChargeAbility } from '../../card_defs/dark_animals/0011_AlphaWolfTripleCharge/0011Ability';
import { buildResolvedTargets } from '../../game/units/unitAI/utils';
import type { MultiChargeNote } from './MultiChargeAttack';

function makeUnit(id: string, teamId: string, x: number, y = 0): Unit {
    return new Unit({
        id, x, y, hp: 100, maxHp: 100, speed: 100,
        teamId: teamId as TeamId, ownerId: teamId === 'enemy' ? 'ai' : 'p1',
        characterId: teamId === 'enemy' ? 'alpha_wolf' : 'player', name: id,
    });
}

function makeEngine(units: Unit[]): AbilityEngineContext {
    return {
        units,
        gameTime: 5,
        roundNumber: 1,
        eventBus: { emit: () => {} },
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        addEffect: () => {},
        generateRandomInteger: () => 0,
    } as unknown as AbilityEngineContext;
}

/** The Charge behaviour attached to dash window `dashId` (e.g. 'dash1'). */
function dashBehaviour(dashId: string): CastBehaviour {
    const interval = AlphaWolfTripleChargeAbility.abilityTimings.find((t) => t.id === dashId);
    const behaviour = interval?.castBehaviours?.[0]?.behaviour;
    if (!behaviour) throw new Error(`no behaviour on ${dashId}`);
    return behaviour;
}

/** Runs the final tick of a dash window, which is when the next dash takes its aim. */
function endDash(dashId: string, caster: Unit, engine: AbilityEngineContext, note: MultiChargeNote): void {
    const ctx: CastBehaviourTickContext = {
        caster,
        abilityId: AlphaWolfTripleChargeAbility.id,
        target: { type: 'pixel', position: { x: note.aimX, y: note.aimY } },
        allTargets: [],
        castPayload: note,
        behaviourPayload: undefined,
        setBehaviourPayload: () => {},
        engine,
        windowProgress: 1,
        prevWindowProgress: 0.95,
        isFirstTick: false,
        isLastTick: true,
    };
    dashBehaviour(dashId).onTick?.(ctx);
}

function beginCast(caster: Unit, engine: AbilityEngineContext, targets: ResolvedTarget[]): MultiChargeNote {
    const active = { castPayload: undefined } as unknown as ActiveAbility;
    AlphaWolfTripleChargeAbility.beginActiveCast!(engine, caster, targets, active);
    return active.castPayload as MultiChargeNote;
}

describe('MultiChargeAttack aiming (Alpha Wolf Triple Charge)', () => {
    it('re-aims each follow-up dash at the targeted unit where it stands when that telegraph starts', () => {
        const wolf = makeUnit('wolf', 'enemy', 0, 0);
        const player = makeUnit('hero', 'player', 100, 0);
        const engine = makeEngine([wolf, player]);

        // The AI's order: a pixel aim derived from the player unit.
        const note = beginCast(wolf, engine, buildResolvedTargets(AlphaWolfTripleChargeAbility, player));
        expect(note.dashes[0]).toMatchObject({ targetX: 100, targetY: 0 });

        player.x = 60;
        player.y = 90;
        endDash('dash1', wolf, engine, note);
        expect(note.dashes[1]).toMatchObject({ targetX: 60, targetY: 90 });

        player.x = -40;
        player.y = 120;
        endDash('dash2', wolf, engine, note);
        expect(note.dashes[2]).toMatchObject({ targetX: -40, targetY: 120 });
    });

    it('keeps a plain ground aim fixed across dashes', () => {
        const wolf = makeUnit('wolf', 'enemy', 0, 0);
        const player = makeUnit('hero', 'player', 100, 0);
        const engine = makeEngine([wolf, player]);

        const note = beginCast(wolf, engine, [{ type: 'pixel', position: { x: 80, y: 10 } }]);
        player.x = 60;
        player.y = 90;
        endDash('dash1', wolf, engine, note);
        expect(note.dashes[1]).toMatchObject({ targetX: 80, targetY: 10 });
    });

    it('falls back to the last aim point if the tracked unit dies', () => {
        const wolf = makeUnit('wolf', 'enemy', 0, 0);
        const player = makeUnit('hero', 'player', 100, 0);
        const engine = makeEngine([wolf, player]);

        const note = beginCast(wolf, engine, buildResolvedTargets(AlphaWolfTripleChargeAbility, player));
        player.hp = 0;
        endDash('dash1', wolf, engine, note);
        expect(note.dashes[1]).toMatchObject({ targetX: 100, targetY: 0 });
    });
});
