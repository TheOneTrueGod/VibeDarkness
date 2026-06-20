# World Modifiers — agent guide

## Plan status

- **v1 + v2 initiative complete** (H1–H4 done). See `docs/plans/world-modifiers.plan.md` and `docs/plans/world-modifiers-v2.plan.md`.
- **H5 VisualEffect:** stub only — see § VisualEffect hook below; full wiring waits on the parallel VisualEffect definition system.
- **Optional follow-up:** Step 6 built-in death migration (lanternite, alpha wolf, stack ghost) — checklist in v2 plan, not started.
- **Unrelated pre-existing test failures:** `telegraphTracking.test.ts`, `SimulationRunner` swing sword extra uses.

## What is this system

World modifiers are battle-wide declarative rules that react to game events (unit deaths, round start/end) and produce gameplay effects (spawn light sources, increment counters, add/remove other modifiers). Each modifier is a `WorldModifierDef` (pure JSON, immutable after load) paired with a runtime instance that tracks mutable state (counters, disabled flag, trigger counts).

The manager lives at `GameState.worldModifierManager` (a `WorldModifierManager`). It subscribes to EventBus and is ticked by GameEngine.

---

## Authoring a def

A `WorldModifierDef` is a plain JSON object. Required fields:

| Field | Purpose |
|-------|---------|
| `id` | Unique string. Use `snake_case`. Built-ins use `_builtin_` prefix (reserved — do not use for mission or story defs). |
| `name` | Short display name shown in `WorldModifiersPanel`. |
| `description` | One-sentence tooltip. |
| `icon` | Inline SVG string or asset key (same pattern as ability card icons). |

Optional fields:

| Field | Purpose |
|-------|---------|
| `priority` | Sort key when multiple modifiers share an event. Higher fires first. Default 0. |
| `activeFromRound` / `activeUntilRound` | Round window; modifier is inactive outside it. |
| `requiresObjectiveCompletedId` | Modifier stays inactive until the named objective is completed. |
| `startsDisabled` | Instance begins disabled; enable later via manager API or `setWorldModifierDisabled` effect. |
| `ambient` | Always-on effects stub (not implemented in v1; reserve the field for Rainy Storm follow-up). |
| `rules` | Map of `WorldEventType → WorldEventRule[]`. This is where behavior lives. |

### `overrideEffect` — per-effect-type stacking policy

Controls how this modifier's effects combine with existing effects of the same type at the same target position.

```typescript
overrideEffect?: Partial<Record<WorldEffect['type'], 'replace' | 'stack' | 'sum' | 'max'>>;
```

| Mode | Behaviour for `spawnLightSource` | Other effect types |
|------|----------------------------------|--------------------|
| `'stack'` (default) | Add new `LightSource` alongside any existing world-modifier-spawned sources at the same grid cell. | N/A in v2 |
| `'replace'` | Deactivate all world-modifier-spawned sources at the same grid cell, then spawn the new source. | N/A in v2 |
| `'max'` | Skip spawn if any existing spawned source at the cell has `|lightAmount| ≥` this effect's; otherwise replace the weaker source. | N/A in v2 |
| `'sum'` | Reserved for future numeric effect types (damage bonus, heal, etc.); not implemented in v2. | N/A in v2 |

**Cell bucketing:** Grid cell is `(Math.floor(x / CELL_SIZE), Math.floor(y / CELL_SIZE))` where `CELL_SIZE = 40`.

**Side map:** `WorldModifierManager` maintains a volatile (non-serialized) `spawnedLightSources` map keyed by `LightSource.id`. The map is cleared on engine destroy but **not** persisted across resync — after resync, the merge policy starts fresh. This is acceptable for v2.

**Example:**

```typescript
// Modifier B replaces any existing world-modifier light at the swarmling's tile with a stronger one.
const modB: WorldModifierDef = {
    id: 'my_override',
    // ...
    overrideEffect: { spawnLightSource: 'replace' },
    rules: {
        on_unit_died: [{
            conditions: [{ type: 'victimCharacterIdIs', characterId: 'swarmling' }],
            effects: [{ type: 'spawnLightSource', lightAmount: -6, radius: 3, durationRounds: 5, position: 'victim' }],
        }],
    },
};
```

---

### Rules

Each rule in `rules[eventType]` is a `WorldEventRule`:

```typescript
{
  id?: string;          // optional; auto-generated as `${modId}_${event}_${index}` if omitted
  priority?: number;    // within-modifier rule sort; higher fires first
  once?: boolean;       // fires at most once per modifier lifetime
  maxTriggers?: number; // hard cap on total trigger count
  exclusive?: boolean;  // after this rule fires, stop processing all further on_unit_died rules
  conditions: WorldCondition[];   // AND semantics
  effects: WorldEffect[];         // applied in order
}
```

### Conditions (v1)

