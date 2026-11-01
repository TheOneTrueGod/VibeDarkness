/**
 * Echo: an ability also happens at every token of one type that its caster has on the field,
 * then those tokens are destroyed. A token is any deployable with a `subtype`
 * (`game/deployables/Deployable.ts`), e.g. a dropped sword is subtype `sword`.
 *
 * The ability decides what "happens at a token" means. Two shapes are built in:
 * - a burst ({@link EchoBurstSpec}, {@link strikeEchoBurst}): damage, knockback and stun in a circle
 *   around the token. `MeleeAttack.withEcho` runs it after the main hit.
 * - anything else: call {@link findEchoTokens}, act at each one, then {@link consumeEchoTokens}
 *   (`defineThrownWeapon` throws a copy from each token).
 *
 * Preview and cast both read {@link findEchoTokens} with the same arguments, so they agree.
 */
import type { IAbilityPreviewGraphics } from '../Ability';
import type { Deployable, DeployableQuery } from '../../game/deployables/Deployable';
import type { EventBus } from '../../game/EventBus';
import type { Unit } from '../../game/units/Unit';
import { tryDamageOrBlock } from '../blockingHelpers';
import { damageEnemiesInCircle } from '../targetHelpers';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';
import { tryApplyHardCcStun } from '../../crowdControl/tryApplyHardCcStun';

/** Which tokens an ability echoes at. */
export interface EchoSpec {
    /** `Deployable.subtype` of the tokens, e.g. a dropped weapon's token kind. */
    tokenType: string;
    /** Shown in the keyword line, e.g. `Sword` for `{Echo: Sword}`. */
    tokenLabel: string;
}

/** What one echo does in a circle around its token. */
export interface EchoBurstSpec {
    radius: number;
    damage: number;
    /** Closest enemies hit. Omitted hits every enemy in the circle. */
    maxTargets?: number;
    /** Knockback tier, pushing away from the token. */
    knockbackTier?: number;
    stunSeconds?: number;
    /** CC armour charges the stun spends. Default 1. */
    stunCcCharges?: number;
    /** Impact effect at the token. */
    vfx?: (engine: unknown, origin: { x: number; y: number }, radius: number) => void;
}

interface EchoEngine {
    findDeployables?(query: DeployableQuery): Deployable[];
    consumeDeployable?(deployable: Pick<Deployable, 'id' | 'kind'>): boolean;
}

interface EchoStrikeEngine {
    units: Unit[];
    gameTime: number;
    roundNumber?: number;
    eventBus: EventBus;
    getUnit?(id: string): Unit | undefined;
}

/** Tooltip keyword line, e.g. `{Echo: Sword}`. */
export function formatEchoLine(spec: EchoSpec): string {
    return `{Echo: ${spec.tokenLabel}}`;
}

/** The caster's own tokens of `spec.tokenType`, nearest first. Empty when the engine has no deployables. */
export function findEchoTokens(engine: unknown, caster: Unit, spec: EchoSpec): Deployable[] {
    const eng = engine as EchoEngine | undefined;
    if (!eng?.findDeployables) return [];
    return eng.findDeployables({
        castingTeam: caster.teamId,
        near: { x: caster.x, y: caster.y },
        subtype: spec.tokenType,
        ownerUnitId: caster.id,
    });
}

export function consumeEchoTokens(engine: unknown, tokens: readonly Deployable[]): void {
    const eng = engine as EchoEngine | undefined;
    for (const token of tokens) eng?.consumeDeployable?.(token);
}

/** One echo burst at `origin`: damage the closest enemies, then knock back and stun the ones it hit. */
export function strikeEchoBurst(
    engine: unknown,
    caster: Unit,
    abilityId: string,
    origin: { x: number; y: number },
    burst: EchoBurstSpec,
): Unit[] {
    const eng = engine as EchoStrikeEngine;
    const landed: Unit[] = [];
    damageEnemiesInCircle({
        engine: eng,
        caster,
        center: origin,
        radius: burst.radius,
        damage: burst.damage,
        abilityId,
        maxTargets: burst.maxTargets,
        onHit: (unit) => {
            const outcome = tryDamageOrBlock(unit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: origin.x,
                attackerY: origin.y,
                attackerId: caster.id,
                abilityId,
                damage: burst.damage,
                attackType: 'melee',
            });
            if (outcome.hit) landed.push(unit);
        },
    });
    burst.vfx?.(engine, origin, burst.radius);
    const round = eng.roundNumber ?? 0;
    for (const unit of landed) {
        if (burst.knockbackTier != null) {
            tryApplyKnockbackByTier(
                unit,
                burst.knockbackTier,
                { unitId: caster.id, abilityId },
                origin.x,
                origin.y,
                knockbackCtxFromEngine(eng as Parameters<typeof knockbackCtxFromEngine>[0]),
            );
        }
        if (burst.stunSeconds != null) {
            tryApplyHardCcStun(unit, burst.stunSeconds, eng.gameTime, round, eng.eventBus, burst.stunCcCharges ?? 1);
        }
    }
    return landed;
}

/** Echo every token: burst at each, then destroy them. `tokens` defaults to a fresh lookup. */
export function runEchoBursts(
    engine: unknown,
    caster: Unit,
    abilityId: string,
    spec: EchoSpec,
    burst: EchoBurstSpec,
    tokens: readonly Deployable[] = findEchoTokens(engine, caster, spec),
): void {
    for (const token of tokens) strikeEchoBurst(engine, caster, abilityId, token, burst);
    consumeEchoTokens(engine, tokens);
}

export interface EchoPreviewStyle {
    color: number;
    fillAlpha?: number;
    strokeAlpha?: number;
}

/** Targeting preview: the burst circle around each token that would echo. */
export function drawEchoBurstPreviews(
    gr: IAbilityPreviewGraphics,
    gameState: unknown,
    caster: Unit,
    spec: EchoSpec,
    radius: number,
    style: EchoPreviewStyle,
): void {
    for (const token of findEchoTokens(gameState, caster, spec)) {
        gr.circle(token.x, token.y, radius);
        gr.fill({ color: style.color, alpha: style.fillAlpha ?? 0.12 });
        gr.circle(token.x, token.y, radius);
        gr.stroke({ color: style.color, width: 2, alpha: style.strokeAlpha ?? 0.85 });
    }
}
