/**
 * Cast behaviours that move the caster's pet as part of the caster's own cast (the pet does not cast).
 * The pet is the caster's nearest **free** living pet (`resolveCasterPetAnchor` with `requireFree`, see
 * `game/units/castPriority.ts`), picked once at the window start; a pet the caster's own cast already holds
 * comes first, so a later window keeps the same pet. With no free pet the behaviour does nothing.
 * Holding a pet counts as `Major` (`isUnitHeldByCast`), so a busy pet is never taken.
 *
 * - `PetRelocateBehaviour`: the pet moves very quickly from where it stands to the window's pixel target,
 *   leaving a slash trail (e.g. Spirit Storm's reposition, after an anchored select step).
 * - `PetSpinBehaviour`: the pet spins in a tight loop round where it stands for the window (e.g. while
 *   Spirit Storm pulses). The loop is a render-only offset (`getUnitRenderOffsets`): the pet's real
 *   position stays on its spot, so anything centred on the pet (hit areas, fields) stays centred.
 *
 * Both take the pet's movement for the window (its walk goal is cleared each tick), so the pet AI cannot
 * walk it away mid-cast. `PetRelocateBehaviour` first preempts the pet's own casts (a free pet runs only
 * `Minor` ones, e.g. a bite), so the hold never overlaps a cast of the pet's own.
 */
import type { Unit } from '../../game/units/Unit';
import type {
    CastBehaviour,
    CastBehaviourBaseContext,
    CastBehaviourRenderContext,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
    UnitRenderOffset,
} from '../castBehaviourTypes';
import { resolveCasterPetAnchor } from '../targeting';
import type { EngineContext } from '../../game/EngineContext';
import { createSlashTrail, type SlashTrailColors } from '../../game/effects/slashTrail';

function getPet(ctx: CastBehaviourBaseContext, petId: string | undefined): Unit | null {
    if (!petId) return null;
    const pet = ctx.engine.getUnit(petId);
    return pet?.isAlive() ? pet : null;
}

function holdPet(pet: Unit): void {
    pet.clearMovement();
    pet.claimAbilityMovement();
    pet.invalidateMovementPath();
}

interface RelocatePayload {
    petId: string;
    sx: number;
    sy: number;
    tx: number;
    ty: number;
}

/** Share of the window the move takes; the rest holds at the destination. */
const RELOCATE_MOVE_SHARE = 0.8;

export class PetRelocateBehaviour implements CastBehaviour {
    private _trail: SlashTrailColors | null = null;

    withSlashTrail(colors: SlashTrailColors): this {
        this._trail = colors;
        return this;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        ctx.setBehaviourPayload(null);
        const pet = resolveCasterPetAnchor(ctx.caster, ctx.engine, { requireFree: true });
        const t = ctx.target;
        if (!pet || t.type !== 'pixel' || !t.position) return;
        if (pet.activeAbilities.length > 0) pet.preemptAllAbilities(ctx.engine as unknown as EngineContext);
        const payload: RelocatePayload = { petId: pet.id, sx: pet.x, sy: pet.y, tx: t.position.x, ty: t.position.y };
        ctx.setBehaviourPayload(payload);
        if (this._trail) {
            ctx.engine.addEffect(
                createSlashTrail({ x: pet.x, y: pet.y }, t.position, (ctx.windowSeconds ?? 0.15) * RELOCATE_MOVE_SHARE, this._trail),
            );
        }
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as RelocatePayload | null;
        if (!payload) return;
        const pet = getPet(ctx, payload.petId);
        if (!pet) return;
        holdPet(pet);
        const p = Math.min(1, ctx.windowProgress / RELOCATE_MOVE_SHARE);
        const eased = 1 - (1 - p) * (1 - p);
        pet.x = payload.sx + (payload.tx - payload.sx) * eased;
        pet.y = payload.sy + (payload.ty - payload.sy) * eased;
    }

    getHeldUnitIds(behaviourPayload: unknown): readonly string[] {
        const payload = behaviourPayload as RelocatePayload | null | undefined;
        return payload ? [payload.petId] : [];
    }
}

interface SpinPayload {
    petId: string;
    cx: number;
    cy: number;
    seconds: number;
}

export class PetSpinBehaviour implements CastBehaviour {
    private _radius = 7;
    private _turnsPerSecond = 2.5;

    /** Loop radius (px). */
    withRadius(px: number): this {
        this._radius = px;
        return this;
    }

    withTurnsPerSecond(turns: number): this {
        this._turnsPerSecond = turns;
        return this;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        ctx.setBehaviourPayload(null);
        const pet = resolveCasterPetAnchor(ctx.caster, ctx.engine, { requireFree: true });
        if (!pet) return;
        ctx.setBehaviourPayload({ petId: pet.id, cx: pet.x, cy: pet.y, seconds: ctx.windowSeconds ?? 1 } satisfies SpinPayload);
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as SpinPayload | null;
        if (!payload) return;
        const pet = getPet(ctx, payload.petId);
        if (!pet) return;
        // Pin the pet on its spot; the loop itself is drawn by getUnitRenderOffsets.
        holdPet(pet);
        pet.x = payload.cx;
        pet.y = payload.cy;
    }

    /** Offset of the loop at `windowProgress`; eases in and out so the pet does not jump a full radius. */
    spinOffset(windowProgress: number, seconds: number): { x: number; y: number } {
        if (windowProgress >= 1) return { x: 0, y: 0 };
        const angle = windowProgress * seconds * this._turnsPerSecond * Math.PI * 2;
        const r = this._radius * Math.min(1, windowProgress * 8, (1 - windowProgress) * 8);
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    }

    getUnitRenderOffsets(ctx: CastBehaviourRenderContext): readonly UnitRenderOffset[] | null {
        const payload = ctx.behaviourPayload as SpinPayload | null;
        if (!payload) return null;
        const offset = this.spinOffset(ctx.windowProgress, payload.seconds);
        return [{ unitId: payload.petId, ...offset }];
    }

    getHeldUnitIds(behaviourPayload: unknown): readonly string[] {
        const payload = behaviourPayload as SpinPayload | null | undefined;
        return payload ? [payload.petId] : [];
    }
}
