import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { AttackBlockedInfo } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { nullHitbox } from '../../../hitboxes';
import { areEnemies } from '../../../game/teams';
import type { Unit } from '../../../game/units/Unit';
import { Effect } from '../../../game/effects/Effect';
import type { Projectile } from '../../../game/projectiles/Projectile';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { type CardDef } from '../../types';
import { tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';

const ABILITY_ID = '0530';
const RANGE = 220;
const DAMAGE = 5;
const IMPACT_RADIUS = 55;
const KNOCKBACK_TIER = 1;
const TOOLTIP_LINES = [
    'Throw a rock that creates stone, dealing {{DAMAGE}} damage and knocking back nearby enemies.',
] as const;
const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: DAMAGE },
};

const STONE_TOMB_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="8" width="28" height="24" rx="4" fill="#6b6b6b"/>
  <path d="M10 14 L30 14 M10 20 L30 20 M10 26 L30 26" stroke="#bdbdbd" stroke-width="2"/>
</svg>`;

export const StoneTomb = defineAbility({
    id: ABILITY_ID,
    name: 'Stone Tomb',
    image: STONE_TOMB_IMAGE,
    tags: ['Entombed'],
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: 1,
    prefireTime: 0.3,
    abilityTimings: [
        { id: 'windup',   start: 0,   end: 0.3, abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: 0.3,
            end: 0.4,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: { kind: 'select', label: 'Impact location', hitbox: nullHitbox, filter: 'any', allowMiss: true },
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(900)
                .withMaxRange(RANGE)
                .withProjectileType('charged_rock')
                .withBaseDamage(DAMAGE),
        },
        { id: 'cooldown', start: 0.4, end: 1.5, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],
    aiSettings: { minRange: 0, maxRange: RANGE },
    getRange: () => ({ minRange: 0, maxRange: RANGE }),
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: ABILITY_ID } }),
        );
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },
    onProjectileExpired(engine: unknown, caster: Unit, projectile: Projectile): void {
        const eng = engine as AbilityEngineContext;
        const source = eng.getUnit(caster.id);
        if (!source) return;

        const worldGrid = eng.terrainManager?.grid.worldToGrid(projectile.x, projectile.y);
        if (worldGrid) {
            eng.terrainManager?.createOrMarkRock(worldGrid.col, worldGrid.row);
        }

        eng.addEffect(new Effect({
            x: projectile.x,
            y: projectile.y,
            duration: 0.2,
            effectType: 'Explosion',
            effectRadius: IMPACT_RADIUS,
            effectProperties: { color: 0x27d3c8, direction: 'contract' },
        }));

        for (const unit of eng.units) {
            if (!unit.isAlive() || !areEnemies(source.teamId, unit.teamId)) continue;
            const dist = Math.hypot(unit.x - projectile.x, unit.y - projectile.y);
            if (dist > IMPACT_RADIUS + unit.radius) continue;
            // Flat explosion damage; return value unused, so no need for the shield/armour breakdown.
            unit.takeDamage(DAMAGE, source.id, eng.eventBus);
            tryApplyKnockbackByTier(
                unit, KNOCKBACK_TIER,
                { unitId: source.id, abilityId: ABILITY_ID },
                projectile.x, projectile.y,
                { gameTime: eng.gameTime, roundNumber: eng.roundNumber ?? 1, eventBus: eng.eventBus },
            );
        }
    },
});

export const StoneTombCard: CardDef = {
    abilityId: ABILITY_ID,
};
