/**
 * Read-only summary of what a mission spawns and when, for the Mission Overview popover.
 *
 * Reads the mission's level events and triggers (plain data) and groups spawns into: the starting
 * enemies, one-shot waves by round, continuous spawns, and gated / triggered spawns. Each group sums
 * HP (with player-count scaling, like `LevelEventManager`) and estimated damage per round
 * (`abilityDamagePerRound.ts`). Non-spawn triggered effects are listed as text.
 */
import { estimateUnitDamagePerRound } from '../../abilities/abilityDamagePerRound';
import { getEnemyHealthMultiplier } from '../../constants/enemyConstants';
import { ROUND_DURATION } from '../../game/gameConstants';
import type { TeamId } from '../../game/teams';
import type { TriggerDef, TriggerRegion } from '../../game/triggers/triggerTypes';
import { getBaseSpawnDefs, getUnitDefEntry, resolveEnemySpawnStats, type UnitDefId } from '../../game/units/unit_defs/unitDef';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { EnemySpawnDef, LevelEvent, MissionBattleConfig, SpawnWaveEntry } from '../types';

export type SpawnGroupKind = 'start' | 'round' | 'continuous' | 'triggered';

export interface SpawnSummaryUnit {
    characterId: string;
    name: string;
    teamId: TeamId;
    /** Units spawned. Continuous spawns give a per-round rate, so this can be fractional. */
    count: number;
    hpEach: number;
    stackSize: number;
    /** Estimated damage per round for one unit; `null` when its abilities do not report damage. */
    damagePerRoundEach: number | null;
}

export interface SpawnSummaryGroup {
    key: string;
    kind: SpawnGroupKind;
    /** Short heading, e.g. "Round 3" or "Every 0.5 rounds". */
    label: string;
    /** Extra detail: trigger, gate, window, or round timing. */
    detail?: string;
    /** First round the group can spawn in (round groups; undefined when it depends on a trigger). */
    round?: number;
    units: SpawnSummaryUnit[];
    /** Sums over enemy-team units only. Continuous groups sum one round of spawns. */
    totalHp: number;
    totalDamagePerRound: number;
    /** Enemy units counted whose damage is unknown. */
    unknownDamageCount: number;
}

export interface MissionSpawnSummary {
    starting: SpawnSummaryGroup;
    rounds: SpawnSummaryGroup[];
    continuous: SpawnSummaryGroup[];
    triggered: SpawnSummaryGroup[];
    /** Triggered non-spawn effects (messages, objective reveals, tile changes, world modifiers). */
    otherEffects: string[];
}

/** A unit already on the map at tick 0 (from the preview engine), with base HP before player scaling. */
export interface StartingUnitInput {
    characterId: string;
    name: string;
    teamId: TeamId;
    baseHp: number;
    stackSize: number;
    abilities: readonly string[];
}

type MissionSpawnSource = Pick<MissionBattleConfig, 'levelEvents' | 'triggers' | 'battleObjectives'>;

const BASE_SPAWN_DEFS = getBaseSpawnDefs();

function unitName(characterId: string, fallback?: string): string {
    return fallback ?? getUnitDefEntry(characterId as UnitDefId)?.displayName ?? characterId;
}

function fromWaveEntry(entry: SpawnWaveEntry, countScale: number, hpMult: number): SpawnSummaryUnit | null {
    const base = BASE_SPAWN_DEFS[entry.characterId];
    if (!base) return null;
    const stats = resolveEnemySpawnStats({ ...base, ...entry });
    return {
        characterId: entry.characterId,
        name: unitName(entry.characterId, entry.name ?? base.name),
        teamId: base.teamId,
        count: Math.max(0, entry.spawnCount ?? 1) * countScale,
        hpEach: Math.round(stats.hp * (base.teamId === 'enemy' ? hpMult : 1)),
        stackSize: stats.stackSize,
        damagePerRoundEach: estimateUnitDamagePerRound(base.abilities, stats.stackSize),
    };
}

function fromEnemySpawnDef(def: EnemySpawnDef, hpMult: number): SpawnSummaryUnit {
    const stats = resolveEnemySpawnStats(def);
    return {
        characterId: def.characterId,
        name: unitName(def.characterId, def.name),
        teamId: def.teamId,
        count: 1,
        hpEach: Math.round(stats.hp * (def.teamId === 'enemy' ? hpMult : 1)),
        stackSize: stats.stackSize,
        damagePerRoundEach: estimateUnitDamagePerRound(def.abilities, stats.stackSize),
    };
}

/** Merges rows of the same unit, team, HP and stack size. */
function mergeUnits(units: SpawnSummaryUnit[]): SpawnSummaryUnit[] {
    const byKey = new Map<string, SpawnSummaryUnit>();
    for (const u of units) {
        const key = `${u.characterId}|${u.name}|${u.teamId}|${u.hpEach}|${u.stackSize}`;
        const existing = byKey.get(key);
        if (existing) existing.count += u.count;
        else byKey.set(key, { ...u });
    }
    return [...byKey.values()];
}

