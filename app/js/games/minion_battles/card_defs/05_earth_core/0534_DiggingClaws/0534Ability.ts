/**
 * Digging Claws â€” Earth Core card. Wall-penetrating dash that damages rock tiles in transit.
 * If the dash ends inside a wall, the unit is steadily pushed out and launched (slingshot).
 */

import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../../abilities/Ability';
import { AbilityState } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { TargetDef } from '../../../abilities/targeting';
import { createPixelTargetPreview } from '../../../abilities/previewHelpers';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { Effect } from '../../../game/effects/Effect';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { getPixelTargetPosition, getDirectionFromTo } from '../../../abilities/targetHelpers';
import { getBodyColorForUnit, getCharacterSpriteKey } from '../../../game/units/unit_defs/unitDef';
import { areEnemies } from '../../../game/teams';
import { isAbilityNote } from '../../../game/AbilityNote';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import type { EventBus } from '../../../game/EventBus';
import { grantRecoveryChargeToRandomAbility } from '../../../abilities/abilityUses';
import { ContinuousEmitter } from '../../../game/effects/EffectEmitter';
import type { EngineContext } from '../../../game/EngineContext';
import { tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';

const CARD_ID = `${formatGroupId(AbilityGroupId.Earth)}34` as '0534';
const DASH_DURATION = 0.4;
const SLINGSHOT_PHASE = 0.3;
const COOLDOWN_DURATION = 0.8;
const MAX_DISTANCE = 160;
const DAMAGE = 5;
const KNOCKBACK_TIER = 2;
const SLINGSHOT_SPEED = 400; // px/s
const SLINGSHOT_LAUNCH_MAGNITUDE = 160;
const SLINGSHOT_LAUNCH_AIR_TIME = 0.4;
const SLINGSHOT_LAUNCH_SLIDE_TIME = 0.2;
const AFTERIMAGE_DURATION = 6 / 60;

// Number of evenly-spaced directions to scan when looking for nearest passable tile
const NEAREST_PASSABLE_DIR_COUNT = 16;

interface TerrainManagerLike {
    grid: { worldToGrid(x: number, y: number): { col: number; row: number } };
    isPassable(x: number, y: number): boolean;
    damageRock(col: number, row: number): unknown;
}

interface GameEngineLike extends EngineContext {
    interruptUnitAndRefundAbilities(unit: Unit): void;
}

const DIGGING_CLAWS_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="#3a3028" stroke="#1a1a1a"/>
  <path d="M18 46 L28 28 M24 48 L34 30 M30 46 L40 28"
        stroke="#a07840" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;

/** Scan NEAREST_PASSABLE_DIR_COUNT evenly-spaced angles from caster position, return direction toward nearest passable tile. */
function findNearestPassableDirection(
    tm: TerrainManagerLike,
    x: number,
    y: number,
): { x: number; y: number } | null {
    const STEP = 4;
    const MAX_STEPS = 50; // 200px
    let bestDist = Infinity;
    let bestDir: { x: number; y: number } | null = null;

    for (let i = 0; i < NEAREST_PASSABLE_DIR_COUNT; i++) {
        const angle = (i / NEAREST_PASSABLE_DIR_COUNT) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        for (let s = 1; s <= MAX_STEPS; s++) {
            const d = s * STEP;
            if (tm.isPassable(x + dx * d, y + dy * d)) {
                if (d < bestDist) {
                    bestDist = d;
                    bestDir = { x: dx, y: dy };
                }
                break;
            }
        }
    }
    return bestDir;
}

/** Apply launching self-knockback (slingshot launch). poiseDamage=0 so it always applies. */
function applySlingshotLaunch(
    caster: Unit,
    dirX: number,
    dirY: number,
    eventBus: EventBus,
): void {
    caster.applyKnockback(
        {
            knockbackVector: {
                x: dirX * SLINGSHOT_LAUNCH_MAGNITUDE,
                y: dirY * SLINGSHOT_LAUNCH_MAGNITUDE,
            },
            knockbackAirTime: SLINGSHOT_LAUNCH_AIR_TIME,
            knockbackSlideTime: SLINGSHOT_LAUNCH_SLIDE_TIME,
            knockbackSource: { unitId: caster.id, abilityId: CARD_ID },
        },
        eventBus,
    );
}

/** Damage a rock tile at the caster's current position (once per unique tile per cast). */
function maybeDamageCurrentTile(
    caster: Unit,
    tm: TerrainManagerLike,
    damagedTileKeys: string[],
): void {
    if (tm.isPassable(caster.x, caster.y)) return;
    const cell = tm.grid.worldToGrid(caster.x, caster.y);
    const key = `${cell.col},${cell.row}`;
    if (damagedTileKeys.includes(key)) return;
    damagedTileKeys.push(key);
    tm.damageRock(cell.col, cell.row);
}

export const DiggingClawsAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Digging Claws',
    image: DIGGING_CLAWS_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DASH_DURATION,
    abilityTimings: [
        { id: 'dash',      start: 0,                                end: DASH_DURATION,                              abilityPhase: AbilityPhase.Iframe },
        { id: 'slingshot', start: DASH_DURATION,                   end: DASH_DURATION + SLINGSHOT_PHASE,            abilityPhase: AbilityPhase.Cooldown },
        { id: 'cooldown',  start: DASH_DURATION + SLINGSHOT_PHASE, end: DASH_DURATION + SLINGSHOT_PHASE + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Direction to dash' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },

    getTooltipText(): string[] {
        return [
            'Dig through walls with iframes, damaging rock tiles you pass through',
            `Deal {${DAMAGE}} damage and knock back enemies you touch`,
            'If you end the dig inside a wall, you are flung out the other side',
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < DASH_DURATION) {
            return [{ state: AbilityState.IFRAMES }];
        }
        return [];
    },

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as GameEngineLike;
        const bodyColor = getBodyColorForUnit(caster);
        const radius = caster.radius;
        const characterSpriteKey = getCharacterSpriteKey(caster.characterId);

        const emitter = new ContinuousEmitter({
            x: caster.x,
            y: caster.y,
            attachedToUnitId: caster.id,
            lifetime: DASH_DURATION,
            emitIntervalFrames: 2,
            factory: (em) => {
                const effectData: Record<string, unknown> = { bodyColor, radius, characterSpriteKey };
                const angle = Math.random() * Math.PI * 2;
                const speed = 30 + Math.random() * 20;
                effectData.vx = Math.cos(angle) * speed;
                effectData.vy = Math.sin(angle) * speed;
                return [new Effect({
                    x: em.x,
                    y: em.y,
                    duration: AFTERIMAGE_DURATION,
                    effectType: 'Afterimage',
                    effectData,
                })];
            },
        });
        eng.addEffectEmitter(emitter);
        active.castPayload = { afterimageEmitter: emitter };
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const eng = engine as GameEngineLike;
        const tm = (eng.terrainManager as TerrainManagerLike | null) ?? null;

        // â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (prevTime < 0.05 && currentTime >= 0.05) {
            caster.setAbilityNote({
                abilityId: CARD_ID,
                abilityNote: {
                    hitTargetIds: [],
                    wallEntryX: null,
                    wallEntryY: null,
                    slingshotDirX: null,
                    slingshotDirY: null,
                    damagedTileKeys: [],
                },
            });
            grantRecoveryChargeToRandomAbility(
                caster,
                'staminaCharge',
                (min, max) => eng.generateRandomInteger(min, max),
                { excludeAbilityId: CARD_ID },
            );
        }

        // â”€â”€ Slingshot phase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (currentTime >= DASH_DURATION) {
            if (!isAbilityNote(caster.abilityNote, CARD_ID)) {
                return;
            }
            const note = caster.abilityNote.abilityNote;

            // First tick at dash end: decide whether to start slingshot
            if (prevTime < DASH_DURATION) {
                if (tm && !tm.isPassable(caster.x, caster.y)) {
                    // Compute slingshot direction: back toward the wall entry point (reversed)
                    let dirX = 0;
                    let dirY = 0;
                    if (note.wallEntryX !== null && note.wallEntryY !== null) {
                        const dx = note.wallEntryX - caster.x;
                        const dy = note.wallEntryY - caster.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 0) {
                            dirX = dx / dist;
                            dirY = dy / dist;
                        }
                    }
                    if (dirX === 0 && dirY === 0) {
                        // Edge case: started inside wall with no recorded entry
                        const nearest = findNearestPassableDirection(tm, caster.x, caster.y);
                        if (nearest) {
                            dirX = nearest.x;
                            dirY = nearest.y;
                        }
                    }
                    if (dirX !== 0 || dirY !== 0) {
                        note.slingshotDirX = dirX;
                        note.slingshotDirY = dirY;
                    }
                }
            }

            // Active slingshot: push caster out each tick
            if (note.slingshotDirX !== null && note.slingshotDirY !== null) {
                const dt = currentTime - prevTime;
                const movePerTick = SLINGSHOT_SPEED * dt;
                caster.invalidateMovementPath();
                // Move a fixed distance in slingshot direction, bypassing terrain
                caster.moveUnit(
                    caster.x + note.slingshotDirX * 10000,
                    caster.y + note.slingshotDirY * 10000,
                    movePerTick,
                );

                if (tm) {
                    maybeDamageCurrentTile(caster, tm, note.damagedTileKeys);
                    // Suppress snap-back while slingshot pushes through rock.
                    if (!tm.isPassable(caster.x, caster.y)) {
                        caster.wallStuckTime = 0;
                    }
                }

                if (!tm || tm.isPassable(caster.x, caster.y)) {
                    // Exited wall â€” launch!
                    applySlingshotLaunch(caster, note.slingshotDirX, note.slingshotDirY, eng.eventBus);
                    caster.clearAbilityNote();
                    return;
                }
            }

            // Slingshot phase expired but unit still stuck: force out via nearest direction
            if (currentTime >= DASH_DURATION + SLINGSHOT_PHASE && isAbilityNote(caster.abilityNote, CARD_ID)) {
                if (tm && !tm.isPassable(caster.x, caster.y)) {
                    const dir = findNearestPassableDirection(tm, caster.x, caster.y);
                    if (dir) {
                        let exitX = caster.x;
                        let exitY = caster.y;
                        for (let d = 4; d <= 800; d += 4) {
                            const tx = caster.x + dir.x * d;
                            const ty = caster.y + dir.y * d;
                            if (tm.isPassable(tx, ty)) {
                                exitX = tx;
                                exitY = ty;
                                break;
                            }
                        }
                        const distToExit = Math.sqrt((exitX - caster.x) ** 2 + (exitY - caster.y) ** 2);
                        if (distToExit > 0) {
                            caster.invalidateMovementPath();
                            caster.moveUnit(exitX, exitY, distToExit);
                            applySlingshotLaunch(caster, dir.x, dir.y, eng.eventBus);
                        }
                    }
                }
                caster.clearAbilityNote();
            }
            return;
        }

        // â”€â”€ Dash phase (currentTime < DASH_DURATION) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const pos = getPixelTargetPosition(targets, 0);
        const dirResult = pos ? getDirectionFromTo(caster.x, caster.y, pos.x, pos.y) : null;
        const distToTarget = dirResult?.dist ?? 0;
        const moveDistance =
            distToTarget > 0
                ? Math.min(
                      ((currentTime - prevTime) / DASH_DURATION) * MAX_DISTANCE,
                      distToTarget,
                  )
                : 0;

        // Wall-penetrating movement: bypass terrain check, call moveUnit directly
        if (pos && distToTarget > 0 && moveDistance > 0) {
            const prevX = caster.x;
            const prevY = caster.y;

            caster.invalidateMovementPath();
            caster.moveUnit(pos.x, pos.y, moveDistance);

            // Wall entry/exit tracking and rock tile damage
            if (tm) {
                const wasPassable = tm.isPassable(prevX, prevY);
                const nowPassable = tm.isPassable(caster.x, caster.y);

                if (isAbilityNote(caster.abilityNote, CARD_ID)) {
                    const note = caster.abilityNote.abilityNote;
                    if (wasPassable && !nowPassable) {
                        note.wallEntryX = prevX;
                        note.wallEntryY = prevY;
                    } else if (!wasPassable && nowPassable) {
                        note.wallEntryX = null;
                        note.wallEntryY = null;
                    }
                    maybeDamageCurrentTile(caster, tm, note.damagedTileKeys);
                }

                // Suppress wall-unstick snap-back while actively digging through rock.
                // tickWallUnstick runs after doCardEffect each frame; resetting wallStuckTime
                // prevents the 0.1s snap from undoing the wall-penetrating movement.
                if (!nowPassable) {
                    caster.wallStuckTime = 0;
                }
            }
        }

        // Enemy hit detection (identical to Claw)
        if (isAbilityNote(caster.abilityNote, CARD_ID) && dirResult && dirResult.dist > 0) {
            const note = caster.abilityNote.abilityNote;
            const touchRadius = caster.radius;
            for (const unit of eng.units) {
                if (!unit.active || !unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
                if (unit.id === caster.id) continue;
                if (note.hitTargetIds.includes(unit.id)) continue;
                if (unit.hasIFrames(eng.gameTime)) continue;

                const dx = unit.x - caster.x;
                const dy = unit.y - caster.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > touchRadius + unit.radius) continue;

                const blocked = !tryDamageOrBlock(unit, {
                    engine: eng,
                    gameTime: eng.gameTime,
                    eventBus: eng.eventBus,
                    attackerX: caster.x,
                    attackerY: caster.y,
                    attackerId: caster.id,
                    abilityId: CARD_ID,
                    damage: DAMAGE,
                    attackType: 'melee',
                });
                if (blocked) continue;

                note.hitTargetIds.push(unit.id);

                tryApplyKnockbackByTier(
                    unit, KNOCKBACK_TIER,
                    { unitId: caster.id, abilityId: CARD_ID },
                    caster.x, caster.y,
                    { gameTime: eng.gameTime, roundNumber: eng.roundNumber, eventBus: eng.eventBus, interruptUnitAndRefundAbilities: eng.interruptUnitAndRefundAbilities.bind(eng) },
                );
            }
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Melee blocked: no additional behaviour.
    },

    renderTargetingPreview: createPixelTargetPreview(MAX_DISTANCE),
};

export const DiggingClawsCard: CardDef = {
    abilityId: CARD_ID,
};
