/**
 * ThrowRock - A basic ranged ability.
 *
 * Targets a pixel. After windup, creates a projectile that travels up to
 * 200px toward the target. Base 5 damage on hit; **More Power** research
 * increases damage. **More Rock** (crystal_rocks tree) adds a second target
 * and second throw on a longer timeline (same pattern as Throw Charged Rock).
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import type { ActiveAbility } from '../../game/types';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import { getDirectionFromTo, getPixelTargetPosition } from '../../abilities/targetHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { asCardDefId, type CardDef } from '../types';

const ABILITY_ID = 'throw_rock';
const RANGE = 200;
const BASE_DAMAGE = 5;
/** Matches More Power bump used on Throw Charged Rock explosion damage. */
const MORE_POWER_DAMAGE = 8;

/** One timeline cell for more-rock pattern (14 × slice = 1.4s total). */
const MORE_ROCK_TIME_SLICE = 0.1;
const MORE_ROCK_FIRST_THROW = 6 * MORE_ROCK_TIME_SLICE;
const MORE_ROCK_SECOND_THROW = 10 * MORE_ROCK_TIME_SLICE;
const MORE_ROCK_COOLDOWN_START = 11 * MORE_ROCK_TIME_SLICE;

const BASE_MOVEMENT_PENALTY_UNTIL = 0.6;

type ThrowRockCastPayload = {
    movementPenaltyUntil: number;
};

const THROW_ROCK_BASE_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: 0.3,
        abilityPhase: AbilityPhase.Windup,
        timelineLabel: 'Startup',
        timelineDescription: 'Winding up to throw the rock.',
    },
    {
        id: 'flight',
        start: 0.3,
        end: 1.0,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'Active',
        timelineDescription: 'Rock is in flight and can hit enemies.',
    },
    {
        id: 'recovery',
        start: 1.0,
        end: 1.6,
        abilityPhase: AbilityPhase.Cooldown,
        timelineLabel: 'Cooldown',
        timelineDescription: 'Recovering after the throw.',
    },
];

const THROW_ROCK_MORE_ROCK_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: MORE_ROCK_FIRST_THROW,
        abilityPhase: AbilityPhase.Windup,
        timelineLabel: 'Startup',
        timelineDescription: 'Winding up for the first throw.',
    },
    {
        id: 'flight1',
        start: MORE_ROCK_FIRST_THROW,
        end: MORE_ROCK_FIRST_THROW + MORE_ROCK_TIME_SLICE,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'First throw',
        timelineDescription: 'First rock is in flight.',
    },
    {
        id: 'windup2',
        start: MORE_ROCK_FIRST_THROW + MORE_ROCK_TIME_SLICE,
        end: MORE_ROCK_SECOND_THROW,
        abilityPhase: AbilityPhase.Windup,
        timelineLabel: 'Quick windup',
        timelineDescription: 'Brief pause before the second throw.',
    },
    {
        id: 'flight2',
        start: MORE_ROCK_SECOND_THROW,
        end: MORE_ROCK_SECOND_THROW + MORE_ROCK_TIME_SLICE,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'Second throw',
        timelineDescription: 'Second rock is in flight.',
    },
    {
        id: 'recovery',
        start: MORE_ROCK_COOLDOWN_START,
        end: 14 * MORE_ROCK_TIME_SLICE,
        abilityPhase: AbilityPhase.Cooldown,
        timelineLabel: 'Cooldown',
        timelineDescription: 'Recovering after both throws.',
    },
];

interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
    localPlayerId?: string;
}

function getResearchSet(engine: GameEngineLike, playerId: string): Set<string> {
    const researched = engine.getPlayerResearchNodes?.(playerId, 'crystal_rocks') ?? [];
    return new Set(researched);
}

function getOwnerResearch(engine: GameEngineLike | undefined, caster?: Unit): Set<string> {
    if (!engine) return new Set<string>();
    const ownerId = caster?.ownerId ?? engine.localPlayerId ?? '';
    return ownerId ? getResearchSet(engine, ownerId) : new Set<string>();
}

function rockDamageForResearch(research: Set<string>): number {
    return research.has('more_power') ? MORE_POWER_DAMAGE : BASE_DAMAGE;
}

function spawnProjectile(
    engine: GameEngineLike,
    caster: Unit,
    targetPos: { x: number; y: number },
    damage: number,
): void {
    const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, targetPos.x, targetPos.y);
    if (dist === 0) return;
    const travelDistance = Math.min(dist, RANGE);
    const speed = 900;

    engine.addProjectile(
        new Projectile({
            x: caster.x,
            y: caster.y,
            velocityX: dirX * speed,
            velocityY: dirY * speed,
            damage,
            sourceTeamId: caster.teamId,
            sourceUnitId: caster.id,
            sourceAbilityId: ABILITY_ID,
            maxDistance: travelDistance,
        }),
    );
}

const ONE_TARGETS: TargetDef[] = [{ type: 'pixel', label: 'Target location' }];
const TWO_TARGETS: TargetDef[] = [
    { type: 'pixel', label: 'Target location' },
    { type: 'pixel', label: 'Second target (More Rock)' },
];

const THROW_ROCK_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 4 L32 12 L36 24 L28 36 L12 34 L4 20 Z" fill="#6b6b6b" stroke="#5a5a5a" stroke-width="1"/>
  <path d="M12 14 L20 10 L28 16 L30 26 L22 32 L12 28 Z" fill="#7a7a7a"/>
  <path d="M16 20 L24 16 L26 24 L18 28 Z" fill="#525252"/>
