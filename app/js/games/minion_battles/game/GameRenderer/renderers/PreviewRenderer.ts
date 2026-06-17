import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { DarknessLevel } from '../../darknessLevels';
import type { GameEngine } from '../../GameEngine';
import type { Unit } from '../../units/Unit';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getSelectTargetDefsFromTimings, filterSelectTargetCandidates, renderMeleeTrackingHighlights } from '../../../abilities/targeting';
import { areEnemies } from '../../teams';
import type { TeamId } from '../../teams';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import type { AssetRegistry } from '../AssetRegistry';
import type { OverlayRenderer } from './OverlayRenderer';
import type { AbilityStatic, AbilityTelegraph, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { asTelegraphPayload } from '../../../abilities/telegraphTracking';
import type { ResolvedTarget, GhostPlanData, ActiveAbility } from '../../types';

const MOVE_TARGET_COLOR = 0x333333;
const MOVE_TARGET_PATH_BG_COLOR = 0xffffff;
const GHOST_PREVIEW_LAYER_ALPHA = 0.5;
const GHOST_PLAN_LAYER_ALPHA = 0.3;

const Z_MOVE_TARGETS = 7;
const Z_GHOST_PREVIEW = 8;
const Z_GHOST_PLAN_PREVIEW = 9;
const Z_ABILITY_PREVIEW = 100;
const Z_TARGETING_PREVIEW = 101;

export class PreviewRenderer {
    private moveTargetVisuals: Map<string, Graphics> = new Map();
    private abilityPreviewGraphics: Graphics = new Graphics();
    private targetingPreviewGraphics: Graphics = new Graphics();
    private ghostPreviewGraphics: Graphics = new Graphics();
    private ghostPlanPreviewGraphics: Graphics = new Graphics();

    constructor(
        private readonly gameContainer: Container,
        private readonly _assets: AssetRegistry,
        private readonly overlayRenderer: OverlayRenderer,
    ) {
        this.abilityPreviewGraphics.zIndex = Z_ABILITY_PREVIEW;
        this.gameContainer.addChild(this.abilityPreviewGraphics);
        this.targetingPreviewGraphics.zIndex = Z_TARGETING_PREVIEW;
        this.gameContainer.addChild(this.targetingPreviewGraphics);
        this.ghostPreviewGraphics.zIndex = Z_GHOST_PREVIEW;
        this.gameContainer.addChild(this.ghostPreviewGraphics);
        this.ghostPlanPreviewGraphics.zIndex = Z_GHOST_PLAN_PREVIEW;
        this.gameContainer.addChild(this.ghostPlanPreviewGraphics);
    }

    setLayerVisible(visible: boolean): void {
        if (visible) return;
        this.abilityPreviewGraphics.visible = false;
        this.targetingPreviewGraphics.visible = false;
        this.ghostPreviewGraphics.visible = false;
        this.ghostPlanPreviewGraphics.visible = false;
        for (const visual of this.moveTargetVisuals.values()) {
            visual.visible = false;
        }
    }

    render(
        engine: GameEngine,
        localTeamId: TeamId,
        targetingState: {
            selectedAbility: AbilityStatic | null;
            currentTargets: ResolvedTarget[];
            mouseWorld: { x: number; y: number };
            waitingForOrders: { unitId?: string } | null;
            previewOrderUnitId?: string | null;
            ghostPlans?: Record<string, GhostPlanData>;
        } | null,
    ): void {
        this.renderMoveTargets(engine.units, localTeamId);
        this.renderGhostPreviews(engine, localTeamId);
        this.renderActiveAbilityPreviews(engine, localTeamId);
        this.renderGhostPlanPreviews(engine, targetingState?.ghostPlans ?? {});
        this.renderTargetingPreview(engine, targetingState);
    }

    private renderMoveTargets(units: Unit[], localTeamId: TeamId): void {
        const activeIds = new Set<string>();

        for (const unit of units) {
            if (!unit.active || !unit.movement || unit.movement.path.length === 0) continue;
            if (!unit.isPlayerControlled() || areEnemies(localTeamId, unit.teamId)) continue;

            const key = `mt_${unit.id}`;
            activeIds.add(key);

            let visual = this.moveTargetVisuals.get(key);
            if (!visual) {
                visual = new Graphics();
                visual.zIndex = Z_MOVE_TARGETS;
                this.moveTargetVisuals.set(key, visual);
                this.gameContainer.addChild(visual);
            }

            visual.clear();
            visual.visible = true;
            visual.x = 0;
            visual.y = 0;

            let pursuitTarget: { x: number; y: number; circleRadius: number } | undefined;
            if (unit.movement.targetUnitId) {
                const target = units.find((u) => u.id === unit.movement!.targetUnitId);
                if (target?.isAlive()) {
                    pursuitTarget = {
                        x: target.x,
                        y: target.y,
                        circleRadius: target.radius + 6,
                    };
                }
            }

            const pixelTarget = unit.movement.targetPixel;

            this.drawPlayerMoveTargetPathWithCap(visual, unit.x, unit.y, unit.movement.path, pursuitTarget, pixelTarget);
        }

        for (const [key, visual] of this.moveTargetVisuals) {
            if (!activeIds.has(key)) {
                visual.visible = false;
            }
        }
    }

    private drawPlayerMoveTargetPathWithCap(
        g: Graphics,
        originX: number,
        originY: number,
        path: { col: number; row: number }[],
        pursuitTarget?: { x: number; y: number; circleRadius: number },
        pixelTarget?: { x: number; y: number },
    ): void {
        // For pursuit/pixel-target modes the line ends at the target's actual position; skip the
        // last grid-cell centre so we don't add a redundant waypoint very close to the target.
        const hasOverrideTarget = pursuitTarget != null || pixelTarget != null;
        const innerPath = hasOverrideTarget ? path.slice(0, -1) : path;
        const lastCell = path[path.length - 1]!;
        const destX = pursuitTarget ? pursuitTarget.x
            : pixelTarget ? pixelTarget.x
            : lastCell.col * CELL_SIZE + CELL_SIZE / 2;
        const destY = pursuitTarget ? pursuitTarget.y
            : pixelTarget ? pixelTarget.y
            : lastCell.row * CELL_SIZE + CELL_SIZE / 2;

        // For pursuit: end the line at the circle edge, not the target's centre.
        let lineEndX = destX;
        let lineEndY = destY;
        if (pursuitTarget) {
            const prevX = innerPath.length > 0
                ? innerPath[innerPath.length - 1]!.col * CELL_SIZE + CELL_SIZE / 2
                : originX;
            const prevY = innerPath.length > 0
                ? innerPath[innerPath.length - 1]!.row * CELL_SIZE + CELL_SIZE / 2
                : originY;
            const ldx = destX - prevX;
            const ldy = destY - prevY;
            const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
            if (ldist > pursuitTarget.circleRadius) {
                lineEndX = destX - (ldx / ldist) * pursuitTarget.circleRadius;
                lineEndY = destY - (ldy / ldist) * pursuitTarget.circleRadius;
            } else {
                lineEndX = originX;
                lineEndY = originY;
            }
        }

        for (const [color, width, alpha] of [
            [MOVE_TARGET_PATH_BG_COLOR, 3, 0.7],
            [MOVE_TARGET_COLOR, 2, 1],
        ] as [number, number, number][]) {
            g.moveTo(originX, originY);
            for (const cell of innerPath) {
                g.lineTo(cell.col * CELL_SIZE + CELL_SIZE / 2, cell.row * CELL_SIZE + CELL_SIZE / 2);
            }
            g.lineTo(lineEndX, lineEndY);
            g.stroke({ color, width, alpha });
        }

        if (pursuitTarget) {
            g.circle(destX, destY, pursuitTarget.circleRadius);
            g.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 3, alpha: 0.7 });
            g.circle(destX, destY, pursuitTarget.circleRadius);
            g.stroke({ color: MOVE_TARGET_COLOR, width: 2 });
        } else {
            // Normal tile target and CTRL pixel target both use the dot cap.
            g.circle(destX, destY, 8);
            g.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 3, alpha: 0.7 });
            g.circle(destX, destY, 8);
            g.stroke({ color: MOVE_TARGET_COLOR, width: 2, alpha: 1 });
            g.circle(destX, destY, 2);
            g.fill({ color: MOVE_TARGET_PATH_BG_COLOR, alpha: 0.7 });
            g.circle(destX, destY, 2);
            g.fill({ color: MOVE_TARGET_COLOR, alpha: 1 });
        }
    }

    private renderGhostPreviews(engine: GameEngine, localTeamId: TeamId): void {
        this.ghostPreviewGraphics.clear();
        this.ghostPreviewGraphics.x = 0;
        this.ghostPreviewGraphics.y = 0;
        this.ghostPreviewGraphics.alpha = GHOST_PREVIEW_LAYER_ALPHA;

        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive()) continue;
            if (!unit.movement || unit.movement.path.length === 0) continue;
            if (!areEnemies(localTeamId, unit.teamId)) continue;
            if (this.enemyUnitHiddenInFullDarkness(unit, localTeamId)) continue;
            this.drawEnemyGhostMovePath(this.ghostPreviewGraphics, unit.x, unit.y, unit.movement.path);
        }

        const batch = engine.waitingForOrders;
        if (!batch) return;

        const previewGr = this.ghostPreviewGraphics as unknown as import('../../../abilities/Ability').IAbilityPreviewGraphics;

        for (const entry of engine.pendingOrders) {
            if (entry.gameTick !== batch.atTick) continue;
            const unit = engine.getUnit(entry.order.unitId);
            if (!unit?.active || !unit.isAlive()) continue;

            const path = entry.order.movePath;
            if (path && path.length > 0) {
                if (areEnemies(localTeamId, unit.teamId)) {
                    if (!this.enemyUnitHiddenInFullDarkness(unit, localTeamId)) {
                        this.drawEnemyGhostMovePath(this.ghostPreviewGraphics, unit.x, unit.y, path);
                    }
                } else {
                    this.drawPlayerMoveTargetPathWithCap(this.ghostPreviewGraphics, unit.x, unit.y, path);
                }
            }

            const abilityId = entry.order.abilityId;
            if (abilityId === 'wait') continue;

            const ability = getAbility(abilityId);
            if (!ability) continue;
            if (areEnemies(localTeamId, unit.teamId) && this.enemyUnitHiddenInFullDarkness(unit, localTeamId)) continue;

            const mouseWorld = this.mouseWorldForGhostAbilityPreview(entry.order.targets, engine, unit.x, unit.y);

            const selectTargetDefs = getSelectTargetDefsFromTimings(ability);
            if (selectTargetDefs.length > 0) {
                for (let i = 0; i < selectTargetDefs.length; i++) {
                    const selectDef = selectTargetDefs[i]!;
                    const target = entry.order.targets[i];
                    if (!target) continue;
                    const targetPos = target.type === 'unit' && target.unitId
                        ? (() => { const u = engine.getUnit(target.unitId!); return u ? { x: u.x, y: u.y } : null; })()
                        : (target.type === 'pixel' && target.position ? target.position : null);
                    if (!targetPos) continue;
                    selectDef.hitbox.renderTargetingPreview(previewGr, unit, targetPos, engine.units);
                }
                continue;
            }

            if (!ability.renderTargetingPreview) continue;
            ability.renderTargetingPreview(previewGr, unit, entry.order.targets, mouseWorld, engine.units, engine);
            if (ability.renderTargetingPreviewSelectedTargets) {
                ability.renderTargetingPreviewSelectedTargets(previewGr, unit, entry.order.targets, mouseWorld, engine.units, engine);
            }
        }
    }

    private drawEnemyGhostMovePath(
        g: Graphics,
        originX: number,
        originY: number,
        path: { col: number; row: number }[],
    ): void {
        const cs = CELL_SIZE;
        const center = (col: number, row: number) => ({ x: col * cs + cs / 2, y: row * cs + cs / 2 });

        const n = path.length;
        if (n === 0) return;

        const solidCellCount = Math.min(2, n);
        g.moveTo(originX, originY);
        for (let i = 0; i < solidCellCount; i++) {
            const p = center(path[i]!.col, path[i]!.row);
            g.lineTo(p.x, p.y);
        }
        g.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 3, alpha: 0.7 });

        g.moveTo(originX, originY);
        for (let i = 0; i < solidCellCount; i++) {
            const p = center(path[i]!.col, path[i]!.row);
            g.lineTo(p.x, p.y);
        }
        g.stroke({ color: MOVE_TARGET_COLOR, width: 2 });

        if (n < 3) return;

        const tailPoints: { x: number; y: number }[] = [];
        for (let i = 1; i < n; i++) {
            tailPoints.push(center(path[i]!.col, path[i]!.row));
        }

        let totalLen = 0;
        const segLens: number[] = [];
        for (let i = 0; i < tailPoints.length - 1; i++) {
            const a = tailPoints[i]!;
            const b = tailPoints[i + 1]!;
            const L = Math.hypot(b.x - a.x, b.y - a.y);
            segLens.push(L);
            totalLen += L;
        }
        if (totalLen <= 0) return;

        let traveled = 0;
        for (let i = 0; i < tailPoints.length - 1; i++) {
            const a = tailPoints[i]!;
            const b = tailPoints[i + 1]!;
            const len = segLens[i] ?? 0;
            const steps = Math.max(3, Math.ceil(len / 8));
            for (let s = 0; s < steps; s++) {
                const t0 = s / steps;
                const t1 = (s + 1) / steps;
                const mx0 = a.x + (b.x - a.x) * t0;
                const my0 = a.y + (b.y - a.y) * t0;
                const mx1 = a.x + (b.x - a.x) * t1;
                const my1 = a.y + (b.y - a.y) * t1;
                const midTravel = traveled + len * ((t0 + t1) / 2);
                const alphaTail = 0.88 * (1 - midTravel / totalLen) + 0.05;
                g.moveTo(mx0, my0);
                g.lineTo(mx1, my1);
                g.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 4, alpha: alphaTail * 0.65 });
                g.moveTo(mx0, my0);
                g.lineTo(mx1, my1);
                g.stroke({ color: MOVE_TARGET_COLOR, width: 2, alpha: alphaTail });
            }
            traveled += len;
        }
    }

    private renderActiveAbilityPreviews(engine: GameEngine, localTeamId: TeamId): void {
        this.abilityPreviewGraphics.clear();
        for (const unit of engine.units) {
            if (!unit.isAlive()) continue;
            if (areEnemies(localTeamId, unit.teamId) && this.overlayRenderer.isLightSystemActive()) {
                const col = Math.floor(unit.x / CELL_SIZE);
                const row = Math.floor(unit.y / CELL_SIZE);
                const light = this.overlayRenderer.getLightAt(col, row);
                if (light !== null && light <= DarknessLevel.FULL_DARKNESS) continue;
            }
            for (const active of unit.activeAbilities) {
                const ability = getAbility(active.abilityId);
                if (!ability) continue;
                const gr = this.abilityPreviewGraphics as unknown as IAbilityPreviewGraphics;
                if (ability.renderActivePreview) {
                    ability.renderActivePreview(gr, unit, active, engine.gameTime);
                } else if (ability.telegraph) {
                    this.renderTelegraphPreview(gr, ability.telegraph, ability.prefireTime, unit, active, engine.gameTime);
                }
            }
        }
    }

    private renderTelegraphPreview(
        gr: IAbilityPreviewGraphics,
        telegraph: AbilityTelegraph,
        prefireTime: number,
        caster: Unit,
        active: ActiveAbility,
        gameTime: number,
    ): void {
        const payload = asTelegraphPayload(active.castPayload);
        if (payload == null) return;
        const targetX = payload.telegraphTargetX;
        const targetY = payload.telegraphTargetY;

        const elapsed = gameTime - active.startTime;
        const progress = prefireTime > 0 ? Math.min(1, elapsed / prefireTime) : 1;
        const circleRadius = telegraph.startRadius * (1 - progress);

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(targetX, targetY);
        gr.stroke({ color: telegraph.color, width: 2, alpha: 0.75 });

        if (circleRadius > 0.5) {
            gr.circle(targetX, targetY, circleRadius);
            gr.stroke({ color: telegraph.color, width: 2, alpha: 0.8 });
        }
    }

    private renderTargetingPreview(
        engine: GameEngine,
        targetingState: {
            selectedAbility: AbilityStatic | null;
            currentTargets: ResolvedTarget[];
            mouseWorld: { x: number; y: number };
            waitingForOrders: { unitId?: string } | null;
            previewOrderUnitId?: string | null;
        } | null,
    ): void {
        const ts = targetingState;
        if (!ts) {
            this.targetingPreviewGraphics.clear();
            return;
        }
        const ability = ts.selectedAbility;
        const previewUnitId = ts.previewOrderUnitId ?? ts.waitingForOrders?.unitId;
        if (!ability || !previewUnitId) {
            this.targetingPreviewGraphics.clear();
            return;
        }

        const caster = engine.getUnit(previewUnitId);
        if (!caster) {
            this.targetingPreviewGraphics.clear();
            return;
        }

        this.targetingPreviewGraphics.clear();
        const gr = this.targetingPreviewGraphics as unknown as import('../../../abilities/Ability').IAbilityPreviewGraphics;

        const selectTargetDefs = getSelectTargetDefsFromTimings(ability);
        if (selectTargetDefs.length > 0) {
            const targetIndex = ts.currentTargets.length;
            const selectDef = selectTargetDefs[targetIndex];
            if (selectDef) {
                const rawCandidates = selectDef.hitbox.renderTargetingPreview(gr, caster, ts.mouseWorld, engine.units);
                const candidates = filterSelectTargetCandidates(rawCandidates, caster, selectDef.filter);
                if (candidates.length > 0) {
                    const mw = ts.mouseWorld;
                    candidates.sort((a, b) =>
                        (a.x - mw.x) ** 2 + (a.y - mw.y) ** 2 - ((b.x - mw.x) ** 2 + (b.y - mw.y) ** 2),
                    );
                    const maxHighlights = selectDef.numTargets ?? selectDef.hitbox.numTargets;
                    renderMeleeTrackingHighlights(gr, candidates.slice(0, maxHighlights));
                }
            }
            if (ability.renderTargetingPreviewSelectedTargets) {
                ability.renderTargetingPreviewSelectedTargets(gr, caster, ts.currentTargets, ts.mouseWorld, engine.units, engine);
            }
            return;
        }

        if (!ability.renderTargetingPreview) return;
        ability.renderTargetingPreview(gr, caster, ts.currentTargets, ts.mouseWorld, engine.units, engine);
        if (ability.renderTargetingPreviewSelectedTargets) {
            ability.renderTargetingPreviewSelectedTargets(gr, caster, ts.currentTargets, ts.mouseWorld, engine.units, engine);
        }
    }

    private enemyUnitHiddenInFullDarkness(unit: Unit, localTeamId: TeamId): boolean {
        if (!areEnemies(localTeamId, unit.teamId) || !this.overlayRenderer.isLightSystemActive()) return false;
        const col = Math.floor(unit.x / CELL_SIZE);
        const row = Math.floor(unit.y / CELL_SIZE);
        const light = this.overlayRenderer.getLightAt(col, row);
        return light !== null && light <= DarknessLevel.FULL_DARKNESS;
    }

    private mouseWorldForGhostAbilityPreview(
        targets: ResolvedTarget[],
        engine: GameEngine,
        fallbackX: number,
        fallbackY: number,
    ): { x: number; y: number } {
        for (const t of targets) {
            if (t.type === 'pixel' && t.position) return { x: t.position.x, y: t.position.y };
            if (t.type === 'unit' && t.unitId) {
                const u = engine.getUnit(t.unitId);
                if (u) return { x: u.x, y: u.y };
            }
        }
        return { x: fallbackX, y: fallbackY };
    }

    private renderGhostPlanPreviews(engine: GameEngine, ghostPlans: Record<string, GhostPlanData>): void {
        this.ghostPlanPreviewGraphics.clear();
        this.ghostPlanPreviewGraphics.alpha = GHOST_PLAN_LAYER_ALPHA;

        const plans = Object.values(ghostPlans);
        const gr = this.ghostPlanPreviewGraphics as unknown as import('../../../abilities/Ability').IAbilityPreviewGraphics;

        for (const plan of plans) {
            const caster = engine.getUnit(plan.unitId);
            if (!caster?.active || !caster.isAlive()) continue;

            const ability = getAbility(plan.abilityId);
            if (!ability) continue;

            const selectTargetDefs = getSelectTargetDefsFromTimings(ability);
            if (selectTargetDefs.length > 0) {
                // Render hitboxes for already-committed targets
                for (let i = 0; i < plan.currentTargets.length; i++) {
                    const selectDef = selectTargetDefs[i];
                    if (!selectDef) break;
                    const target = plan.currentTargets[i]!;
                    const pos =
                        target.type === 'unit' && target.unitId
                            ? (() => { const u = engine.getUnit(target.unitId!); return u ? { x: u.x, y: u.y } : null; })()
                            : target.type === 'pixel' && target.position
                              ? target.position
                              : null;
                    if (!pos) continue;
                    selectDef.hitbox.renderTargetingPreview(gr, caster, pos, engine.units);
                }
                // Render in-progress cursor for the next un-confirmed target (mirrors live targeting)
                const nextSelectDef = selectTargetDefs[plan.currentTargets.length];
                if (nextSelectDef) {
                    nextSelectDef.hitbox.renderTargetingPreview(gr, caster, plan.mouseWorld, engine.units);
                }
                if (ability.renderTargetingPreviewSelectedTargets) {
                    ability.renderTargetingPreviewSelectedTargets(gr, caster, plan.currentTargets, plan.mouseWorld, engine.units, engine);
                }
                continue;
            }

            if (!ability.renderTargetingPreview) continue;
            ability.renderTargetingPreview(gr, caster, plan.currentTargets, plan.mouseWorld, engine.units, engine);
            if (ability.renderTargetingPreviewSelectedTargets) {
                ability.renderTargetingPreviewSelectedTargets(gr, caster, plan.currentTargets, plan.mouseWorld, engine.units, engine);
            }
        }
    }

    destroy(): void {
        this.abilityPreviewGraphics.destroy();
        this.targetingPreviewGraphics.destroy();
        this.ghostPreviewGraphics.destroy();
        this.ghostPlanPreviewGraphics.destroy();
        for (const visual of this.moveTargetVisuals.values()) visual.destroy();
        this.moveTargetVisuals.clear();
    }
}
