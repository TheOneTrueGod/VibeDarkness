/**
 * LightEater - Displacer Spirit boss ability. The spirit vanishes, reappears on the nearest light
 * source and devours part of it (extinguishing it if it is already dim), gaining a super bar.
 * Arrival is telegraphed with a red circle; a moment later it detonates in a dark explosion that
 * hurts anyone caught in it. The AI casts it once per round, only in the round's last quarter.
 */

import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import type { TargetDef } from '../../../abilities/targeting';
import { damageEnemiesInCircle } from '../../../abilities/targetHelpers';
import { Effect } from '../../../game/effects/Effect';
import type { EventBus } from '../../../game/EventBus';
import type { SpecialTile } from '../../../game/specialTiles/SpecialTile';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { LIGHT_EATER_ROUND_WINDOW } from '../../../game/displacer/displacerConstants';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}18`;
export const LIGHT_EATER_ID = CARD_ID;

/** Light strength removed from the devoured source; a source at or below this is extinguished. */
export const LIGHT_EATER_LIGHT_REDUCTION = 3;
/** Super bars granted on arrival. */
export const LIGHT_EATER_SUPER_GAIN = 1;
/** Dark explosion damage (design range 5-10). */
export const LIGHT_EATER_EXPLOSION_DAMAGE = 8;
export const LIGHT_EATER_EXPLOSION_RADIUS = 100;

/** Seconds spent vanishing before the teleport. */
export const LIGHT_EATER_TELEPORT_TIME = 0.6;
/** Seconds the arrival telegraph is visible before the explosion. */
export const LIGHT_EATER_TELEGRAPH_SEC = 1.2;
export const LIGHT_EATER_EXPLODE_TIME = LIGHT_EATER_TELEPORT_TIME + LIGHT_EATER_TELEGRAPH_SEC;
const STRIKE_END = LIGHT_EATER_EXPLODE_TIME + 1 / 60;
const COOLDOWN_END = STRIKE_END + 0.6;

const DARK_PURPLE = 0x9933cc;
const TELEGRAPH_RED = 0xef4444;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const LIGHT_EATER_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="24" fill="#1b1030" stroke="#9933cc" stroke-width="3"/>
  <circle cx="32" cy="32" r="9" fill="#ffd966"/>
  <path d="M32 6 L32 16 M32 48 L32 58 M6 32 L16 32 M48 32 L58 32" stroke="#9933cc" stroke-width="3"/>
</svg>`;

interface LightEaterEngine {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    specialTiles: SpecialTile[];
    damageSpecialTile(tileId: string, amount: number): boolean;
    addEffect(effect: Effect): void;
}

/** True for tiles the spirit can devour: still burning, emitting visible (non-dark) light. */
function isDevourableLight(tile: SpecialTile): boolean {
    return (
        tile.hp > 0 &&
        tile.emitsLight != null &&
        tile.emitsLight.lightAmount > 0 &&
        tile.emitsLight.lightType !== 'DarkLight'
    );
}

export function lightTileCenter(tile: Pick<SpecialTile, 'col' | 'row'>): { x: number; y: number } {
    return { x: tile.col * CELL_SIZE + CELL_SIZE / 2, y: tile.row * CELL_SIZE + CELL_SIZE / 2 };
}

/** Nearest devourable light-emitting special tile to a point, or null when none remain. */
export function findNearestLightTile(
    tiles: readonly SpecialTile[],
    from: { x: number; y: number },
): SpecialTile | null {
    let best: SpecialTile | null = null;
    let bestDistSq = Infinity;
    for (const tile of tiles) {
        if (!isDevourableLight(tile)) continue;
        const c = lightTileCenter(tile);
        const d = (c.x - from.x) ** 2 + (c.y - from.y) ** 2;
        if (d < bestDistSq) {
            best = tile;
            bestDistSq = d;
        }
    }
    return best;
}

/** AI gate: the ability is pointless with no light left to eat. */
export function anyDevourableLight(tiles: readonly SpecialTile[]): boolean {
    return tiles.some(isDevourableLight);
}

/**
 * Eat `LIGHT_EATER_LIGHT_REDUCTION` strength from a light tile. A source whose strength is already
 * at or below the reduction is eliminated outright. Returns what happened.
 */
