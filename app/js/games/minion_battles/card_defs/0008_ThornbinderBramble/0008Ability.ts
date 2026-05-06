/**
 * Thornbinder — AoE bramble slam: damage + slowing patch until shortly before next cast.
 */

import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../game/AbilityNote';
import { areEnemies } from '../../game/teams';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { getPixelTargetPosition } from '../../abilities/targetHelpers';
import type { EventBus } from '../../game/EventBus';
import { Effect } from '../../game/effects/Effect';
import { isLightHateWeakened } from '../../game/lightHate';
import { BRAMBLE_PATCH_EFFECT_TYPE } from '../../game/brambleSlow';

export const THORNBINDER_ABILITY_ID = `${formatGroupId(AbilityGroupId.Enemy)}08`;

const LOCK_TIME = 0.85;
const STRIKE_TIME = 1.25;
const COOLDOWN_END = 5.5;
const BASE_RADIUS = 95;
const WEAKENED_RADIUS = 72;
const BASE_DAMAGE = 7;
const WEAKENED_DAMAGE = 5;
const SLOW_MULT_NORMAL = 0.52;
const SLOW_MULT_WEAKENED = 0.72;
const BRAMBLE_CLEAR_BEFORE_NEXT_SEC = 0.15;

interface EngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    effects: Effect[];
    addEffect(e: Effect): void;
    lightLevelEnabled: boolean;
    globalLightLevel: number;
    terrainManager: { grid: import('../../terrain/TerrainGrid').TerrainGrid } | null;
    getAllLightSources(): import('../../game/LightGrid').LightSource[];
}

function getStrikePosition(caster: Unit, active: { targets: ResolvedTarget[] }): { x: number; y: number } | null {
    if (isAbilityNote(caster.abilityNote, '0008')) {
        return caster.abilityNote.abilityNote.position;
    }
    return getPixelTargetPosition(active.targets, 0);
}

function clearBrambleFromOwner(engine: EngineLike, ownerId: string): void {
    for (const e of engine.effects) {
        if (!e.active || e.effectType !== BRAMBLE_PATCH_EFFECT_TYPE) continue;
        const d = e.effectData as { ownerUnitId?: string };
        if (d.ownerUnitId === ownerId) e.active = false;
    }
}

export const ThornbinderBrambleAbility: AbilityStatic = {
    id: THORNBINDER_ABILITY_ID,
    name: 'Bramble Slam',
    image: '',
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: STRIKE_TIME,
    abilityTimings: [
        { id: 'windup', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'strike', start: LOCK_TIME, end: STRIKE_TIME, abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: STRIKE_TIME, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Ground' }] as TargetDef[],
    aiSettings: { minRange: 60, maxRange: 320 },

    getTooltipText(): string[] {
        return [
            'Slam the ground, dealing damage and leaving bramble that slows movement',
            'Weakened by bright light (Light Hate)',
        ];
    },
    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const eng = engine as EngineLike;
        if (prevTime < LOCK_TIME && currentTime >= LOCK_TIME) {
            const pos = getPixelTargetPosition(targets, 0);
            if (pos) {
                caster.setAbilityNote({
                    abilityId: '0008',
                    abilityNote: { position: { ...pos } },
                });
            }
        }
        if (prevTime >= STRIKE_TIME || currentTime < STRIKE_TIME) return;

        const pos = getStrikePosition(caster, { targets });
        caster.clearAbilityNote();
        if (!pos) return;

        const weakened = isLightHateWeakened(caster, eng);
        const radius = weakened ? WEAKENED_RADIUS : BASE_RADIUS;
        const damage = weakened ? WEAKENED_DAMAGE : BASE_DAMAGE;
        const slowMult = weakened ? SLOW_MULT_WEAKENED : SLOW_MULT_NORMAL;

        clearBrambleFromOwner(eng, caster.id);
        const r2 = radius * radius;

        for (const u of eng.units) {
            if (!u.isAlive() || u.id === caster.id) continue;
            if (!areEnemies(caster.teamId, u.teamId)) continue;
            const dx = u.x - pos.x;
            const dy = u.y - pos.y;
            if (dx * dx + dy * dy > r2) continue;
            tryDamageOrBlock(u, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: pos.x,
                attackerY: pos.y,
                attackerId: caster.id,
                abilityId: THORNBINDER_ABILITY_ID,
                damage,
                attackType: 'melee',
            });
        }

        const expiresAt = eng.gameTime + (COOLDOWN_END - STRIKE_TIME) - BRAMBLE_CLEAR_BEFORE_NEXT_SEC;
        eng.addEffect(
            new Effect({
                x: pos.x,
                y: pos.y,
                duration: 999_999,
                effectType: BRAMBLE_PATCH_EFFECT_TYPE,
                effectData: {
                    radiusPx: radius,
                    slowMult,
                    expiresAtGameTime: Math.max(eng.gameTime + 0.05, expiresAt),
                    ownerUnitId: caster.id,
                },
            }),
        );
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},
    renderTargetingPreview(gr: IAbilityPreviewGraphics, caster: Unit): void {
        gr.circle(caster.x, caster.y, 320);
        gr.stroke({ width: 1, color: 0x86efac, alpha: 0.35 });
    },
};

export const ThornbinderBrambleCard: CardDef = {
    id: asCardDefId(THORNBINDER_ABILITY_ID),
    name: 'Bramble Slam',
    abilityId: THORNBINDER_ABILITY_ID,
    durability: 1,
    discardDuration: { duration: 2, unit: 'rounds' },
};
