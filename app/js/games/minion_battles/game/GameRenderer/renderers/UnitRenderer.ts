import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { DarknessLevel } from '../../darknessLevels';
import type { GameEngine } from '../../GameEngine';
import type { AssetRegistry } from '../AssetRegistry';
import type { OverlayRenderer } from './OverlayRenderer';
import type { TeamId } from '../../teams';
import { areEnemies } from '../../teams';
import { UnitTag } from '../../units/unitTag';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { normalizeAbilityTimingsToIntervals, resolveAbilityTimingEntries, getEffectiveCastBehaviours } from '../../../abilities/abilityTimings';
import { resolveBehaviourTimingRef } from '../../../abilities/castBehaviourTypes';
import { resolveCastBehaviourTarget } from '../../../abilities/resolveCastBehaviourTarget';
import {
    renderUnit,
    updateUnitHpBar,
    getBodyColorForUnit,
    syncUnitCharacterSpriteIfNeeded,
    CHARACTER_SPRITE_SCALE,
    type IUnitRenderContext,
} from '../../units/unit_defs/unitDef';
import { getSpawnRenderState } from '../../units/spawnVisuals';
import { getBuffVisualRenderer } from '../../../buffs/buffVisuals';
import type { DamageTakenEvent } from '../../EventBus';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';

const HIT_FLASH_DURATION = 0.3;

const Z_UNITS = 10;
const Z_KNOCKBACK_SHADOW = 9;

export class UnitRenderer {
    private unitVisuals: Map<string, Container> = new Map();
    private knockbackShadowVisuals: Map<string, Graphics> = new Map();
    private constructionGhostVisuals: Map<string, Container> = new Map();
    private hitFlashState: Map<string, { startTime: number; rafId: number }> = new Map();