function makeGroup(
    key: string,
    kind: SpawnGroupKind,
    label: string,
    units: SpawnSummaryUnit[],
    extra: { detail?: string; round?: number } = {},
): SpawnSummaryGroup {
    const merged = mergeUnits(units);
    let totalHp = 0;
    let totalDamagePerRound = 0;
    let unknownDamageCount = 0;
    for (const u of merged) {
        if (u.teamId !== 'enemy') continue;
        totalHp += u.hpEach * u.count;
        if (u.damagePerRoundEach == null) unknownDamageCount += u.count;
        else totalDamagePerRound += u.damagePerRoundEach * u.count;
    }
    return { key, kind, label, units: merged, totalHp, totalDamagePerRound, unknownDamageCount, ...extra };
}

/** Round a one-shot trigger fires in. Rounds start at 1, so `atRound: 0` fires in round 1. */
function roundOfTrigger(trigger: { atRound: number } | { afterSeconds: number }): number {
    if ('atRound' in trigger) return Math.max(1, trigger.atRound);
    return Math.floor(trigger.afterSeconds / ROUND_DURATION) + 1;
}

function describeRegion(region: TriggerRegion): string {
    if (region.type === 'rect') {
        return `rect at tile (${region.col}, ${region.row}), ${region.width}x${region.height} tiles`;
    }
    const tiles = Math.round((region.radiusPx / CELL_SIZE) * 10) / 10;
    return `circle at tile (${Math.floor(region.x / CELL_SIZE)}, ${Math.floor(region.y / CELL_SIZE)}), radius ${tiles} tiles`;
}

/** Gate text from `afterObjective` / `afterTrigger` / `until*`, or undefined when ungated. */
function describeGates(evt: LevelEvent, objectiveLabels: Map<string, string>): { opens?: string; closes?: string } {
    const objective = (id: string) => `objective "${objectiveLabels.get(id) ?? id}"`;
    const opens = evt.afterObjective
        ? `after ${objective(evt.afterObjective)}`
        : evt.afterTrigger
          ? `after trigger "${evt.afterTrigger}"`
          : undefined;
    const closes = evt.untilObjective
        ? `until ${objective(evt.untilObjective)}`
        : evt.untilTrigger
          ? `until trigger "${evt.untilTrigger}"`
          : undefined;
    return { opens, closes };
}

function joinDetail(...parts: (string | undefined)[]): string | undefined {
    const text = parts.filter(Boolean).join(' · ');
    return text || undefined;
}