| Type | Notes |
|------|-------|
| `{ type: 'always' }` | Always true |
| `{ type: 'victimCharacterIdIs'; characterId }` | Unit died event only |
| `{ type: 'roundAtLeast'; round }` | Event round ≥ round |
| `{ type: 'roundAtMost'; round }` | Event round ≤ round |
| `{ type: 'counterAtLeast'; counterId; count }` | Modifier's own counter |
| `{ type: 'objectiveCompleted'; objectiveId }` | Checks completed objectives |
| `{ type: 'custom'; conditionId; comment; params? }` | Escape hatch; requires a registered handler |

### Effects (v1)

| Type | Key fields |
|------|-----------|
| `spawnLightSource` | `lightAmount` (negative = darklight), `radius`, `durationRounds`, `position: 'victim' \| 'killer'`, optional `color`; optional `overlapMethod: OverlapMethod` (see `LightGrid.ts`; defaults to `'max'`); optional `noDecay: boolean` (hold full emission/radius until expiry, then vanish — skips linear fade) |
| `incrementCounter` | `counterId`, optional `amount` (default 1) |
| `addWorldModifier` | `modifierDef: WorldModifierDef` |
| `removeWorldModifier` | `modifierId` |
| `setWorldModifierDisabled` | `modifierId`, `disabled: boolean` |
| `custom` | `effectId` (must be registered), `comment` (required), optional `params` |

Every effect variant accepts an optional `visualEffects?: VisualEffectDef[]` (see **VisualEffect hook** below).

---

## Adding a modifier to a mission

1. Prefer a preset from `worldModifiers/presets/` (see **Presets** below) over inline defs.
2. Set `mission.worldModifiers = [myPreset()]` on the `MissionBattleConfig` / `BaseMissionDef` subclass.
3. `BattleSession.finalizeEngine()` calls `buildWorldModifiersFromSources` then `worldModifierManager.install(defs)` automatically.

Example (Dark Swarm in Last Holdout):

```typescript
import { darkSwarmModifier } from '../../../worldModifiers/presets';

worldModifiers = [darkSwarmModifier()];
```

---

## Presets

Typed builder functions in `worldModifiers/presets/` return `WorldModifierDef` objects ready for mission arrays, dynamic adds, and `toJSON()`. **Prefer presets over inline defs** — missions should import builders, not export modifier constants.

Import from `worldModifiers/presets` (barrel: `presets/index.ts`).

### `darkSwarmModifier(opts?)`

Swarmling (or configured character) deaths spawn a dark light source at the victim tile.

| Option | Default | Purpose |
|--------|---------|---------|
| `lightAmount` | `-1` | Darklight intensity (negative = darkness) |
| `radius` | `2` | Light source radius in tiles |
| `durationRounds` | `5` | How many rounds the aura lasts |
| `characterId` | `'swarmling'` | Victim character id that triggers the effect |

Returns id `'dark_swarm'`.

### `rainyStormModifier(opts?)`

Rain overlay stub + `on_round_start` counter for mid-battle add tests. Ambient runtime is not implemented (def-only, same as v1 `WorldAmbientEffect` policy).

| Option | Default | Purpose |
|--------|---------|---------|
| `id` | `'rainy_storm'` | Modifier id |
| `name` | `'Rainy Storm'` | Display name |
| `activeFromRound` | *(omitted)* | Round window start |
| `startsDisabled` | *(omitted)* | Instance begins disabled when `true` |

Includes `ambient: [{ type: 'rain_overlay' }]` and increments `storm_ticks` on each `on_round_start` while active.

---

## Build helper

`buildWorldModifiersFromSources({ builtins, mission, story })` merges three sources and deduplicates by `id`. Later sources override earlier:

```
builtins (always lowest precedence)
  < mission.worldModifiers
  < storyWorldModifiers (battle init payload)
```

---

## Mid-battle modifier changes

### Via manager API (from code)

```typescript
engine.state.worldModifierManager.addModifier(def);
engine.state.worldModifierManager.removeModifier(id);
engine.state.worldModifierManager.setDisabled(id, disabled);
```

`addModifier` silently no-ops if the id already exists.

Dynamically added modifiers are flagged `isDynamic: true` and have their full def serialized into the checkpoint (`dynamicDef` field) so they survive resync.

### Via WorldEffect (declarative)

Any rule can trigger `addWorldModifier`, `removeWorldModifier`, or `setWorldModifierDisabled` effects — no extra code needed.

### Via LevelEvent (story / boss scripting)

Add a `setWorldModifiers` event to a mission's `levelEvents` array:

```typescript
{
  type: 'setWorldModifiers',
  trigger: { atRound: 5 },   // or { afterSeconds: 10 }
  actions: [
    { action: 'add', modifier: stormModDef },
    { action: 'disable', modifierId: 'dark_swarm' },
  ],
}
```

