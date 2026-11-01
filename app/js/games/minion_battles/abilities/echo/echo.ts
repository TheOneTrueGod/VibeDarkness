/**
 * Echo: an ability also happens at every token of one type that its caster has on the field,
 * then those tokens are destroyed. A token is any deployable with a `subtype`
 * (`game/deployables/Deployable.ts`), e.g. a dropped sword is subtype `sword`.
 *
 * The ability decides what "happens at a token" means. Built-in shapes:
 * - a burst ({@link EchoBurstSpec}, {@link strikeEchoBurst}): damage, knockback and stun in a circle
 *   around the token. `MeleeAttack.withEcho` runs it after the main hit.
 * - an arc sweep (`CastBehaviours.ArcSweep` with `echo`): the same whirlwind turns around each token.
 * - anything else: call {@link findEchoTokens}, act at each one, then {@link consumeEchoTokens}
 *   (`defineThrownWeapon` throws a copy from each token).
 *
 * Preview and cast both read {@link findEchoTokens} with the same arguments, so they agree.
 */
import type { IAbilityPreviewGraphics } from '../Ability';
import type { Deployable, DeployableQuery } from '../../game/deployables/Deployable';
import type { Unit } from '../../game/units/Unit';
import { damageEnemiesInCircle } from '../targetHelpers';
import { landAreaStrike, type AreaStrikeEngine, type AreaStrikeSpec } from '../areaStrike';

/** Which tokens an ability echoes at. */
export interface EchoSpec {
    /** `Deployable.subtype` of the tokens, e.g. a dropped weapon's token kind. */
    tokenType: string;
    /** Shown in the keyword line, e.g. `Sword` for `{Echo: Sword}`. */
    tokenLabel: string;
}

/** What one echo does in a circle around its token: an area strike (`abilities/areaStrike.ts`). */
export interface EchoBurstSpec extends AreaStrikeSpec {
    radius: number;
    /** Closest enemies hit. Omitted hits every enemy in the circle. */
    maxTargets?: number;
    /** Impact effect at the token. */
    vfx?: (engine: unknown, origin: { x: number; y: number }, radius: number) => void;
}

interface EchoEngine {
    findDeployables?(query: DeployableQuery): Deployable[];
    consumeDeployable?(deployable: Pick<Deployable, 'id' | 'kind'>): boolean;
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

/** One echo burst at `origin`: strike the closest enemies in the circle (see `landAreaStrike`). */
export function strikeEchoBurst(
    engine: unknown,
    caster: Unit,
    abilityId: string,
    origin: { x: number; y: number },
    burst: EchoBurstSpec,
): Unit[] {
    const landed: Unit[] = [];
    damageEnemiesInCircle({
        engine: engine as AreaStrikeEngine,
        caster,
        center: origin,
        radius: burst.radius,
        damage: burst.damage,
        abilityId,
        maxTargets: burst.maxTargets,
        onHit: (unit) => {
            if (landAreaStrike(engine, caster, abilityId, origin, unit, burst)) landed.push(unit);
        },
    });
    burst.vfx?.(engine, origin, burst.radius);
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
