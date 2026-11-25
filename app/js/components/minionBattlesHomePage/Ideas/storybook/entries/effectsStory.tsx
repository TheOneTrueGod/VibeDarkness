import { useEffect, useRef, type ReactNode } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { Unit } from '../../../../../games/minion_battles/game/units/Unit';
import { EventBus } from '../../../../../games/minion_battles/game/EventBus';
import type { EngineContext } from '../../../../../games/minion_battles/game/EngineContext';
import { DarknessLevel } from '../../../../../games/minion_battles/game/darknessLevels';
import { renderUnit, type IUnitRenderContext } from '../../../../../games/minion_battles/game/units/unit_defs/unitDef';
import { syncDarknessNeedles } from '../../../../../games/minion_battles/game/GameRenderer/renderers/darknessNeedleVisual';
import {
    DARKNESS_CORRUPTION_LOOKS,
    type DarknessCorruptionLook,
} from '../../../../../games/minion_battles/game/units/darknessCorruptionLook';
import { createDamageTakenEffect } from '../../../../../games/minion_battles/game/createDamageTakenEffect';
import type { Effect } from '../../../../../games/minion_battles/game/effects/Effect';
import {
    createEffectVisual,
    updateEffectVisual,
} from '../../../../../games/minion_battles/game/effect_defs';
import type { IEffectRenderContext } from '../../../../../games/minion_battles/game/effect_defs/types';
import {
    createSpellCircleEffect,
    listSpellCircleStyles,
} from '../../../../../games/minion_battles/game/spellCircles/spellCircles';
import {
    controlBoolean,
    controlString,
    type StorybookControlValues,
    type StorybookEntry,
    type StorybookSetValue,
} from '../storybookTypes';

type LookId = keyof typeof DARKNESS_CORRUPTION_LOOKS;
const LOOK_IDS = Object.keys(DARKNESS_CORRUPTION_LOOKS) as LookId[];
const SPELL_CIRCLE_STYLE_IDS = listSpellCircleStyles().map((s) => s.id);

/** The battle camera's closest and farthest zoom (`Camera.ZOOM_LEVELS`). */
const VIEWS = [
    { zoom: 2, label: 'Zoom 2.0 · closest', far: false },
    { zoom: 0.5, label: 'Zoom 0.5 · farthest', far: true },
] as const;
const VIEW_PX = 280;

/** Neighbours in the far view, so an effect is judged next to other units. */
const FAR_NEIGHBOURS = [
    { x: -95, y: 62, characterId: 'player', ownerId: 'p2', teamId: 'player' },
    { x: 112, y: -48, characterId: 'player', ownerId: 'p3', teamId: 'player' },
    { x: 70, y: 125, characterId: 'target_dummy', ownerId: 'ai', teamId: 'enemy' },
    { x: -150, y: -92, characterId: 'target_dummy', ownerId: 'ai', teamId: 'enemy' },
] as const;

function makeUnit(id: string, characterId: string, ownerId: string, teamId: string, x = 0, y = 0): Unit {
    return new Unit({ id, x, y, hp: 1000, maxHp: 1000, speed: 100, teamId, ownerId, characterId, name: id } as ConstructorParameters<typeof Unit>[0]);
}

const UNIT_RENDER_CONTEXT: IUnitRenderContext = {
    localTeamId: 'player',
    getCharacterTexture: () => null,
    getPlayerPortraitTexture: () => null,
};
const EFFECT_RENDER_CONTEXT: IEffectRenderContext = { getEffectTexture: () => null };

/**
 * What a preview plays on the stage: one hero at the centre, effects it spawns into `effects`, and a hook to
 * draw on the hero's own visual. The stage advances effects on wall time unless paused (spell circles and
 * other world-time effects hold at a pause), and removes them when they finish.
 */
interface EffectScene {
    hero: Unit;
    effects: Effect[];
    /** Advance world state. Called every frame; `paused` mirrors the Paused control. */
    tick(dt: number, paused: boolean): void;
    /** Draw on the hero's visual (e.g. the darkness ring). `wallSeconds` keeps running while paused. */
    decorateHero?(heroVisual: Container, wallSeconds: number): void;
}