    /** Cached engine set each render — used by onDamageTaken. */
    private currentEngine: GameEngine | null = null;
    private debugUnitOutlineId: string | null = null;

    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
        private readonly overlayRenderer: OverlayRenderer,
    ) {}

    setDebugUnitOutline(unitId: string | null): void {
        this.debugUnitOutlineId = unitId;
    }

    private getUnitRenderContext(localTeamId: TeamId): IUnitRenderContext {
        return {
            localTeamId,
            getCharacterTexture: (characterId: string) => this.assets.getCharacterTexture(characterId),
            getPlayerPortraitTexture: (portraitId: string) => this.assets.getPlayerPortraitTexture(portraitId),
        };
    }

    render(engine: GameEngine, localTeamId: TeamId, debugUnitOutlineId: string | null): void {
        this.currentEngine = engine;
        this.debugUnitOutlineId = debugUnitOutlineId;

        if (this.assets.pendingUnitSync) {
            this.syncAllUnitCharacterSprites(engine, localTeamId);
            this.assets.pendingUnitSync = false;
        }

        this.renderUnits(engine, localTeamId);
        this.renderConstructionGhosts(engine);
        this.cleanup(engine);
    }

    onDamageTaken(data: DamageTakenEvent): void {
        const container = this.unitVisuals.get(data.unitId);
        const unit = this.currentEngine?.getUnit(data.unitId);
        if (!container || !unit || unit.isInvincible()) return;
        this.startHitFlash(data.unitId, container, unit.radius);
    }

    clearHitFlashes(): void {
        for (const [, s] of this.hitFlashState) {
            cancelAnimationFrame(s.rafId);
        }
        this.hitFlashState.clear();
    }

    setLayerVisible(visible: boolean): void {
        if (visible) return;
        for (const visual of this.unitVisuals.values()) {
            visual.visible = false;
        }
        for (const shadow of this.knockbackShadowVisuals.values()) {
            shadow.visible = false;
        }
        for (const ghost of this.constructionGhostVisuals.values()) {
            ghost.visible = false;
        }
    }

    private syncAllUnitCharacterSprites(engine: GameEngine, localTeamId: TeamId): void {
        const context = this.getUnitRenderContext(localTeamId);
        for (const unit of engine.units) {
            const visual = this.unitVisuals.get(unit.id);
            if (!visual) continue;
            syncUnitCharacterSpriteIfNeeded(visual, unit, context);
        }
    }

    private renderUnits(engine: GameEngine, localTeamId: TeamId): void {
        const units = engine.units;
        const context = this.getUnitRenderContext(localTeamId);
        const cellSize = CELL_SIZE;
        const gameTime = engine.gameTime;

        for (const unit of units) {
            let visual = this.unitVisuals.get(unit.id);
            if (!visual) {
                visual = renderUnit(unit, context);
                visual.zIndex = Z_UNITS;
                this.unitVisuals.set(unit.id, visual);
                this.gameContainer.addChild(visual);
            }

            let renderOffsetX = 0;
            let renderOffsetY = 0;
            for (const activeAbility of unit.activeAbilities) {
                const ability = getAbility(activeAbility.abilityId);
                if (!ability?.getCasterRenderOffset) continue;
                const offset = ability.getCasterRenderOffset(unit, activeAbility, engine.gameTime, engine);
                if (!offset) continue;
                renderOffsetX += offset.x;
                renderOffsetY += offset.y;
            }
            for (const activeAbility of unit.activeAbilities) {
                if (!activeAbility.castBehaviourPayloads) continue;
                const ability = getAbility(activeAbility.abilityId);
                if (!ability) continue;
                const intervals = normalizeAbilityTimingsToIntervals(
                    resolveAbilityTimingEntries(ability, unit, engine),
                );
                for (let iIdx = 0; iIdx < intervals.length; iIdx++) {
                    const interval = intervals[iIdx]!;
                    const effectiveBehaviours = getEffectiveCastBehaviours(interval);
                    if (!effectiveBehaviours) continue;
                    for (let bIdx = 0; bIdx < effectiveBehaviours.length; bIdx++) {
                        const entry = effectiveBehaviours[bIdx]!;
                        if (!entry.behaviour.getCasterRenderOffset) continue;
                        const elapsed = engine.gameTime - activeAbility.startTime;
                        const windowStart = resolveBehaviourTimingRef(entry.timingStart, interval.start, interval.end);
                        const windowEnd = entry.timingEnd !== undefined
                            ? resolveBehaviourTimingRef(entry.timingEnd, interval.start, interval.end)
                            : windowStart;
                        const windowLen = windowEnd - windowStart;
                        const rawProgress = windowLen > 0 ? (elapsed - windowStart) / windowLen : 0;
                        const windowProgress = Math.max(0, Math.min(1, rawProgress));
                        if (elapsed < windowStart - 0.05 || elapsed > windowEnd + 0.05) continue;
                        const behaviourKey = `${interval.id}_${bIdx}`;
                        const behaviourPayload = activeAbility.castBehaviourPayloads[behaviourKey];
                        const target = resolveCastBehaviourTarget(
                            entry,
                            interval,
                            activeAbility,
                            unit,
                            ability,
                            engine,
                        );
                        if (!target) continue;
                        const offset = entry.behaviour.getCasterRenderOffset({
                            caster: unit,
                            abilityId: activeAbility.abilityId,
                            target,
                            allTargets: activeAbility.targets,
                            castPayload: activeAbility.castPayload,
                            behaviourPayload,
                            setBehaviourPayload: () => { },
                            engine,
                            gameTime: engine.gameTime,
                            windowProgress,
                        });
                        if (offset) {
                            renderOffsetX += offset.x;
                            renderOffsetY += offset.y;
                        }
                    }
                }
            }

            // Knockback air arc: quadratic Y lift during the airborne phase only.
            let knockupYOffset = 0;
            let knockupMaxHeight = 0;
            if (unit.knockback !== null) {
                const kb = unit.knockback;
                const airTime = kb.knockbackAirTime;
                if (airTime > 0 && kb.knockbackElapsed < airTime) {
                    const progress = kb.knockbackElapsed / airTime;
                    const arcFactor = 4 * progress * (1 - progress);
                    const vx = kb.knockbackVector.x;
                    const vy = kb.knockbackVector.y;
                    const magnitude = Math.sqrt(vx * vx + vy * vy);
                    knockupMaxHeight = Math.min(magnitude * 0.25, 25);
                    knockupYOffset = -arcFactor * knockupMaxHeight;
                }
            }

            // Shadow: rendered at ground level while unit is airborne, shrinking as unit rises.
            let knockbackShadow = this.knockbackShadowVisuals.get(unit.id);
            if (knockupYOffset < 0 && unit.active) {
                if (!knockbackShadow) {
                    knockbackShadow = new Graphics();
                    knockbackShadow.zIndex = Z_KNOCKBACK_SHADOW;
                    this.knockbackShadowVisuals.set(unit.id, knockbackShadow);
                    this.gameContainer.addChild(knockbackShadow);
                }
                knockbackShadow.visible = true;
                knockbackShadow.clear();
                const heightFraction = knockupMaxHeight > 0 ? -knockupYOffset / knockupMaxHeight : 0;
                const shadowScale = 1 - heightFraction * 0.65;
                const shadowRx = unit.radius * 1.1 * shadowScale;
                const shadowRy = unit.radius * 0.35 * shadowScale;
                knockbackShadow.ellipse(0, 0, shadowRx, shadowRy);
                knockbackShadow.fill({ color: 0x222222, alpha: 0.55 });
                knockbackShadow.x = unit.x;
                knockbackShadow.y = unit.y + unit.radius - 4;
            } else {
                if (knockbackShadow) knockbackShadow.visible = false;
            }

            const spawnState = getSpawnRenderState(unit);
            visual.x = unit.x + renderOffsetX;
            visual.y = unit.y + renderOffsetY + knockupYOffset + (spawnState?.yOffset ?? 0);
            visual.visible = unit.active && (spawnState ? spawnState.visible : true);

            // Grow-in animation: scale from 0 → 1 over growAnimTimer duration (nestSpawn units)
            if (unit.growAnimTimer > 0) {
                const growProgress = 1 - unit.growAnimTimer / 0.3;
                const eased = 1 - Math.pow(1 - Math.min(1, growProgress), 3);
                visual.scale.set(eased);
            } else if (spawnState) {
                visual.scale.set(spawnState.scale);
            } else {
                visual.scale.set(1);
            }

            const col = Math.floor(unit.x / cellSize);
            const row = Math.floor(unit.y / cellSize);
            const light = this.overlayRenderer.getLightAt(col, row);
            const inFullDarkness =
                light !== null && light <= DarknessLevel.FULL_DARKNESS && areEnemies(localTeamId, unit.teamId);
            const isDebugOutlined = this.debugUnitOutlineId === unit.id;

            const body = visual.children.find((c) => c.label === 'body') as Graphics | undefined;
            const hpBg = visual.children.find((c) => c.label === 'hpBg');
            const hpFill = visual.children.find((c) => c.label === 'hpFill');
            const characterSprite = visual.children.find((c) => c.label === 'characterSprite');
            const label = visual.children.find((c) => c.label === 'label');
            const glow = visual.children.find((c) => c.label === 'glow');
            const playerRing = visual.children.find((c) => c.label === 'playerRing');

            if (inFullDarkness && body) {
                body.clear();
                body.circle(0, 0, unit.radius);
                body.fill({ color: 0xef4444 });
                body.stroke({ color: 0xef4444, width: 1 });
                if (isDebugOutlined) {
                    body.stroke({ color: 0xfacc15, width: 3 });
                    body.circle(0, 0, unit.radius + 4);
                    body.stroke({ color: 0xfacc15, width: 2 });
                }
                if (hpBg) hpBg.visible = false;
                if (hpFill) hpFill.visible = false;
                if (characterSprite) characterSprite.visible = false;
                const darkTint = visual.children.find((c) => c.label === 'darkCreatureIconTint');
                if (darkTint) darkTint.visible = false;
                if (label) label.visible = false;
                if (glow) glow.visible = false;
                if (playerRing) playerRing.visible = false;
            } else {
                if (body) {
                    body.clear();
                    body.circle(0, 0, unit.radius);
                    body.fill(getBodyColorForUnit(unit));
                    body.stroke({ color: 0x000000, width: 1 });
                    if (isDebugOutlined) {
                        body.stroke({ color: 0xfacc15, width: 3 });
                        body.circle(0, 0, unit.radius + 4);
                        body.stroke({ color: 0xfacc15, width: 2 });
                    }
                }
                const showHpBar = !unit.isInvincible() && !unit.tags.includes(UnitTag.Boss) && !unit.isSpawning();
                if (hpBg) hpBg.visible = showHpBar;
                if (hpFill) hpFill.visible = showHpBar;
                if (characterSprite) characterSprite.visible = true;
                const darkTint = visual.children.find((c) => c.label === 'darkCreatureIconTint');
                if (darkTint) darkTint.visible = true;
                if (label) label.visible = true;
                if (glow) glow.visible = true;
                if (playerRing) playerRing.visible = true;
                if (showHpBar) updateUnitHpBar(visual, unit);
            }

            // Darkness corruption bar
            let corruptionBar = visual.children.find((c) => c.label === 'corruptionBar') as Graphics | undefined;
            if (unit.corruptionProgress > 0) {
                if (!corruptionBar) {
                    corruptionBar = new Graphics();
                    corruptionBar.label = 'corruptionBar';
                    visual.addChild(corruptionBar);
                }
                corruptionBar.visible = true;
                corruptionBar.clear();
                const w = 24;
                const h = 4;
                const y = -unit.radius - 14;
                corruptionBar.rect(-w / 2, y, w, h);
                corruptionBar.fill({ color: 0x332244 });
                corruptionBar.rect(-w / 2, y, w * unit.corruptionProgress, h);
                corruptionBar.fill({ color: 0x663399 });
                corruptionBar.rect(-w / 2, y, w, h);
                corruptionBar.stroke({ color: 0x9966cc, width: 1 });
            } else {
                if (corruptionBar) corruptionBar.visible = false;
            }

            // Crystal corruption bar
            let crystalCorruptBar = visual.children.find((c) => c.label === 'crystalCorruptBar') as Graphics | undefined;
            if (unit.crystalCorruptionProgress > 0) {
                if (!crystalCorruptBar) {
                    crystalCorruptBar = new Graphics();
                    crystalCorruptBar.label = 'crystalCorruptBar';
                    visual.addChild(crystalCorruptBar);
                }
                crystalCorruptBar.visible = true;
                crystalCorruptBar.clear();
                const w = 24;
                const h = 4;
                const y = -unit.radius - 20;
                crystalCorruptBar.rect(-w / 2, y, w, h);
                crystalCorruptBar.fill({ color: 0x332244 });
                crystalCorruptBar.rect(-w / 2, y, w * unit.crystalCorruptionProgress, h);
                crystalCorruptBar.fill({ color: 0x663399 });
                crystalCorruptBar.rect(-w / 2, y, w, h);
                crystalCorruptBar.stroke({ color: 0x9966cc, width: 1 });
            } else {
                if (crystalCorruptBar) crystalCorruptBar.visible = false;
            }

            // Buff effects (e.g. stunned stars)
            let buffEffects = visual.children.find((c) => c.label === 'buffEffects') as Graphics | undefined;
            if (unit.buffs.length > 0 && !inFullDarkness) {
                if (!buffEffects) {
                    buffEffects = new Graphics();
                    buffEffects.label = 'buffEffects';
                    visual.addChild(buffEffects);
                }
                buffEffects.visible = true;
                buffEffects.clear();
                const buffCtx = { gameTime };
                for (const buff of unit.buffs) {
                    const renderer = getBuffVisualRenderer(buff._type);
                    renderer(buffEffects, unit, buff, buffCtx);
                }
            } else {
                if (buffEffects) buffEffects.visible = false;
            }

            // Lanternite nest spawn progress arc
            if (unit.characterId === 'lanternite_nest') {
                let nestSpawnArc = visual.children.find((c) => c.label === 'nestSpawnArc') as Graphics | undefined;
                const nestCfg = unit.lanterniteState.nestConfig;
                const nestState = unit.lanterniteState.nestSpawnState;
                const showArc = nestCfg != null && nestState != null
                    && nestState.spawnedIds.length < nestCfg.maxLanternites
                    && gameTime < nestState.nextSpawnAtGameTime;
                if (showArc) {
                    if (!nestSpawnArc) {
                        nestSpawnArc = new Graphics();
                        nestSpawnArc.label = 'nestSpawnArc';
                        visual.addChild(nestSpawnArc);
                    }
                    nestSpawnArc.visible = true;
                    const arcR = unit.radius + 8;
                    const remaining = nestState!.nextSpawnAtGameTime - gameTime;
                    const arcProgress = Math.min(1, Math.max(0, 1 - remaining / Math.max(0.1, nestCfg!.spawnIntervalSec)));
                    const startAngle = -Math.PI / 2;
                    nestSpawnArc.clear();
                    nestSpawnArc.arc(0, 0, arcR, 0, Math.PI * 2);
                    nestSpawnArc.stroke({ color: 0x064e3b, width: 2, alpha: 0.5 });
                    if (arcProgress > 0.01) {
                        nestSpawnArc.arc(0, 0, arcR, startAngle, startAngle + arcProgress * Math.PI * 2);
                        nestSpawnArc.stroke({ color: 0x34d399, width: 2 });
                    }
                } else {
                    if (nestSpawnArc) nestSpawnArc.visible = false;
                }
            }

        }
    }

    private renderConstructionGhosts(engine: GameEngine): void {
        const activeScoutIds = new Set<string>();
        const nestRadius = 26;

        for (const unit of engine.units) {
            if (!unit.isAlive()) continue;
            if (unit.lanterniteState.constructionCompleteAtGameTime == null) continue;
            const targetPos = unit.lanterniteState.patrolFarWorld;
            if (!targetPos) continue;

            activeScoutIds.add(unit.id);

            const totalSec = unit.lanterniteState.nestConfig?.scoutConstructionSec ?? 10;
            const remaining = Math.max(0, unit.lanterniteState.constructionCompleteAtGameTime - engine.gameTime);
            const progress = Math.min(1, Math.max(0, 1 - remaining / totalSec));

            let ghost = this.constructionGhostVisuals.get(unit.id);
            if (!ghost) {
                ghost = new Container();
                ghost.label = 'constructionGhost';

                const lanterniteNestTexture = this.assets.getCharacterTexture('lanternite_nest');
                const nestSprite = new Sprite(lanterniteNestTexture ?? Texture.EMPTY);
                nestSprite.label = 'ghostNestSprite';
                nestSprite.anchor.set(0.5, 0.5);
                const spriteSize = nestRadius * 2 * CHARACTER_SPRITE_SCALE;
                nestSprite.width = spriteSize;
                nestSprite.height = spriteSize;
                nestSprite.alpha = 0.3;
                ghost.addChild(nestSprite);

                const arcG = new Graphics();
                arcG.label = 'constructionArc';
                ghost.addChild(arcG);

                ghost.zIndex = Z_UNITS - 1;
                this.gameContainer.addChild(ghost);
                this.constructionGhostVisuals.set(unit.id, ghost);
            }

            ghost.visible = true;
            ghost.x = targetPos.x;
            ghost.y = targetPos.y;

            // Sync texture in case it loaded after the ghost was created
            const lanterniteNestTexture = this.assets.getCharacterTexture('lanternite_nest');
            const nestSprite = ghost.children.find((c) => c.label === 'ghostNestSprite') as Sprite | undefined;
            if (nestSprite && lanterniteNestTexture && nestSprite.texture !== lanterniteNestTexture) {
                nestSprite.texture = lanterniteNestTexture;
            }

            const arcG = ghost.children.find((c) => c.label === 'constructionArc') as Graphics | undefined;
            if (arcG) {
                arcG.clear();
                const arcRadius = nestRadius + 8;
                const startAngle = -Math.PI / 2;

                arcG.arc(0, 0, arcRadius, 0, Math.PI * 2);
                arcG.stroke({ color: 0x064e3b, width: 3, alpha: 0.5 });

                if (progress > 0.01) {
                    arcG.arc(0, 0, arcRadius, startAngle, startAngle + progress * Math.PI * 2);
                    arcG.stroke({ color: 0x34d399, width: 3 });
                }
            }
        }

        for (const [id, ghost] of this.constructionGhostVisuals) {
            if (!activeScoutIds.has(id)) {
                this.gameContainer.removeChild(ghost);
                ghost.destroy();
                this.constructionGhostVisuals.delete(id);
            }
        }
    }

    private startHitFlash(unitId: string, container: Container, radius: number): void {
        const existing = this.hitFlashState.get(unitId);
        if (existing) {
            cancelAnimationFrame(existing.rafId);
        }

        let hitFlash = container.children.find((c) => c.label === 'hitFlash') as Graphics | undefined;
        if (!hitFlash) {
            hitFlash = new Graphics();
            hitFlash.label = 'hitFlash';
            hitFlash.eventMode = 'none';
            container.addChild(hitFlash);
        }
        hitFlash.visible = true;

        const startTime = Date.now();
        this.hitFlashState.set(unitId, { startTime, rafId: 0 });

        const tick = (): void => {
            const state = this.hitFlashState.get(unitId);
            if (!state) return;
            const elapsed = (Date.now() - state.startTime) / 1000;
            if (elapsed >= HIT_FLASH_DURATION) {
                this.hitFlashState.delete(unitId);
                hitFlash!.visible = false;
                hitFlash!.clear();
                return;
            }
            const alpha = elapsed < HIT_FLASH_DURATION / 2
                ? (elapsed / (HIT_FLASH_DURATION / 2))
                : (1 - (elapsed - HIT_FLASH_DURATION / 2) / (HIT_FLASH_DURATION / 2));
            hitFlash!.clear();
            hitFlash!.circle(0, 0, radius);
            hitFlash!.fill({ color: 0xff0000, alpha: 1 });
            hitFlash!.alpha = alpha;
            state.rafId = requestAnimationFrame(tick);
        };
        const state = this.hitFlashState.get(unitId)!;
        state.rafId = requestAnimationFrame(tick);
    }

    private cleanup(engine: GameEngine): void {
        const activeUnitIds = new Set(engine.units.map((u) => u.id));

        for (const [id, visual] of this.unitVisuals) {
            if (!activeUnitIds.has(id)) {
                this.gameContainer.removeChild(visual);
                visual.destroy();
                this.unitVisuals.delete(id);
            }
        }

        for (const [id, shadow] of this.knockbackShadowVisuals) {
            if (!activeUnitIds.has(id)) {
                this.gameContainer.removeChild(shadow);
                shadow.destroy();
                this.knockbackShadowVisuals.delete(id);
            }
        }
    }

    destroy(): void {
        this.clearHitFlashes();
        for (const visual of this.unitVisuals.values()) visual.destroy();
        this.unitVisuals.clear();
        for (const shadow of this.knockbackShadowVisuals.values()) shadow.destroy();
        this.knockbackShadowVisuals.clear();
        for (const ghost of this.constructionGhostVisuals.values()) ghost.destroy();
        this.constructionGhostVisuals.clear();
    }
}
