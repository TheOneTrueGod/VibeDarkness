import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { clampToMaxRange, drawClampedLine, drawCrosshair } from '../../abilities/previewHelpers';
import { getDirectionFromTo, getPixelTargetPosition } from '../../abilities/targetHelpers';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { Projectile } from '../../objects/Projectile';
import { Effect } from '../../objects/Effect';
import { areEnemies } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';
import { asCardDefId, type CardDef } from '../types';

const THROW_CHARGED_ROCK_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 4 L32 12 L36 24 L28 36 L12 34 L4 20 Z" fill="#6b6b6b" stroke="#5a5a5a" stroke-width="1"/>
  <path d="M12 14 L20 10 L28 16 L30 26 L22 32 L12 28 Z" fill="#7a7a7a"/>
  <path d="M16 20 L24 16 L26 24 L18 28 Z" fill="#525252"/>
  <path d="M9 11 L14 9 L12 15 L17 13 L15 19" fill="none" stroke="#8ef9ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 8 L27 6 L24 12 L30 10 L26 18" fill="none" stroke="#8ef9ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 27 L15 25 L13 31 L18 29 L15 35" fill="none" stroke="#8ef9ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const CARD_ID = 'throw_charged_rock';
const RANGE = 200;
const BASE_EXPLOSION_RADIUS = 50;
const BASE_EXPLOSION_DAMAGE = 5;
const BASE_MAX_TARGETS = 3;
const DIRECT_HIT_DAMAGE = 5;

const MORE_ROCK_EXPLOSION_RADIUS_MULT = 0.75;
const MORE_ROCK_EXPLOSION_DAMAGE = 3;

const MORE_POWER_EXPLOSION_DAMAGE = 8;
const MORE_POWER_MAX_TARGETS = 4;

const KNOCKBACK_MAGNITUDE = 24;
const KNOCKBACK_POISE_DAMAGE = 3;
const KNOCKBACK_AIR_TIME = 0.1;
const KNOCKBACK_SLIDE_TIME = 0.08;
const PREVIEW_TEAL = 0x2dd4bf;

interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
    addEffect(effect: Effect): void;
    getUnit(id: string): Unit | undefined;
    getUnits(): Unit[];
    eventBus: EventBus;
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
    localPlayerId?: string;
}

function getResearchSet(engine: GameEngineLike, playerId: string): Set<string> {
    const researched = engine.getPlayerResearchNodes?.(playerId, 'crystal_rocks') ?? [];
    return new Set(researched);
}

const ONE_TARGETS: TargetDef[] = [{ type: 'pixel', label: 'Target location' }];
const TWO_TARGETS: TargetDef[] = [
    { type: 'pixel', label: 'Target location' },
    { type: 'pixel', label: 'Second target (More Rock)' },
];

function getExplosionRadiusForResearch(research: Set<string>): number {
    return research.has('more_rock') ? BASE_EXPLOSION_RADIUS * MORE_ROCK_EXPLOSION_RADIUS_MULT : BASE_EXPLOSION_RADIUS;
}

function getOwnerResearch(engine: GameEngineLike, caster?: Unit): Set<string> {
    const ownerId = caster?.ownerId ?? engine.localPlayerId ?? '';
    return ownerId ? getResearchSet(engine, ownerId) : new Set<string>();
}

function spawnProjectile(engine: GameEngineLike, caster: Unit, targetPos: { x: number; y: number }): void {
    const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, targetPos.x, targetPos.y);
    if (dist === 0) return;
    const travelDistance = Math.min(dist, RANGE);

    const speed = 900;
    const projectile = new Projectile({
        x: caster.x,
        y: caster.y,
        velocityX: dirX * speed,
        velocityY: dirY * speed,
        damage: DIRECT_HIT_DAMAGE,
        sourceTeamId: caster.teamId,
        sourceUnitId: caster.id,
        sourceAbilityId: CARD_ID,
        maxDistance: travelDistance,
        projectileType: 'charged_rock',
    });
    engine.addProjectile(projectile);
}