export function devourLight(
    engine: Pick<LightEaterEngine, 'damageSpecialTile'>,
    tile: SpecialTile,
): 'reduced' | 'eliminated' {
    const light = tile.emitsLight;
    if (!light || light.lightAmount <= LIGHT_EATER_LIGHT_REDUCTION) {
        engine.damageSpecialTile(tile.id, tile.hp);
        return 'eliminated';
    }
    light.lightAmount -= LIGHT_EATER_LIGHT_REDUCTION;
    return 'reduced';
}

const _base: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: 'Light Eater',
    image: LIGHT_EATER_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: LIGHT_EATER_EXPLODE_TIME,
    abilityTimings: [
        { id: 'vanish', start: 0, end: LIGHT_EATER_TELEPORT_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'telegraph', start: LIGHT_EATER_TELEPORT_TIME, end: LIGHT_EATER_EXPLODE_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'explode', start: LIGHT_EATER_EXPLODE_TIME, end: STRIKE_END, abilityPhase: AbilityPhase.Active, doNotRefund: true },
        { id: 'cooldown', start: STRIKE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: 0,
        maxUsesPerRound: 1,
        priority: 30,
        ninjutsu: { ignore: true },
        roundWindow: LIGHT_EATER_ROUND_WINDOW,
        canUse: (_caster, ctx) => anyDevourableLight(ctx.getSpecialTiles()),
    },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: 0 }),

    getTooltipText(): string[] {
        return [
            `Teleport to the nearest light and devour ${LIGHT_EATER_LIGHT_REDUCTION} of its strength (extinguishing weak lights)`,
            `Gain ${LIGHT_EATER_SUPER_GAIN} super bar, then detonate for ${LIGHT_EATER_EXPLOSION_DAMAGE} damage`,
            'Used once per round, late in the round',
        ];
    },
});

export const LightEaterAbility: AbilityStatic = {
    ..._base,

    doCardEffect(
        engine: unknown,
        caster: Unit,
        _targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
    ): void {
        const eng = engine as LightEaterEngine;

        if (prevTime < LIGHT_EATER_TELEPORT_TIME && currentTime >= LIGHT_EATER_TELEPORT_TIME) {
            const tile = findNearestLightTile(eng.specialTiles, caster);
            if (tile) {
                const dest = lightTileCenter(tile);
                const pulse = { colors: [DARK_PURPLE, 0x330055, 0x110022] };
                eng.addEffect(new Effect({ x: caster.x, y: caster.y, duration: 0.5, effectType: 'Pulse', effectData: pulse }));
                caster.x = dest.x;
                caster.y = dest.y;
                caster.clearMovement();
                devourLight(eng, tile);
                caster.getResource('super')?.add(LIGHT_EATER_SUPER_GAIN);
                eng.addEffect(new Effect({ x: dest.x, y: dest.y, duration: 0.5, effectType: 'Pulse', effectData: pulse }));
            }
        }

        if (prevTime < LIGHT_EATER_EXPLODE_TIME && currentTime >= LIGHT_EATER_EXPLODE_TIME) {
            const center = { x: caster.x, y: caster.y };
            damageEnemiesInCircle({
                engine: eng as never,
                caster,
                center,
                radius: LIGHT_EATER_EXPLOSION_RADIUS,
                damage: LIGHT_EATER_EXPLOSION_DAMAGE,
                abilityId: CARD_ID,
                attackType: 'melee',
            });
            eng.addEffect(new Effect({
                x: center.x,
                y: center.y,
                duration: 0.4,
                effectType: 'Explosion',
                effectRadius: LIGHT_EATER_EXPLOSION_RADIUS,
                effectProperties: { color: DARK_PURPLE, direction: 'expand' },
            }));
        }
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        // Nothing to show while the spirit is still vanishing (its arrival point is not yet fixed).
        if (elapsed < LIGHT_EATER_TELEPORT_TIME || elapsed >= LIGHT_EATER_EXPLODE_TIME) return;
        const t = (elapsed - LIGHT_EATER_TELEPORT_TIME) / LIGHT_EATER_TELEGRAPH_SEC;
        gr.circle(caster.x, caster.y, LIGHT_EATER_EXPLOSION_RADIUS);
        gr.stroke({ color: TELEGRAPH_RED, width: 2, alpha: 0.25 + 0.55 * t });
        gr.circle(caster.x, caster.y, Math.max(2, t * LIGHT_EATER_EXPLOSION_RADIUS));
        gr.stroke({ color: DARK_PURPLE, width: 3, alpha: 0.45 + 0.45 * t });
    },
};

export const LightEaterCard: CardDef = {
    abilityId: CARD_ID,
};
