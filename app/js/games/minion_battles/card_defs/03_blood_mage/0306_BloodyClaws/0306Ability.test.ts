import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { BLEED_BUFF_TYPE, type BleedBuff } from '../../../buffs/BleedBuff';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import {
    BLOODY_CLAWS_CLAW_BASE,
    BLOODY_CLAWS_CLAW_TIP,
    BLOODY_CLAWS_DAMAGE,
    BLOODY_CLAWS_MAX_REACH,
    BLOODY_CLAWS_HP_COST,
    BLOODY_CLAWS_MAX_USES,
    BLOODY_CLAWS_TIMINGS,
    BloodyClawsAbility_0306,
} from './0306Ability';
import { BLOOD_MAGE_NODE_CLAWS, BLOOD_MAGE_NODE_CORE, bloodMageTree } from '../../../../../researchTrees/trees/blood_mage';

const CARD_ID = BloodyClawsAbility_0306.id;
const TICK_DT = 0.01;
const T = BLOODY_CLAWS_TIMINGS;

function makeUnit(id: string, x: number, y: number, team: 'player' | 'enemy'): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: team as TeamId,
        ownerId: team === 'player' ? 'p1' : 'enemy_ai',
        characterId: team === 'player' ? 'player' : 'enemy',
        name: id,
        abilities: team === 'player' ? [CARD_ID] : [],
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function setup(enemies: Unit[]) {
    const caster = makeUnit('caster', 0, 0, 'player');
    caster.abilityRuntime[CARD_ID] = {
        currentUses: BLOODY_CLAWS_MAX_USES,
        maxUses: BLOODY_CLAWS_MAX_USES,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    const units = [caster, ...enemies];
    const engine = {
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
        addProjectile: vi.fn(),
    } as unknown as EngineContext;
    return { caster, engine };
}

const px = (x: number, y: number): ResolvedTarget => ({ type: 'pixel', position: { x, y } });

/** Cast with each strike aimed at its own pixel (no lock-ons, so hits are purely geometric). */
function cast(caster: Unit, engine: EngineContext, aims: { left: ResolvedTarget; right: ResolvedTarget; x: ResolvedTarget }) {
    executeUnitAbility(caster, BloodyClawsAbility_0306, [aims.x], engine);
    const active = caster.activeAbilities.find((a) => a.abilityId === CARD_ID)!;
    active.targetsByLabel = { 'Swipe left': aims.left, 'Swipe right': aims.right, 'X strike': aims.x };
}

function advanceTo(caster: Unit, engine: EngineContext, seconds: number) {
    while (engine.gameTime < seconds) {
        engine.gameTime += TICK_DT;
        tickUnitActiveAbilities(caster, TICK_DT, engine, vi.fn());
    }
}

/**
 * World point `t` (0 = base, 1 = tip) along a claw for a caster at the origin aiming at `aimDeg`
 * (0 = up, clockwise). The right claw mirrors the left one across the aim line.
 */
function clawPoint(t: number, claw: 'left' | 'right', aimDeg = 0): { x: number; y: number } {
    const mirror = claw === 'right' ? -1 : 1;
    const forward = BLOODY_CLAWS_CLAW_BASE.forward + (BLOODY_CLAWS_CLAW_TIP.forward - BLOODY_CLAWS_CLAW_BASE.forward) * t;
    const side = mirror * (BLOODY_CLAWS_CLAW_BASE.side + (BLOODY_CLAWS_CLAW_TIP.side - BLOODY_CLAWS_CLAW_BASE.side) * t);
    const a = (aimDeg * Math.PI) / 180;
    const dir = { x: Math.sin(a), y: -Math.cos(a) };
    const right = { x: -dir.y, y: dir.x };
    return { x: dir.x * forward + right.x * side, y: dir.y * forward + right.y * side };
}

/** Where the two claws cross (on the aim line). */
const CROSS_T = -BLOODY_CLAWS_CLAW_BASE.side / (BLOODY_CLAWS_CLAW_TIP.side - BLOODY_CLAWS_CLAW_BASE.side);
const enemyAt = (id: string, p: { x: number; y: number }) => makeUnit(id, p.x, p.y, 'enemy');

const bleedStacks = (u: Unit) => (u.buffs.find((b) => b._type === BLEED_BUFF_TYPE) as BleedBuff | undefined)?.stacks ?? 0;
const UP = { left: px(0, -100), right: px(0, -100), x: px(0, -100) };

describe('BloodyClawsAbility_0306', () => {
    it('swipes left, then right: each claw only hits its own side', () => {
        // Caster faces up. The left claw runs from the caster's left side forward-right.
        // Near the bases, where the two claws are far apart.
        const onLeftClaw = enemyAt('left', clawPoint(0.1, 'left'));
        const onRightClaw = enemyAt('right', clawPoint(0.1, 'right'));
        const { caster, engine } = setup([onLeftClaw, onRightClaw]);
        cast(caster, engine, UP);

        advanceTo(caster, engine, T.swipeLeftEnd);
        expect(onLeftClaw.hp).toBe(100 - BLOODY_CLAWS_DAMAGE);
        expect(onRightClaw.hp).toBe(100);

        advanceTo(caster, engine, T.swipeRightEnd);
        expect(onLeftClaw.hp).toBe(100 - BLOODY_CLAWS_DAMAGE);
        expect(onRightClaw.hp).toBe(100 - BLOODY_CLAWS_DAMAGE);
    });

    it('hits a unit where the claws cross with every claw: 4 hits and 4 bleed stacks', () => {
        const atCrossing = enemyAt('cross', clawPoint(CROSS_T, 'left'));
        const { caster, engine } = setup([atCrossing]);
        cast(caster, engine, UP);
        advanceTo(caster, engine, T.cooldownEnd);
        expect(atCrossing.hp).toBe(100 - BLOODY_CLAWS_DAMAGE * 4);
        expect(bleedStacks(atCrossing)).toBe(4);
    });

    it('caps each claw at 3 enemies', () => {
        const crowd = [0, 1, 2, 3, 4].map((i) => enemyAt(`e${i}`, clawPoint(i * 0.25, 'left')));
        const { caster, engine } = setup(crowd);
        cast(caster, engine, UP);
        advanceTo(caster, engine, T.swipeLeftEnd);
        expect(crowd.filter((u) => u.hp < 100)).toHaveLength(3);
    });

    it('rotates the claws with the aim', () => {
        // Aiming right: the left claw now runs from above the caster forward-down.
        const rotatedLeftClaw = enemyAt('rotated', clawPoint(0.1, 'left', 90));
        const unrotatedSpot = enemyAt('unrotated', clawPoint(0.1, 'left', 0));
        const { caster, engine } = setup([rotatedLeftClaw, unrotatedSpot]);
        cast(caster, engine, { left: px(100, 0), right: px(100, 0), x: px(100, 0) });
        advanceTo(caster, engine, T.swipeLeftEnd);
        expect(rotatedLeftClaw.hp).toBe(100 - BLOODY_CLAWS_DAMAGE);
        expect(unrotatedSpot.hp).toBe(100);
    });

    it('clamps a follow-up strike that turns more than 30 degrees from the previous one', () => {
        // Swipe right aimed straight right (90 degrees off) is clamped to 30 degrees off "up".
        const at30Degrees = enemyAt('at30', clawPoint(CROSS_T, 'right', 30));
        const { caster, engine } = setup([at30Degrees]);
        cast(caster, engine, { left: px(0, -100), right: px(100, 0), x: px(100, 0) });
        advanceTo(caster, engine, T.swipeLeftEnd);
        const afterLeft = at30Degrees.hp;
        advanceTo(caster, engine, T.swipeRightEnd);
        // The clamped right claw crosses its aim line at the same spot the claws cross: a hit.
        expect(at30Degrees.hp).toBe(afterLeft - BLOODY_CLAWS_DAMAGE);
    });

    it('stays within two body lengths of the caster', () => {
        for (const p of [BLOODY_CLAWS_CLAW_BASE, BLOODY_CLAWS_CLAW_TIP]) {
            expect(Math.hypot(p.forward, p.side)).toBeLessThanOrEqual(BLOODY_CLAWS_MAX_REACH);
        }
        expect(BloodyClawsAbility_0306.aiSettings?.maxRange).toBeLessThanOrEqual(BLOODY_CLAWS_MAX_REACH);
    });

    it('pays its HP cost on the first swipe', () => {
        const { caster, engine } = setup([]);
        cast(caster, engine, UP);
        advanceTo(caster, engine, T.windupEnd - 0.02);
        expect(caster.hp).toBe(100);
        advanceTo(caster, engine, T.swipeLeftEnd);
        expect(caster.hp).toBe(100 - BLOODY_CLAWS_HP_COST);
    });

    it('describes its damage as "5 x 4 damage"', () => {
        const lines = BloodyClawsAbility_0306.getTooltipText();
        expect(lines[0]).toContain('{5} x 4 damage');
    });
});

describe('Bloody Claws research node', () => {
    it('is a tier-10 node requiring Blood Mage Core that grants card 0306', () => {
        const node = bloodMageTree.nodes.find((n) => n.id === BLOOD_MAGE_NODE_CLAWS);
        expect(node?.tier).toBe(10);
        expect(node?.prereqNodeIds).toEqual([BLOOD_MAGE_NODE_CORE]);
        expect(node?.effects).toContainEqual({ type: 'addCard', cardId: CARD_ID });
    });
});