</svg>`;

export const ThrowRock: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Throw Rock',
    image: THROW_ROCK_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.3,
    abilityTimings: THROW_ROCK_BASE_TIMINGS,
    getAbilityTimings(caster, gameState) {
        const eng = gameState as GameEngineLike | undefined;
        const research = getOwnerResearch(eng, caster);
        return research.has('more_rock') ? THROW_ROCK_MORE_ROCK_TIMINGS : THROW_ROCK_BASE_TIMINGS;
    },
    targets: TWO_TARGETS,
    getTargets(caster?: Unit, gameState?: unknown): TargetDef[] {
        const eng = gameState as GameEngineLike | undefined;
        if (!eng) return ONE_TARGETS;
        const research = getOwnerResearch(eng, caster);
        return research.has('more_rock') ? TWO_TARGETS : ONE_TARGETS;
    },
    aiSettings: { minRange: 0, maxRange: RANGE },

    getTooltipText(gameState?: unknown): string[] {
        const eng = gameState as GameEngineLike | undefined;
        const research = eng ? getOwnerResearch(eng) : new Set<string>();
        const hasMoreRock = research.has('more_rock');
        const dmg = rockDamageForResearch(research);
        if (hasMoreRock) {
            return [`Throws {2} rocks dealing {${dmg}} damage each to the first enemy hit`];
        }
        return [`Throws a rock dealing {${dmg}} damage to the first enemy hit`];
    },

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as GameEngineLike;
        const research = getResearchSet(eng, caster.ownerId);
        const hasMoreRock = research.has('more_rock');
        const payload: ThrowRockCastPayload = {
            movementPenaltyUntil: hasMoreRock ? MORE_ROCK_SECOND_THROW : BASE_MOVEMENT_PENALTY_UNTIL,
        };
        active.castPayload = payload;
    },

    getAbilityStatesForActive(currentTime: number, active: ActiveAbility): AbilityStateEntry[] {
        const payload = active.castPayload as ThrowRockCastPayload | undefined;
        const until = payload?.movementPenaltyUntil ?? BASE_MOVEMENT_PENALTY_UNTIL;
        if (currentTime < until) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0.3 } }];
        }
        return [];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < BASE_MOVEMENT_PENALTY_UNTIL) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0.3 } }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const eng = engine as GameEngineLike;
        const research = getResearchSet(eng, caster.ownerId);
        const damage = rockDamageForResearch(research);
        const hasMoreRock = research.has('more_rock');

        if (hasMoreRock) {
            if (prevTime < MORE_ROCK_FIRST_THROW && currentTime >= MORE_ROCK_FIRST_THROW) {
                const firstTarget = getPixelTargetPosition(targets, 0);
                if (firstTarget) spawnProjectile(eng, caster, firstTarget, damage);
            }
            if (prevTime < MORE_ROCK_SECOND_THROW && currentTime >= MORE_ROCK_SECOND_THROW) {
                const secondTarget = getPixelTargetPosition(targets, 1);
                if (secondTarget) spawnProjectile(eng, caster, secondTarget, damage);
            }
            return;
        }

        if (prevTime >= 0.3 || currentTime < 0.3) return;
        const firstTarget = getPixelTargetPosition(targets, 0);
        if (!firstTarget) return;
        spawnProjectile(eng, caster, firstTarget, damage);
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        if (attackInfo.type === 'projectile' && attackInfo.projectile) {
            (attackInfo.projectile as Projectile).active = false;
        }
    },

    renderTargetingPreview(gr, caster, currentTargets, mouseWorld, _units, gameState): void {
        gr.clear();
        const eng = gameState as GameEngineLike | undefined;
        const research = eng ? getOwnerResearch(eng, caster) : new Set<string>();
        if (!research.has('more_rock')) {
            drawClampedLine(gr, caster, mouseWorld, RANGE);
            return;
        }

        drawClampedLine(gr, caster, mouseWorld, RANGE, { color: 0xc0c0c0, width: 2, alpha: 0.7 });
        const clamped = clampToMaxRange(caster, mouseWorld, RANGE);
        drawCrosshair(gr, clamped.endX, clamped.endY, 10, { color: 0xc0c0c0, width: 2, alpha: 0.95 });

        if (currentTargets.length >= 1) {
            const first = currentTargets[0];
            if (first?.type === 'pixel' && first.position) {
                const c = clampToMaxRange(caster, first.position, RANGE);
                gr.moveTo(caster.x, caster.y);
                gr.lineTo(c.endX, c.endY);
                gr.stroke({ color: 0xc0c0c0, width: 2, alpha: 0.35 });
            }
        }
    },

    renderTargetingPreviewSelectedTargets(gr, caster, currentTargets, _mouseWorld, _units, gameState): void {
        const eng = gameState as GameEngineLike | undefined;
        const research = eng ? getOwnerResearch(eng, caster) : new Set<string>();
        if (!research.has('more_rock')) return;

        for (const t of currentTargets) {
            if (t.type === 'pixel' && t.position) {
                const clamped = clampToMaxRange(caster, t.position, RANGE);
                drawCrosshair(gr, clamped.endX, clamped.endY, 10, { color: 0xc0c0c0, width: 2, alpha: 0.95 });
            }
        }
    },
};

export const ThrowRockCard: CardDef = {
    id: asCardDefId('throw_rock'),
    name: 'Throw Rock',
    abilityId: 'throw_rock',
    durability: 3,
    discardDuration: { duration: 1, unit: 'rounds' },
};
