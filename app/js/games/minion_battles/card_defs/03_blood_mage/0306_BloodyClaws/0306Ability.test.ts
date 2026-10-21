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
import { getEffectiveCastBehaviours, normalizeAbilityTimingsToIntervals } from '../../../abilities/abilityTimings';
import {
    BLOODY_CLAWS_CLAW_BASE,
    BLOODY_CLAWS_CLAW_TIP,
    BLOODY_CLAWS_DAMAGE,
    BLOODY_CLAWS_MAX_REACH,
    BLOODY_CLAWS_STRIKE_SLIDE,
    BLOODY_CLAWS_FIRST_STRIKE_LUNGE,
    BLOODY_CLAWS_FOLLOW_UP_LUNGE,
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
    executeUnitAbility(caster, BloodyClawsAbility_0306, [aims.left, aims.right, aims.x], engine);
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
// Aimed within the claws' reach, so no step lunge moves the caster: these tests are about claw shape.
const UP = { left: px(0, -60), right: px(0, -60), x: px(0, -60) };

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
        cast(caster, engine, { left: px(60, 0), right: px(60, 0), x: px(60, 0) });
        advanceTo(caster, engine, T.swipeLeftEnd);
        expect(rotatedLeftClaw.hp).toBe(100 - BLOODY_CLAWS_DAMAGE);
        expect(unrotatedSpot.hp).toBe(100);
    });

    it('clamps a follow-up strike that turns more than 30 degrees from the previous one', () => {
        // Swipe right aimed straight right (90 degrees off) is clamped to 30 degrees off "up".
        const at30Degrees = enemyAt('at30', clawPoint(CROSS_T, 'right', 30));
        const { caster, engine } = setup([at30Degrees]);
        cast(caster, engine, { left: px(0, -60), right: px(60, 0), x: px(60, 0) });
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
        // The AI's reach adds the windup lunge (a real step) on top of the claws themselves.
        expect(BloodyClawsAbility_0306.aiSettings?.maxRange).toBeLessThanOrEqual(
            BLOODY_CLAWS_MAX_REACH + BLOODY_CLAWS_FIRST_STRIKE_LUNGE,
        );
    });

    it('lands each strike at its impact moment, not when its window opens', () => {
        const onLeftClaw = enemyAt('left', clawPoint(0.1, 'left'));
        const { caster, engine } = setup([onLeftClaw]);
        cast(caster, engine, UP);
        advanceTo(caster, engine, T.swipeLeftImpact - 0.02);
        expect(onLeftClaw.hp).toBe(100);
        advanceTo(caster, engine, T.swipeLeftImpact + 0.02);
        expect(onLeftClaw.hp).toBe(100 - BLOODY_CLAWS_DAMAGE);
    });

    it('gives every strike a lead long enough to see the lunge (at least 0.1s before impact)', () => {
        expect(T.swipeLeftImpact - T.windupEnd).toBeGreaterThanOrEqual(0.1 - 1e-9);
        expect(T.swipeRightImpact - T.swipeRightStart).toBeGreaterThanOrEqual(0.1 - 1e-9);
        expect(T.xStrikeImpact - T.xStrikeStart).toBeGreaterThanOrEqual(0.1 - 1e-9);
    });

    it('slides forward a short way into every strike, once even for the two-claw X strike', () => {
        const { caster, engine } = setup([]);
        cast(caster, engine, UP);
        const active = caster.activeAbilities.find((a) => a.abilityId === CARD_ID)!;
        const intervals = normalizeAbilityTimingsToIntervals(BloodyClawsAbility_0306.abilityTimings);
        const impacts: Record<string, number> = {
            swipe_left: T.swipeLeftImpact,
            swipe_right: T.swipeRightImpact,
            x_strike: T.xStrikeImpact,
        };
        for (const [intervalId, impactTime] of Object.entries(impacts)) {
            advanceTo(caster, engine, impactTime);
            const interval = intervals.find((i) => i.id === intervalId)!;
            const progress = (impactTime - interval.start) / (interval.end - interval.start);
            // Sum every behaviour's render offset, the way UnitRenderer does (the step lunge draws none).
            let offsetY = 0;
            getEffectiveCastBehaviours(interval)!.forEach((entry, bIdx) => {
                const offset = entry.behaviour.getCasterRenderOffset?.({
                    caster,
                    abilityId: CARD_ID,
                    target: active.targetsByLabel![interval.targetDef!.kind === 'select' ? interval.targetDef!.label : '']!,
                    allTargets: active.targets,
                    castPayload: active.castPayload,
                    behaviourPayload: active.castBehaviourPayloads?.[`${interval.id}_${bIdx}`],
                    setBehaviourPayload: () => {},
                    engine,
                    gameTime: engine.gameTime,
                    windowProgress: progress,
                });
                offsetY += offset?.y ?? 0;
            });
            // Aiming up: a forward slide is negative y. One slide, not doubled for the X strike.
            expect(offsetY, intervalId).toBeCloseTo(-BLOODY_CLAWS_STRIKE_SLIDE.forwardDistance, 0);
        }
    });

    it('steps toward each strike\'s own aim before it lands (step lunges)', () => {
        const { caster, engine } = setup([]);
        // Swipe left far up, swipe right far right (clamped to the 30 degree turn), X strike far up.
        cast(caster, engine, { left: px(0, -300), right: px(300, 0), x: px(0, -300) });
        advanceTo(caster, engine, T.swipeLeftImpact);
        expect(caster.x).toBeCloseTo(0, 5);
        expect(caster.y).toBeCloseTo(-BLOODY_CLAWS_FIRST_STRIKE_LUNGE, 0);

        const beforeRight = { x: caster.x, y: caster.y };
        advanceTo(caster, engine, T.swipeRightImpact);
        const right = { x: caster.x - beforeRight.x, y: caster.y - beforeRight.y };
        expect(Math.hypot(right.x, right.y)).toBeCloseTo(BLOODY_CLAWS_FOLLOW_UP_LUNGE, 0);
        // Turned 30 degrees right of "up": the turn limit applies to where it steps, too.
        expect(Math.atan2(right.x, -right.y)).toBeCloseTo(Math.PI / 6, 1);

        const beforeX = { x: caster.x, y: caster.y };
        advanceTo(caster, engine, T.xStrikeImpact);
        // The X strike steps once (not once per claw).
        expect(Math.hypot(caster.x - beforeX.x, caster.y - beforeX.y)).toBeCloseTo(BLOODY_CLAWS_FOLLOW_UP_LUNGE, 0);
    });

    it('does not step when a strike\'s target is already within reach', () => {
        const { caster, engine } = setup([]);
        cast(caster, engine, { left: px(0, -40), right: px(0, -40), x: px(0, -40) });
        advanceTo(caster, engine, T.cooldownEnd);
        expect(caster.x).toBe(0);
        expect(caster.y).toBe(0);
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
