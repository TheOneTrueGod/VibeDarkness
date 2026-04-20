/**
 * ThrowKnife - Research-upgraded Throw Rock variant.
 *
 * Base version throws one knife for more damage than Throw Rock.
 * If both Throwing Knives and More Rock are researched, throws a second knife.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import { getDirectionFromTo, getPixelTargetPosition } from '../../abilities/targetHelpers';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { asCardDefId, type CardDef } from '../types';

interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
    localPlayerId?: string;
}

const ABILITY_ID = 'throw_knife';
const RANGE = 200;
const BASE_DAMAGE = 7;

const MORE_ROCK_TIME_SLICE = 0.1;
const MORE_ROCK_FIRST_THROW = 6 * MORE_ROCK_TIME_SLICE;
const MORE_ROCK_SECOND_THROW = 10 * MORE_ROCK_TIME_SLICE;
const MORE_ROCK_COOLDOWN_START = 11 * MORE_ROCK_TIME_SLICE;
const BASE_MOVEMENT_PENALTY_UNTIL = 0.6;

type ThrowKnifeCastPayload = {
    movementPenaltyUntil: number;
};

const THROW_KNIFE_BASE_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: 0.3,
        abilityPhase: AbilityPhase.Windup,
        timelineLabel: 'Startup',
        timelineDescription: 'Preparing to throw the knife.',
    },
    {
        id: 'flight',
        start: 0.3,
        end: 1.0,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'Active',
        timelineDescription: 'Knife is in flight.',
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

const THROW_KNIFE_MORE_ROCK_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: MORE_ROCK_FIRST_THROW,
        abilityPhase: AbilityPhase.Windup,
        timelineLabel: 'Startup',
        timelineDescription: 'Preparing the first knife throw.',
    },
    {
        id: 'flight1',
        start: MORE_ROCK_FIRST_THROW,
        end: MORE_ROCK_FIRST_THROW + MORE_ROCK_TIME_SLICE,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'First throw',
        timelineDescription: 'First knife is in flight.',
    },
    {
        id: 'windup2',
        start: MORE_ROCK_FIRST_THROW + MORE_ROCK_TIME_SLICE,
        end: MORE_ROCK_SECOND_THROW,
        abilityPhase: AbilityPhase.Windup,
        timelineLabel: 'Quick windup',
        timelineDescription: 'Quick follow-up before second knife.',
    },
    {
        id: 'flight2',
        start: MORE_ROCK_SECOND_THROW,
        end: MORE_ROCK_SECOND_THROW + MORE_ROCK_TIME_SLICE,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'Second throw',
        timelineDescription: 'Second knife is in flight.',
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

const ONE_TARGETS: TargetDef[] = [{ type: 'pixel', label: 'Target location' }];
const TWO_TARGETS: TargetDef[] = [
    { type: 'pixel', label: 'Target location' },
    { type: 'pixel', label: 'Second target (More Rock)' },
];

function getResearchSet(engine: GameEngineLike, playerId: string): Set<string> {
    const researched = engine.getPlayerResearchNodes?.(playerId, 'crystal_rocks') ?? [];
    return new Set(researched);
}

function getOwnerResearch(engine: GameEngineLike | undefined, caster?: Unit): Set<string> {
    if (!engine) return new Set<string>();
    const ownerId = caster?.ownerId ?? engine.localPlayerId ?? '';
    return ownerId ? getResearchSet(engine, ownerId) : new Set<string>();
}

function hasKnifeMultiThrow(research: Set<string>): boolean {
    return research.has('throwing_knives') && research.has('more_rock');
}

function spawnProjectile(engine: GameEngineLike, caster: Unit, targetPos: { x: number; y: number }): void {
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
            damage: BASE_DAMAGE,
            sourceTeamId: caster.teamId,
            sourceUnitId: caster.id,
            sourceAbilityId: ABILITY_ID,
            maxDistance: travelDistance,
            projectileType: 'throwing_knife',
        }),
    );
}

const THROW_KNIFE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="28" y="34" width="8" height="20" rx="2" fill="#7a4a24"/>
  <polygon points="32,6 25,34 39,34" fill="#d8dde3"/>
  <line x1="28" y1="31" x2="36" y2="31" stroke="#c5905c" stroke-width="2"/>
  <line x1="29" y1="14" x2="32" y2="33" stroke="#f5f7f9" stroke-width="1"/>
</svg>`;

export const ThrowKnife: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Throw Knife',
    image: THROW_KNIFE_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.3,
    abilityTimings: THROW_KNIFE_BASE_TIMINGS,
    getAbilityTimings(caster, gameState) {
        const eng = gameState as GameEngineLike | undefined;
        const research = getOwnerResearch(eng, caster);
        return hasKnifeMultiThrow(research) ? THROW_KNIFE_MORE_ROCK_TIMINGS : THROW_KNIFE_BASE_TIMINGS;
    },
    targets: TWO_TARGETS,
    getTargets(caster?: Unit, gameState?: unknown): TargetDef[] {
        const eng = gameState as GameEngineLike | undefined;
        if (!eng) return ONE_TARGETS;
        const research = getOwnerResearch(eng, caster);
        return hasKnifeMultiThrow(research) ? TWO_TARGETS : ONE_TARGETS;
    },
    aiSettings: { minRange: 0, maxRange: RANGE },

    getTooltipText(gameState?: unknown): string[] {
        const eng = gameState as GameEngineLike | undefined;
        const research = eng ? getOwnerResearch(eng) : new Set<string>();
        if (hasKnifeMultiThrow(research)) {
            return [`Throws {2} knives dealing {${BASE_DAMAGE}} damage each to the first enemy hit`];
        }
        return [`Throws a knife dealing {${BASE_DAMAGE}} damage to the first enemy hit`];
    },

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as GameEngineLike;
        const research = getResearchSet(eng, caster.ownerId);
        const payload: ThrowKnifeCastPayload = {
            movementPenaltyUntil: hasKnifeMultiThrow(research) ? MORE_ROCK_SECOND_THROW : BASE_MOVEMENT_PENALTY_UNTIL,
        };
        active.castPayload = payload;
    },

    getAbilityStatesForActive(currentTime: number, active: ActiveAbility): AbilityStateEntry[] {
        const payload = active.castPayload as ThrowKnifeCastPayload | undefined;
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

        if (hasKnifeMultiThrow(research)) {
            if (prevTime < MORE_ROCK_FIRST_THROW && currentTime >= MORE_ROCK_FIRST_THROW) {
                const firstTarget = getPixelTargetPosition(targets, 0);
                if (firstTarget) spawnProjectile(eng, caster, firstTarget);
            }
            if (prevTime < MORE_ROCK_SECOND_THROW && currentTime >= MORE_ROCK_SECOND_THROW) {
                const secondTarget = getPixelTargetPosition(targets, 1);
                if (secondTarget) spawnProjectile(eng, caster, secondTarget);
            }
            return;
        }

        if (prevTime >= 0.3 || currentTime < 0.3) return;
        const firstTarget = getPixelTargetPosition(targets, 0);
        if (!firstTarget) return;
        spawnProjectile(eng, caster, firstTarget);
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
        if (!hasKnifeMultiThrow(research)) {
            drawClampedLine(gr, caster, mouseWorld, RANGE);
            return;
        }

        drawClampedLine(gr, caster, mouseWorld, RANGE, { color: 0xd8dde3, width: 2, alpha: 0.75 });
        const clamped = clampToMaxRange(caster, mouseWorld, RANGE);
        drawCrosshair(gr, clamped.endX, clamped.endY, 10, { color: 0xd8dde3, width: 2, alpha: 0.95 });

        if (currentTargets.length >= 1) {
            const first = currentTargets[0];
            if (first?.type === 'pixel' && first.position) {
                const c = clampToMaxRange(caster, first.position, RANGE);
                gr.moveTo(caster.x, caster.y);
                gr.lineTo(c.endX, c.endY);
                gr.stroke({ color: 0xd8dde3, width: 2, alpha: 0.35 });
            }
        }
    },

    renderTargetingPreviewSelectedTargets(gr, caster, currentTargets, _mouseWorld, _units, gameState): void {
        const eng = gameState as GameEngineLike | undefined;
        const research = eng ? getOwnerResearch(eng, caster) : new Set<string>();
        if (!hasKnifeMultiThrow(research)) return;

        for (const t of currentTargets) {
            if (t.type === 'pixel' && t.position) {
                const clamped = clampToMaxRange(caster, t.position, RANGE);
                drawCrosshair(gr, clamped.endX, clamped.endY, 10, { color: 0xd8dde3, width: 2, alpha: 0.95 });
            }
        }
    },
};

export const ThrowKnifeCard: CardDef = {
    id: asCardDefId('throw_knife'),
    name: 'Throw Knife',
    abilityId: 'throw_knife',
    durability: 5,
    discardDuration: { duration: 1, unit: 'rounds' },
};