`LevelEventManager` dispatches to `ctx.worldModifierManager` on the trigger condition.

---

## Built-in modifier migration pattern

GameEngine death handlers that need to become data-driven modifiers follow this pattern:

1. Add a `WorldModifierDef` with `id: '_builtin_<name>'` and a `custom` effect to `builtins/index.ts`.
2. Register the handler in `builtinHandlers.ts` via `manager.registerCustomEffectHandler(effectId, fn)`.
3. Remove the equivalent block from `GameEngine.registerCoreEventListeners()`.

The `custom` escape hatch (`WorldEffect.type === 'custom'`) exists specifically for this migration; prefer declarative effects for new modifiers.

### Reserved `_builtin_` id prefix

Ids starting with `_builtin_` are reserved for built-in world modifiers defined in `builtins/index.ts`. Do not use this prefix for mission or story defs.

### Priority conventions for built-ins

| id | priority | Notes |
|----|----------|-------|
| `_builtin_lanternite_death` | 900 | Lanternite custom VFX; planned migration |
| `_builtin_alpha_wolf_death` | 800 | `exclusive: true`; story sequence owns alpha wolf VFX |
| `_builtin_default_death_vfx` | −100 | Runs last; handles all other enemies |

Mission defs use default priority (0) or low positive values. High-priority slots (> 100) are reserved for built-ins.

---

## Serialization contract

`WorldModifierManager.toJSON()` returns `SerializedWorldModifierInstance[]`, stored at `SerializedGameState.worldModifiers`.

Each instance serializes:

- `id` — links back to the def
- `disabled` — current disabled flag
- `counters` — `incrementCounter` accumulators
- `ruleTriggerCounts` — per-rule fire counts for `once`/`maxTriggers` tracking
- `dynamicDef` (dynamic only) — full def so resync can reconstruct mid-battle adds

Restore path: `GameEngine.fromJSON` calls `worldModifierManager.importSnapshot(data.worldModifiers ?? null)`, then `BattleSession.finalizeEngine()` calls `install(defs)`. Snapshot state is merged during `install` — same pattern as `ObjectiveManager`.

---

## VisualEffect hook (stub — H5 complete)

Every `WorldEffect` variant has an optional `visualEffects?: VisualEffectDef[]` field. This is a forward-compatible hook for the VisualEffect definition system (parallel workstream, not yet merged).

**Current policy (H5 blocked):**
- `VisualEffectDef` is a minimal stub in `WorldEffect.ts`: `{ id: string; params?: Record<string, unknown> }`.
- `WorldModifierRuntime.applyEffect` calls `applyVisualEffects(effect.visualEffects, context)` — currently a no-op — after each gameplay effect.
- Search for the comment `// VisualEffect:` to find all stub wiring points.
- **Initiative H5 is complete** when the blocked stub is documented (this section). No production wiring until the unblock criteria below are met.

**Unblock criteria — implement wiring when all three are true:**

1. A non-stub `VisualEffectDef` type exists outside `worldModifiers/` (e.g. `game/visualEffects/types.ts` or similar).
2. A runtime API exists to spawn a visual effect at world `(x, y)` from a def id + params (grep `spawnVisualEffect` or equivalent).
3. Headless sim can observe effect creation deterministically (effect count or serialized marker).

**When all three are met:** replace the `VisualEffectDef` stub import in `WorldEffect.ts` with the real type; implement `applyVisualEffects` in `WorldModifierRuntime.ts` to call the spawn API at `victimX/victimY` (or killer) from `WorldRuleEvalContext`; add an optional `visualEffects` array to the `darkSwarmModifier` preset; add a Vitest or AbilityTest assertion that effect count increases on swarmling death.

---

## Key files

| File | Purpose |
|------|---------|
| `types.ts` | `WorldModifierDef`, `WorldEventRule`, `WorldEventType`, `SerializedWorldModifierInstance` |
| `WorldCondition.ts` | `WorldCondition` union — all v1 condition variants |
| `WorldEffect.ts` | `WorldEffect` union + `VisualEffectDef` stub |
| `WorldModifierManager.ts` | Owns instances, dispatches rules, serializes state |
| `WorldModifierRuntime.ts` | `evaluateCondition`, `applyEffect`, `applyVisualEffects` stub |
| `EventRuleDispatcher.ts` | Generic `dispatchEventRules<C,E,Ctx>` (shared with ability event system) |
| `buildWorldModifiers.ts` | `buildWorldModifiersFromSources` merge helper |
| `presets/` | Typed preset builders (`darkSwarmModifier`, `rainyStormModifier`) |
| `builtins/index.ts` | `BUILTIN_WORLD_MODIFIERS` array |
| `builtinHandlers.ts` | `registerBuiltinHandlers` — custom effect handlers for built-ins |
