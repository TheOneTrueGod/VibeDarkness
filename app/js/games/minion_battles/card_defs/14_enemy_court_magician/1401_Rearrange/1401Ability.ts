/**
 * Rearrange - Court Magician. He sweeps a hand and every crystal glides into a new shape around the
 * fight: a line pointing at a player, a line across his facing, a cage around them, a guard ring around
 * himself, or a wide ring around them. The shape is picked at cast start and laid out from where he and
 * his target stand, so the next Shard Nova or Crystal Volley comes from somewhere new every time. Each
 * crystal that lands shocks a small area (40px + its radius) for 3 damage; the glide previews those areas.
 */

import type { AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { TargetDef } from '../../../abilities/targeting';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { getBoundUnits } from '../../../game/units/boundUnits';
import {
    FORMATION_PRESETS,
    formationSlots,
    type FormationPoint,
    type FormationPresetId,
} from '../../../game/formations/formationDef';
import { fitSlotsToTerrain } from '../../../game/formations/formationPlacement';
import { getCastElapsedAt } from '../../../game/time/actorClock';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { CardDef } from '../../types';
import {
    COURT_CRYSTAL_ID,
    COURT_ORCHID,
    COURT_TELEGRAPH_RED,
    crystalLandingStrike,
    crystalLandingStrikeRadius,
    CRYSTAL_LANDING_DAMAGE,
    REARRANGE_ABILITY_ID,
} from '../courtMagicianConstants';
import type { EngineContext } from '../../../game/EngineContext';
import { UNIT_SIZE_MAP } from '../../../game/units/unit_defs/unitConstants';
import IMAGE from './rearrange.svg?raw';

/** Shapes Rearrange picks from (the wall is reserved for Crystal Laser). */
export const REARRANGE_FORMATIONS: readonly FormationPresetId[] = [
    'lineFromCaster',
    'wallAcrossCaster',
    'boxAroundTarget',
    'ringAroundCaster',
    'ringAroundTarget',
];

export const REARRANGE_GESTURE_SEC = 0.4;
export const REARRANGE_GLIDE_SEC = 1.0;
const GLIDE_END = REARRANGE_GESTURE_SEC + REARRANGE_GLIDE_SEC;
const COOLDOWN_END = GLIDE_END + 0.5;
export const REARRANGE_AI_RANGE = 520;

export interface RearrangePayload {
    formation: FormationPresetId;
    /** Caster and target positions the shape is laid out from (fixed at cast start). */
    casterX: number;
    casterY: number;
    targetX: number;
    targetY: number;
    /** Destination of each crystal, fitted to the map at cast start. */
    slots: FormationPoint[];
}

export function readRearrangePayload(active: { castPayload?: unknown } | undefined): RearrangePayload | null {
    const p = active?.castPayload as Partial<RearrangePayload> | undefined;
    if (!p || typeof p.formation !== 'string' || !Array.isArray(p.slots)) return null;
    return p as RearrangePayload;
}

/** Where `count` crystals go for a payload (shape, fitted to the map). Shared by the glide and the preview. */
export function rearrangeSlots(
    payload: Omit<RearrangePayload, 'slots'>,
    count: number,
    terrainManager: AbilityEngineContext['terrainManager'],
): FormationPoint[] {
    const slots = formationSlots(FORMATION_PRESETS[payload.formation], count, {
        caster: { x: payload.casterX, y: payload.casterY },
        target: { x: payload.targetX, y: payload.targetY },
    });
    return fitSlotsToTerrain(slots, terrainManager);
}

function crystalsOf(ctx: CastBehaviourTickContext): Unit[] {
    return getBoundUnits(ctx.engine.units, ctx.caster, COURT_CRYSTAL_ID);
}

const _base: AbilityStatic = defineAbility({
    id: REARRANGE_ABILITY_ID,
    name: 'Rearrange',
    image: IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: 2,
    prefireTime: GLIDE_END,
    abilityTimings: [
        { id: 'gesture', start: 0, end: REARRANGE_GESTURE_SEC, abilityPhase: AbilityPhase.Windup },
        {
            id: 'glide',
            start: REARRANGE_GESTURE_SEC,
            end: GLIDE_END,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [
                {
                    timingStart: 'start',
                    timingEnd: 'end',
                    behaviour: CastBehaviours.Arrange({
                        units: crystalsOf,
                        // A crystal still ramming from Crystal Volley finishes its ram instead.
                        leaveCastingUnits: true,
                        // Crystals float over rock on the way; one landing on rock shatters it.
                        flight: true,
                        slots: (ctx) => readRearrangePayload({ castPayload: ctx.castPayload })?.slots ?? [],
                        onArrive: (ctx, unit) => crystalLandingStrike(ctx.engine as unknown as EngineContext, ctx.caster, unit),
                    }),
                },
            ],
        },
        { id: 'cooldown', start: GLIDE_END, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Focus' }] as TargetDef[],
    aiSettings: {
        minRange: 0,
        maxRange: REARRANGE_AI_RANGE,
        // Twice a round: the courtMagician rotation opens each half with it.
        maxUsesPerRound: 2,
        priority: 25,
        ninjutsu: { ignore: true },
        canUse: (caster, ctx) => getBoundUnits(ctx.getUnits(), caster, COURT_CRYSTAL_ID).length > 0,
    },
    getRange: () => ({ minRange: 0, maxRange: REARRANGE_AI_RANGE }),
    getTooltipText(): string[] {
        return [
            'Glide every crystal into a new shape: a line toward the target, a line across his facing, a cage around them, or a ring around either of you',
            `Each crystal that lands shocks the ground around it for {${CRYSTAL_LANDING_DAMAGE}} damage`,
        ];
    },
});

export const RearrangeAbility_1401: AbilityStatic = {
    ..._base,

    /** Pick the shape and freeze the layout points once, so every client glides the same way. */
    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as AbilityEngineContext;
        const aim = (targets[0] && resolveTargetToPoint(targets[0], eng)) ?? { x: caster.x + 1, y: caster.y };
        const formation =
            REARRANGE_FORMATIONS[eng.generateRandomInteger(0, REARRANGE_FORMATIONS.length - 1)] ?? 'ringAroundCaster';
        const layout = { formation, casterX: caster.x, casterY: caster.y, targetX: aim.x, targetY: aim.y };
        const count = getBoundUnits(eng.units, caster, COURT_CRYSTAL_ID).length;
        const payload: RearrangePayload = { ...layout, slots: rearrangeSlots(layout, count, eng.terrainManager) };
        active.castPayload = payload;
    },

    /** Faint markers on the destination slots while the crystals are gliding. */
    renderActivePreview(gr: IAbilityPreviewGraphics, _caster: Unit, active: ActiveAbility, gameTime: number): void {
        const elapsed = getCastElapsedAt(active, gameTime);
        if (elapsed < 0 || elapsed >= GLIDE_END) return;
        const payload = readRearrangePayload(active);
        if (!payload) return;
        // The landing area: where each crystal will touch down and hurt.
        const strikeRadius = crystalLandingStrikeRadius(UNIT_SIZE_MAP.Tiny);
        for (const s of payload.slots) {
            gr.circle(s.x, s.y, strikeRadius);
            gr.fill({ color: COURT_TELEGRAPH_RED, alpha: 0.12 });
            gr.circle(s.x, s.y, strikeRadius);
            gr.stroke({ color: COURT_TELEGRAPH_RED, width: 1.5, alpha: 0.5 });
            gr.circle(s.x, s.y, 10);
            gr.stroke({ color: COURT_ORCHID, width: 1.5, alpha: 0.45 });
        }
    },
};

export const RearrangeCard_1401: CardDef = { abilityId: REARRANGE_ABILITY_ID };
