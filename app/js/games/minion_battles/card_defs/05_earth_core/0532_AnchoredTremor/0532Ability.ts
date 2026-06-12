import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { TerrainType } from '../../../terrain/TerrainType';
import type { EventBus } from '../../../game/EventBus';
import { areEnemies } from '../../../game/teams';
import { type CardDef } from '../../types';

function getPixelTargetPosition(
    targets: ResolvedTarget[],
    index: number = 0,
): { x: number; y: number } | null {
    const target = targets[index];
    if (!target || target.type !== 'pixel' || !target.position) return null;
    return target.position;
}

const ABILITY_ID = '0532';
const PULSE_INTERVAL = 0.35;
const BASE_DAMAGE = 3;
const RAMP_PER_PULSE = 2;
const STONE_BONUS_DAMAGE = 2;
const RADIUS = 65;
const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
    {
        id: 'active',
        start: 0.2,
        end: 1.6,
        abilityPhase: AbilityPhase.Active,
        emitterDef: {
            mode: 'interval',
            intervalSeconds: PULSE_INTERVAL,
            effectType: 'ChargedRockExplosion',
            effectRadius: RADIUS,
            fireImmediately: true,
        },
    },
    { id: 'cooldown', start: 1.6, end: 2.0, abilityPhase: AbilityPhase.Cooldown },
];

const ANCHORED_TREMOR_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="15" fill="#485230"/>
  <path d="M8 24 Q14 16 20 24 Q26 32 32 24" fill="none" stroke="#bef264" stroke-width="3"/>
</svg>`;

interface GameEngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    terrainManager?: {
        getTerrainAt(x: number, y: number): TerrainType;
    };
}

function getCompletedPulseCount(prevTime: number, currentTime: number): number {
    const before = Math.floor(Math.max(0, prevTime - 0.2) / PULSE_INTERVAL);
    const after = Math.floor(Math.max(0, currentTime - 0.2) / PULSE_INTERVAL);
    return Math.max(0, after - before);
}

export const AnchoredTremor: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Anchored Tremor',
    image: ANCHORED_TREMOR_IMAGE,
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: 1,
    prefireTime: 0.2,
    abilityTimings: TIMINGS,
    targets: [{ type: 'pixel', label: 'Pulse center' }],
    aiSettings: { minRange: 0, maxRange: 260 },
    getTooltipText(): string[] {
        return ['Pulsing tremor ramping damage each pulse. Enemies on stone take extra damage.'];
    },
    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const pulses = getCompletedPulseCount(prevTime, currentTime);
        if (pulses <= 0) return;
        const target = getPixelTargetPosition(targets, 0);
        if (!target) return;
        const eng = engine as GameEngineLike;
        const completedPulseCountBefore = Math.floor(Math.max(0, prevTime - 0.2) / PULSE_INTERVAL);

        const r2 = RADIUS * RADIUS;
        for (let p = 0; p < pulses; p++) {
            const pulseNumber = completedPulseCountBefore + p + 1;
            const damage = BASE_DAMAGE + Math.max(0, pulseNumber - 1) * RAMP_PER_PULSE;
            for (const unit of eng.units) {
                if (!unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
                const dx = unit.x - target.x;
                const dy = unit.y - target.y;
                if (dx * dx + dy * dy > r2) continue;
                const onStone = eng.terrainManager?.getTerrainAt(unit.x, unit.y) === TerrainType.Rock;
                unit.takeDamage(damage + (onStone ? STONE_BONUS_DAMAGE : 0), caster.id, eng.eventBus);
            }
        }
    },
    getAbilityStates(): [] {
        return [];
    },
    onAttackBlocked(): void {},
};

export const AnchoredTremorCard: CardDef = {
    abilityId: ABILITY_ID,
};
