import { beforeEach, describe, expect, it, vi } from 'vitest';
// Registry first: it owns the module-load order for the ability <-> CastBehaviours import cycle.
import { getAbility } from '../../../abilities/AbilityRegistry';
import { LayHandsAbility } from './0806Ability';
import {
    LAY_HANDS_ABILITY_ID,
    LAY_HANDS_EXPLOSION_DAMAGE,
    LAY_HANDS_LUNGE_DISTANCE,
    LAY_HANDS_PUNCH_DAMAGE,
} from './0806Constants';
import { PunchNEWAbility } from '../../0120_PunchNEW/0120Ability';
import { LightSource } from '../../../game/lightSources/LightSource';
import { LightSourceManager } from '../../../game/lightSources/LightSourceManager';
import { DeployableRegistry } from '../../../game/deployables/DeployableRegistry';
import type { Deployable } from '../../../game/deployables/Deployable';
import type { Unit } from '../../../game/units/Unit';
import type { TeamId } from '../../../game/teams';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    LIGHT_LAY_HANDS_TIER,
    LIGHT_NODE_CORE,
    LIGHT_NODE_LAY_HANDS,
    LIGHT_TREE_ID,
    lightTree,
} from '../../../../../researchTrees/trees/light';

const damageSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../abilities/targetHelpers', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../abilities/targetHelpers')>()),
    damageEnemiesInCircle: damageSpy,
}));
vi.mock('./0806Vfx', () => ({ spawnLayHandsBlast: vi.fn(), spawnLayHandsMotes: vi.fn() }));

describe('Lay Hands ability', () => {
    it('is registered under its id, and the typed note id matches', () => {
        expect(LAY_HANDS_ABILITY_ID).toBe('0806');
        expect(getAbility(LAY_HANDS_ABILITY_ID)).toBe(LayHandsAbility);
    });

    it('triples the Punch lunge and keeps Punch damage and reach', () => {
        expect(LayHandsAbility.lunge?.distance).toBe(LAY_HANDS_LUNGE_DISTANCE);
        expect(LayHandsAbility.lunge?.distance).toBe(3 * (PunchNEWAbility.lunge?.distance ?? 0));
        expect(LAY_HANDS_PUNCH_DAMAGE).toBe(8);
        expect(LAY_HANDS_EXPLOSION_DAMAGE).toBe(6);
    });

    it('adds the emitter lock at windup start and the detonation inside the strike window', () => {
        const timings = LayHandsAbility.abilityTimings as Array<{ id: string; castBehaviours?: unknown[] }>;
        expect(timings.find((t) => t.id === 'windup')?.castBehaviours).toHaveLength(1);
        expect(timings.find((t) => t.id === 'strike')?.castBehaviours).toHaveLength(2);
    });

    it('draws extra select-target preview for the locked emitter', () => {
        expect(typeof LayHandsAbility.renderSelectTargetPreviewExtras).toBe('function');
    });
});

describe('Lay Hands research node', () => {
    it('is a tier-14 Light Core follow-up that grants the Lay Hands card', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_LAY_HANDS);
        expect(node?.title).toBe('Lay Hands');
        expect(node?.tier).toBe(14);
        expect(LIGHT_LAY_HANDS_TIER).toBe(14);
        expect(node?.prereqNodeIds).toEqual([LIGHT_NODE_CORE]);
        expect(node?.effects).toEqual([{ type: 'addCard', cardId: LAY_HANDS_ABILITY_ID }]);
        expect(LIGHT_TREE_ID).toBe('light_core');
    });
});

describe('Lay Hands emitter selection (team-gated deployables)', () => {
    type Timing = { id: string; castBehaviours?: Array<{ behaviour: { onTick: (c: unknown) => void } }> };
    const timings = LayHandsAbility.abilityTimings as unknown as Timing[];
    const lockBehaviour = timings.find((t) => t.id === 'windup')!.castBehaviours![0].behaviour;
    const detonateBehaviour = timings.find((t) => t.id === 'strike')!.castBehaviours![1].behaviour;

    function setup(sources: Array<[string, number, TeamId | undefined]>) {
        const mgr = new LightSourceManager({ getUnit: () => undefined } as never);
        for (const [id, x, teamId] of sources) {
            mgr.addLightSource(new LightSource({
                id,
                x,
                y: 0,
                lightAmount: 4,
                radius: 2,
                teamId,
                decay: { roundCreated: 0, initialLightAmount: 4, initialRadius: 2, roundsTotal: 1000 },
            }));
        }
        const registry = new DeployableRegistry();
        registry.registerProvider(mgr);
        let note: unknown;
        const caster = {
            x: 0,
            y: 0,
            teamId: 'player',
            get abilityNote() {
                return note;
            },
            setAbilityNote: (n: unknown) => {
                note = n;
            },
        } as unknown as Unit;
        const engine = {
            findDeployables: (q: Parameters<DeployableRegistry['findDeployables']>[0]) => registry.findDeployables(q),
            consumeDeployable: (d: Pick<Deployable, 'id' | 'kind'>) => registry.consumeDeployable(d),
        };
        const ctx = { engine, caster, isFirstTick: true };
        const active = (id: string) => mgr.lightSources.find((l) => l.id === id)!.active;
        return { ctx, active, note: () => note as { abilityNote: { emitterId: string | null } } };
    }

    beforeEach(() => damageSpy.mockClear());

    it('locks and detonates an own-team emitter inside the 5x5, consuming it', () => {
        const { ctx, active, note } = setup([['mine', 2 * CELL_SIZE, 'player']]);
        lockBehaviour.onTick(ctx);
        expect(note().abilityNote.emitterId).toBe('mine');
        detonateBehaviour.onTick(ctx);
        expect(active('mine')).toBe(false);
        expect(damageSpy).toHaveBeenCalledTimes(1);
        expect(damageSpy.mock.calls[0][0].center).toEqual({ x: 2 * CELL_SIZE, y: 0 });
    });

    it('ignores enemy-team and ownerless lights (even nearer ones) and does not detonate them', () => {
        const { ctx, active, note } = setup([
            ['enemy', 10, 'enemy'],
            ['ownerless', 20, undefined],
        ]);
        lockBehaviour.onTick(ctx);
        expect(note().abilityNote.emitterId).toBeNull();
        detonateBehaviour.onTick(ctx);
        expect(active('enemy')).toBe(true);
        expect(active('ownerless')).toBe(true);
        expect(damageSpy).not.toHaveBeenCalled();
    });

    it('prefers a farther own-team emitter over a nearer enemy one; respects the 5x5 edge', () => {
        const { ctx, note } = setup([
            ['enemyNear', 10, 'enemy'],
            ['outside', 2 * CELL_SIZE + 1, 'player'],
            ['mineFar', 2 * CELL_SIZE, 'player'],
        ]);
        lockBehaviour.onTick(ctx);
        expect(note().abilityNote.emitterId).toBe('mineFar');
    });
});