/**
 * The real battle renderers in a small Pixi stage: the hero (and, in the far view, a few neighbours) drawn by
 * `renderUnit`, plus the scene's effects drawn by their registered effect defs, at zoom 2.0 and 0.5.
 * `makeScene` runs once per mount; read live control values through a ref inside it.
 */
function EffectStage({ makeScene, isPaused }: { makeScene: () => EffectScene; isPaused: () => boolean }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const argsRef = useRef({ makeScene, isPaused });
    argsRef.current = { makeScene, isPaused };

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.borderRadius = '6px';
        host.appendChild(canvas);
        const app = new Application();
        let cancelled = false;
        let rafId = 0;

        void app
            .init({
                canvas,
                width: VIEW_PX * VIEWS.length + 12 * (VIEWS.length - 1),
                height: VIEW_PX,
                backgroundAlpha: 0,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
                autoStart: false,
            })
            .then(() => {
                if (cancelled) {
                    app.destroy();
                    canvas.remove();
                    return;
                }
                const scene = argsRef.current.makeScene();
                const { hero, effects } = scene;

                const views = VIEWS.map((view, i) => {
                    const root = new Container();
                    root.x = i * (VIEW_PX + 12);
                    const ground = new Graphics();
                    ground.roundRect(0, 0, VIEW_PX, VIEW_PX, 6);
                    ground.fill({ color: 0x0a090e });
                    root.addChild(ground);
                    const world = new Container();
                    world.position.set(VIEW_PX / 2, VIEW_PX / 2);
                    world.scale.set(view.zoom);
                    root.addChild(world);
                    const mask = new Graphics();
                    mask.roundRect(0, 0, VIEW_PX, VIEW_PX, 6);
                    mask.fill({ color: 0xffffff });
                    root.addChild(mask);
                    world.mask = mask;
                    if (view.far) {
                        for (const n of FAR_NEIGHBOURS) {
                            const u = makeUnit(`${n.ownerId}-${n.x}`, n.characterId, n.ownerId, n.teamId, n.x, n.y);
                            const visual = renderUnit(u, UNIT_RENDER_CONTEXT);
                            visual.position.set(n.x, n.y);
                            world.addChild(visual);
                        }
                    }
                    const heroVisual = renderUnit(hero, UNIT_RENDER_CONTEXT);
                    world.addChild(heroVisual);
                    const fxLayer = new Container();
                    world.addChild(fxLayer);
                    app.stage.addChild(root);
                    return { heroVisual, fxLayer, fxVisuals: new Map<Effect, Container>() };
                });

                let last = performance.now();
                const loop = (now: number) => {
                    if (cancelled) return;
                    const dt = Math.min(0.05, (now - last) / 1000);
                    last = now;
                    const paused = argsRef.current.isPaused();
                    scene.tick(dt, paused);
                    if (!paused) for (const fx of effects) fx.renderUpdate(dt);
                    for (let i = effects.length - 1; i >= 0; i--) {
                        const fx = effects[i]!;
                        if (fx.active && fx.progress < 1) continue;
                        effects.splice(i, 1);
                        for (const v of views) {
                            v.fxVisuals.get(fx)?.destroy();
                            v.fxVisuals.delete(fx);
                        }
                    }
                    for (const v of views) {
                        scene.decorateHero?.(v.heroVisual, now / 1000);
                        for (const fx of effects) {
                            let visual = v.fxVisuals.get(fx);
                            if (!visual) {
                                visual = createEffectVisual(fx, EFFECT_RENDER_CONTEXT);
                                v.fxVisuals.set(fx, visual);
                                v.fxLayer.addChild(visual);
                            }
                            visual.position.set(fx.x - hero.x, fx.y - hero.y);
                            updateEffectVisual(visual, fx, EFFECT_RENDER_CONTEXT);
                        }
                    }
                    app.render();
                    rafId = requestAnimationFrame(loop);
                };
                rafId = requestAnimationFrame(loop);
            });

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
            if (app.renderer) app.destroy();
            canvas.remove();
        };
    }, []);

    return (
        <div className="flex flex-col gap-2">
            <div ref={hostRef} />
            <div className="flex gap-3 text-xs text-gray-400">
                {VIEWS.map((v) => (
                    <span key={v.zoom} style={{ width: VIEW_PX }}>
                        {v.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

interface DarknessProps {
    look: DarknessCorruptionLook;
    paused: boolean;
    /** Ring fill (0-1) held while paused. */
    fill: number;
}

/** The real corruption tick on one player in full darkness; while paused the ring holds at `fill`. */
function DarknessCorruptionPreview(props: DarknessProps) {
    const propsRef = useRef(props);
    propsRef.current = props;
    return (
        <EffectStage
            isPaused={() => propsRef.current.paused}
            makeScene={() => {
                const hero = makeUnit('hero', 'player', 'p1', 'player');
                const eventBus = new EventBus();
                const engine = { getLightLevelAt: () => DarknessLevel.FULL_DARKNESS, eventBus } as unknown as EngineContext;
                const effects: Effect[] = [];
                eventBus.on('damage_taken', (ev) =>
                    createDamageTakenEffect(
                        {
                            addEffect: (fx) => effects.push(fx),
                            generateRandomInteger: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
                            getUnit: (id) => (id === hero.id ? hero : undefined),
                        },
                        ev,
                    ),
                );
                return {
                    hero,
                    effects,
                    tick(dt, paused) {
                        if (paused) {
                            hero.corruptionProgress = propsRef.current.fill;
                            hero.darknessStrikeElapsed = null;
                            return;
                        }
                        hero.tickDarknessCorruption(dt, engine);
                        hero.hp = hero.maxHp;
                    },
                    decorateHero(visual, wallSeconds) {
                        syncDarknessNeedles(visual, hero, wallSeconds, propsRef.current.look);
                    },
                };
            }}
        />
    );
}

interface SpellCircleProps {
    style: string;
    /** Seconds from the circle appearing to the cast landing. */
    castSeconds: number;
    paused: boolean;
}

/** Pause between one circle finishing and the next starting. */
const SPELL_CIRCLE_GAP_SECONDS = 0.5;

/** A spell circle on a casting player, started again each time it finishes. Holds while paused, as in battle. */
function SpellCirclePreview(props: SpellCircleProps) {
    const propsRef = useRef(props);
    propsRef.current = props;
    return (
        <EffectStage
            isPaused={() => propsRef.current.paused}
            makeScene={() => {
                const hero = makeUnit('hero', 'player', 'p1', 'player');
                const effects: Effect[] = [];
                let gap = 0;
                return {
                    hero,
                    effects,
                    tick(dt, paused) {
                        if (paused || effects.length > 0) return;
                        gap -= dt;
                        if (gap > 0) return;
                        gap = SPELL_CIRCLE_GAP_SECONDS;
                        const { style, castSeconds } = propsRef.current;
                        const circle = createSpellCircleEffect(hero, { style }, { castSeconds, abilityId: 'storybook' });
                        if (circle) effects.push(circle);
                    },
                };
            }}
        />
    );
}

const INPUT_CLASS =
    'rounded border border-border-custom bg-dark-900 px-2 py-1 text-sm text-white focus:border-primary focus:outline-none';
const LABEL_CLASS = 'flex items-center gap-2 text-xs text-muted';

const DEFAULT_LOOK: LookId = 'rupture';
const DEFAULT_FILL_PERCENT = 60;
const DEFAULT_WINDUP_SECONDS = 1;

/** A `state` control value as a number in `[min, max]`, or `fallback` when blank or not a number. */
function stateNumber(values: StorybookControlValues, id: string, fallback: number, min: number, max: number): number {
    const raw = controlString(values, id).trim();
    const n = Number(raw);
    return raw === '' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
}

/** One effect on the Effects page: a titled card with the effect's own controls on its title row. */
function EffectCard({ title, description, controls, children }: { title: string; description: string; controls?: ReactNode; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3 rounded-lg border border-border-custom bg-dark-900/40 p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h3 className="text-base font-semibold text-white">{title}</h3>
                {controls}
            </div>
            <p className="text-sm text-muted">{description}</p>
            {children}
        </section>
    );
}

function DarknessCard({ values, setValue }: { values: StorybookControlValues; setValue: StorybookSetValue }) {
    const raw = controlString(values, 'look') as LookId;
    const lookId: LookId = LOOK_IDS.includes(raw) ? raw : DEFAULT_LOOK;
    const fill = stateNumber(values, 'fill', DEFAULT_FILL_PERCENT, 0, 100);
    return (
        <EffectCard
            title="Darkness damage"
            description="The needle ring, ground pool and hit on a player in full darkness. Fill sets where the ring holds while paused."
            controls={
                <>
                    <label className={LABEL_CLASS}>
                        Look
                        <select value={lookId} onChange={(e) => setValue('look', e.target.value)} className={INPUT_CLASS}>
                            {LOOK_IDS.map((id) => (
                                <option key={id} value={id}>
                                    {id}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className={LABEL_CLASS}>
                        Fill while paused
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={fill}
                            onChange={(e) => setValue('fill', e.target.value)}
                            className="accent-primary"
                        />
                        <span className="font-mono text-white">{fill}%</span>
                    </label>
                </>
            }
        >
            <DarknessCorruptionPreview
                look={DARKNESS_CORRUPTION_LOOKS[lookId]}
                paused={controlBoolean(values, 'paused')}
                fill={fill / 100}
            />
        </EffectCard>
    );
}

function SpellCirclesCard({ values, setValue }: { values: StorybookControlValues; setValue: StorybookSetValue }) {
    const windup = stateNumber(values, 'windup', DEFAULT_WINDUP_SECONDS, 0.3, 2);
    const paused = controlBoolean(values, 'paused');
    return (
        <EffectCard
            title="Spell circles"
            description="Every registered spell circle style on a casting player, from the circle appearing to the cast landing and its linger, then again. Paused holds them, as at a pause plane in battle."
            controls={
                <label className={LABEL_CLASS}>
                    Windup
                    <input
                        type="range"
                        min={0.3}
                        max={2}
                        step={0.1}
                        value={windup}
                        onChange={(e) => setValue('windup', e.target.value)}
                        className="accent-primary"
                    />
                    <span className="font-mono text-white">{windup.toFixed(1)}s</span>
                </label>
            }
        >
            <div className="flex flex-col gap-4">
                {SPELL_CIRCLE_STYLE_IDS.map((style) => (
                    <div key={style} className="flex flex-col gap-1">
                        <span className="font-mono text-xs text-muted">{style}</span>
                        <SpellCirclePreview style={style} castSeconds={windup} paused={paused} />
                    </div>
                ))}
            </div>
        </EffectCard>
    );
}

/**
 * The Effects page: one card per effect, each with its own controls on its title row. Only Paused is in the
 * bottom panel; the per-card values are `state` controls, so a link still reopens the page the same way.
 * Add an effect as another card built on `EffectStage`.
 */
export const EFFECTS_STORY: StorybookEntry = {
    id: 'effects',
    name: 'Effects',
    description: 'In-battle visual effects on the real renderers, at the closest and farthest zoom.',
    controls: [
        { kind: 'toggle', id: 'paused', label: 'Paused', defaultValue: false },
        { kind: 'state', id: 'look', defaultValue: DEFAULT_LOOK },
        { kind: 'state', id: 'fill', defaultValue: String(DEFAULT_FILL_PERCENT) },
        { kind: 'state', id: 'windup', defaultValue: String(DEFAULT_WINDUP_SECONDS) },
    ],
    render: (values, setValue) => (
        <div className="flex flex-col gap-4">
            <DarknessCard values={values} setValue={setValue} />
            <SpellCirclesCard values={values} setValue={setValue} />
        </div>
    ),
};