function formatRounds(n: number): string {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function summarizeMissionSpawns(
    mission: MissionSpawnSource,
    opts: { startingUnits: readonly StartingUnitInput[]; playerCount: number },
): MissionSpawnSummary {
    const hpMult = getEnemyHealthMultiplier(opts.playerCount);
    const objectiveLabels = new Map((mission.battleObjectives ?? []).map((o) => [o.id, o.label]));

    const starting = makeGroup(
        'start',
        'start',
        'Starting enemies',
        opts.startingUnits.map((u) => ({
            characterId: u.characterId,
            name: u.name,
            teamId: u.teamId,
            count: 1,
            hpEach: Math.round(u.baseHp * (u.teamId === 'enemy' ? hpMult : 1)),
            stackSize: u.stackSize,
            damagePerRoundEach: estimateUnitDamagePerRound(u.abilities, u.stackSize),
        })),
        { detail: 'On the map at the start (no spawn-in)' },
    );

    const roundUnits = new Map<number, SpawnSummaryUnit[]>();
    const roundDetails = new Map<number, Set<string>>();
    const continuous: SpawnSummaryGroup[] = [];
    const triggered: SpawnSummaryGroup[] = [];
    const otherEffects: string[] = [];

    const waveUnits = (spawns: SpawnWaveEntry[], extra: EnemySpawnDef[] | undefined, countScale = 1) => [
        ...spawns.map((e) => fromWaveEntry(e, countScale, hpMult)).filter((u): u is SpawnSummaryUnit => u != null),
        ...(extra ?? []).map((d) => fromEnemySpawnDef(d, hpMult)),
    ];

    (mission.levelEvents ?? []).forEach((evt, i) => {
        const gates = describeGates(evt, objectiveLabels);
        const gated = Boolean(gates.opens);
        switch (evt.type) {
            case 'spawnWave': {
                const round = roundOfTrigger(evt.trigger);
                const timing = 'afterSeconds' in evt.trigger ? `after ${evt.trigger.afterSeconds}s` : undefined;
                const units = waveUnits(evt.spawns, evt.extraEnemySpawns);
                if (gated) {
                    triggered.push(
                        makeGroup(`evt-${i}`, 'triggered', 'Triggered wave', units, {
                            detail: joinDetail(gates.opens, `no earlier than round ${round}`, gates.closes),
                        }),
                    );
                } else {
                    roundUnits.set(round, [...(roundUnits.get(round) ?? []), ...units]);
                    const details = roundDetails.get(round) ?? new Set<string>();
                    if (timing) details.add(timing);
                    if (gates.closes) details.add(gates.closes);
                    roundDetails.set(round, details);
                }
                break;
            }
            case 'continuousSpawn': {
                const { intervalRounds, startRound, endRound } = evt.trigger;
                const perRound = intervalRounds > 0 ? 1 / intervalRounds : 0;
                const window =
                    startRound != null || endRound != null
                        ? `rounds ${formatRounds(startRound ?? intervalRounds)}–${endRound != null ? formatRounds(endRound) : 'end'}`
                        : undefined;
                const cap = evt.maxUnits != null ? `cap ${evt.maxUnits} units` : undefined;
                const group = makeGroup(
                    `evt-${i}`,
                    gated ? 'triggered' : 'continuous',
                    `Every ${formatRounds(intervalRounds)} round${intervalRounds === 1 ? '' : 's'}`,
                    waveUnits(evt.spawns, undefined, perRound),
                    { detail: joinDetail('per-round rate', window, gates.opens, gates.closes, cap) },
                );
                (gated ? triggered : continuous).push(group);
                break;
            }
            case 'proximitySpawn': {
                const t = evt.trigger;
                const region: TriggerRegion = { type: 'circle', x: t.centerWorldX, y: t.centerWorldY, radiusPx: t.radiusPx };
                const units = waveUnits(evt.spawnWaveEntries ?? [], evt.extraEnemySpawns);
                if (units.length > 0) {
                    triggered.push(
                        makeGroup(`evt-${i}`, 'triggered', 'Proximity spawn', units, {
                            detail: joinDetail(
                                `when a creature enters the ${describeRegion(region)}`,
                                evt.fireOnce === false ? 'repeats' : 'once',
                                gates.opens,
                                gates.closes,
                            ),
                        }),
                    );
                }
                if (evt.revealObjectiveIds?.length) {
                    otherEffects.push(`Proximity (${describeRegion(region)}): reveals objectives ${evt.revealObjectiveIds.join(', ')}`);
                }
                break;
            }
            case 'convertSpecialTile':
                otherEffects.push(
                    `Round ${Math.max(1, evt.trigger.atRound)}: tile (${evt.col}, ${evt.row}) becomes ${evt.replacementDefId}`,
                );
                break;
            case 'setWorldModifiers': {
                const actions = evt.actions
                    .map((a) => (a.action === 'add' ? `add ${a.modifier.name}` : `${a.action} ${a.modifierId}`))
                    .join(', ');
                otherEffects.push(`Round ${roundOfTrigger(evt.trigger)}: world modifiers — ${actions}`);
                break;
            }
            case 'victoryCheck':
                break;
        }
        if (evt.emittedMessage && evt.type !== 'victoryCheck') {
            otherEffects.push(`Message (${evt.type}): "${evt.emittedMessage}"`);
        }
    });

    for (const trigger of mission.triggers ?? []) {
        summarizeTrigger(trigger, (units, detail) => {
            triggered.push(makeGroup(`trigger-${trigger.id}-${triggered.length}`, 'triggered', `Trigger "${trigger.id}"`, units, { detail }));
        }, otherEffects, (spawns, extra) => waveUnits(spawns, extra));
    }

    const rounds = [...roundUnits.entries()]
        .sort(([a], [b]) => a - b)
        .map(([round, units]) =>
            makeGroup(`round-${round}`, 'round', round === 1 ? 'Round 1 (battle start)' : `Round ${round}`, units, {
                round,
                detail: joinDetail(...(roundDetails.get(round) ?? [])),
            }),
        );

    return { starting, rounds, continuous, triggered, otherEffects };
}

function summarizeTrigger(
    trigger: TriggerDef,
    pushSpawn: (units: SpawnSummaryUnit[], detail: string) => void,
    otherEffects: string[],
    waveUnits: (spawns: SpawnWaveEntry[], extra: EnemySpawnDef[] | undefined) => SpawnSummaryUnit[],
): void {
    const when = trigger.events
        .map((e) => `a unit enters the ${describeRegion(e.region)}`)
        .join(' or ');
    const flags = [
        trigger.enabled === false ? 'starts disabled' : undefined,
        trigger.fireOnce === false ? 'repeats' : 'once',
        trigger.conditions?.length ? `${trigger.conditions.length} condition${trigger.conditions.length === 1 ? '' : 's'}` : undefined,
    ];
    for (const action of trigger.actions) {
        switch (action.type) {
            case 'spawnWave':
                pushSpawn(
                    waveUnits(action.spawns, action.extraEnemySpawns),
                    joinDetail(`when ${when}`, action.nearTriggeringUnit ? `near the triggering unit (${action.nearTriggeringUnit.radiusTiles} tiles)` : undefined, ...flags) ?? '',
                );
                break;
            case 'message':
                otherEffects.push(`Trigger "${trigger.id}": message "${action.text}"`);
                break;
            case 'revealObjectives':
                otherEffects.push(`Trigger "${trigger.id}": reveals objectives ${action.objectiveIds.join(', ')}`);
                break;
            case 'setTriggerEnabled':
                otherEffects.push(`Trigger "${trigger.id}": ${action.enabled ? 'enables' : 'disables'} trigger "${action.triggerId}"`);
                break;
        }
    }
}