export const ThrowChargedRock: AbilityStatic = {
    id: CARD_ID,
    name: 'Throw Charged Rock',
    image: THROW_CHARGED_ROCK_IMAGE,
    cooldownTime: 1.3,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.3,
    abilityTimings: [
        { duration: 0.3, abilityPhase: AbilityPhase.Windup },
        { duration: 1.3, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: TWO_TARGETS,
    keywords: {
        exhaust: {
            newCards: [
                {
                    cardDefId: asCardDefId('throw_rock'),
                    abilityId: 'throw_rock',
                    location: 'discard',
                    rounds: 2,
                },
            ],
        },
    },
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
        const hasMorePower = research.has('more_power');
        const targets = hasMoreRock ? 2 : 1;
        let explosionDamage = hasMoreRock ? MORE_ROCK_EXPLOSION_DAMAGE : BASE_EXPLOSION_DAMAGE;
        let maxTargets = BASE_MAX_TARGETS;
        
        let firstLine = '';
        if (hasMorePower) {
            explosionDamage = MORE_POWER_EXPLOSION_DAMAGE;
            maxTargets = MORE_POWER_MAX_TARGETS;
            firstLine = `Throw a rock dealing {${DIRECT_HIT_DAMAGE}} damage.`;
        } else if (hasMoreRock) {
            firstLine = `Throws {${targets}} rocks dealing {${DIRECT_HIT_DAMAGE}} damage.`;
        } else {
            firstLine = `Throw a rock dealing {${DIRECT_HIT_DAMAGE}} damage.`;
        }
        return [
            firstLine,
            `Explodes, dealing {${explosionDamage}} to up to {${maxTargets}} enemies.`,
            'Exhaust into {Throw Rock}',
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        const states: AbilityStateEntry[] = [];
        if (currentTime < 0.6) {
            states.push({ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0.3 } });
        }
        return states;
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= 0.3 || currentTime < 0.3) return;
        const eng = engine as GameEngineLike;
        const research = getResearchSet(eng, caster.ownerId);
        const hasMoreRock = research.has('more_rock');

        const firstTarget = getPixelTargetPosition(targets, 0);
        if (!firstTarget) return;
        spawnProjectile(eng, caster, firstTarget);

        if (hasMoreRock) {
            const secondTarget = getPixelTargetPosition(targets, 1);
            if (secondTarget) {
                spawnProjectile(eng, caster, secondTarget);
            }
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        if (attackInfo.type === 'projectile' && attackInfo.projectile) {
            (attackInfo.projectile as Projectile).active = false;
        }
    },

    onProjectileExpired(engine: unknown, caster: Unit, projectile: Projectile, hitUnitId?: string): void {
        const eng = engine as GameEngineLike;
        const sourceUnit = eng.getUnit(caster.id);
        if (!sourceUnit) return;

        const research = getResearchSet(eng, sourceUnit.ownerId);
        const hasMoreRock = research.has('more_rock');
        const hasMorePower = research.has('more_power');

        const explosionRadius = hasMoreRock ? BASE_EXPLOSION_RADIUS * MORE_ROCK_EXPLOSION_RADIUS_MULT : BASE_EXPLOSION_RADIUS;
        let explosionDamage = hasMoreRock ? MORE_ROCK_EXPLOSION_DAMAGE : BASE_EXPLOSION_DAMAGE;
        let maxTargets = BASE_MAX_TARGETS;
        if (hasMorePower) {
            explosionDamage = MORE_POWER_EXPLOSION_DAMAGE;
            maxTargets = MORE_POWER_MAX_TARGETS;
        }

        eng.addEffect(
            new Effect({
                x: projectile.x,
                y: projectile.y,
                duration: 0.25,
                effectType: 'ChargedRockExplosion',
                effectRadius: explosionRadius,
            }),
        );

        // Leave behind a light source: 10 light, radius 5, decay 2 per 0.25 rounds
        eng.addEffect(
            new Effect({
                x: projectile.x,
                y: projectile.y,
                duration: 999,
                effectType: 'Torch',
                effectData: {
                    lightAmount: 10,
                    radius: 4,
                    decayRate: 1,
                    decayInterval: 0.25,
                    showVisual: false,
                },
            }),
        );

        const units = eng
            .getUnits()
            .filter((u) => u.isAlive() && areEnemies(sourceUnit.teamId, u.teamId))
            .map((u) => ({ unit: u, dist: Math.hypot(u.x - projectile.x, u.y - projectile.y) }))
            .filter((entry) => entry.dist <= explosionRadius + entry.unit.radius)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, maxTargets)
            .map((entry) => entry.unit);

        for (const unit of units) {
            console.log("Damaging unit", unit.id, " for ", explosionDamage);
            unit.takeDamage(explosionDamage, sourceUnit.id, eng.eventBus);
            const { dirX, dirY } = getDirectionFromTo(projectile.x, projectile.y, unit.x, unit.y);
            unit.applyKnockback(
                KNOCKBACK_POISE_DAMAGE,
                {
                    knockbackVector: { x: dirX * KNOCKBACK_MAGNITUDE, y: dirY * KNOCKBACK_MAGNITUDE },
                    knockbackAirTime: KNOCKBACK_AIR_TIME,
                    knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
                    knockbackSource: { unitId: sourceUnit.id, abilityId: CARD_ID },
                },
                eng.eventBus,
            );
        }
    },

    renderTargetingPreview(gr, caster, currentTargets, mouseWorld, _units, gameState): void {
        gr.clear();
        const target = mouseWorld;
        if (!target) return;
        const eng = gameState as GameEngineLike | undefined;
        const research = eng ? getOwnerResearch(eng, caster) : new Set<string>();
        const explosionRadius = getExplosionRadiusForResearch(research);
        const clamped = clampToMaxRange(caster, target, RANGE);
        const impactX = clamped.endX;
        const impactY = clamped.endY;

        drawClampedLine(gr, caster, target, RANGE, { color: 0x8ef9ff, width: 2, alpha: 0.7 });
        gr.circle(impactX, impactY, explosionRadius);
        gr.fill({ color: PREVIEW_TEAL, alpha: 0.15 });
        gr.circle(impactX, impactY, explosionRadius);
        gr.stroke({ color: PREVIEW_TEAL, width: 2, alpha: 0.5 });
    },

    renderTargetingPreviewSelectedTargets(gr, caster, currentTargets, _mouseWorld, _units, gameState): void {
        const eng = gameState as GameEngineLike | undefined;
        const research = eng ? getOwnerResearch(eng, caster) : new Set<string>();
        const explosionRadius = getExplosionRadiusForResearch(research);

        for (const t of currentTargets) {
            if (t.type === 'pixel' && t.position) {
                const clamped = clampToMaxRange(caster, t.position, RANGE);
                drawCrosshair(gr, clamped.endX, clamped.endY, 10, { color: 0x8ef9ff, width: 2, alpha: 0.95 });
                gr.circle(clamped.endX, clamped.endY, explosionRadius);
                gr.fill({ color: PREVIEW_TEAL, alpha: 0.1 });
                gr.circle(clamped.endX, clamped.endY, explosionRadius);
                gr.stroke({ color: PREVIEW_TEAL, width: 2, alpha: 0.45 });
            }
        }
    },
};

export const ThrowChargedRockCard: CardDef = {
    id: asCardDefId('throw_charged_rock'),
    name: 'Throw Charged Rock',
    abilityId: 'throw_charged_rock',
    durability: 3,
    discardDuration: { duration: 1, unit: 'rounds' },
};
