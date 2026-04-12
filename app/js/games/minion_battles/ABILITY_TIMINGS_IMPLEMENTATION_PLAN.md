# Ability timings refactor — implementation plan

**Goal:** Make `abilityTimings` the single source of truth for how long each part of an ability lasts, using **half-open intervals** `[start, end)` with stable **`id`** strings, **overlap support** for simulation, and **one merged “primary” visualization band** for the battle timeline (when intervals overlap, the **earlier-listed** timing wins for that pixel of time).

**Non-goals (this pass):** Removing every `prefireTime` / `cooldownTime` field from `AbilityStatic` in one shot; migrating all behaviors to id-based callbacks in one shot. The plan allows **incremental** migration behind shared utilities.

**Baseline:** Run `npm run test` before starting; all tests must pass after each mergeable chunk.

---

## 1. Definitions

### 1.1 `AbilityTimingInterval` (target shape)

Each entry should include at least:

| Field | Purpose |
|--------|--------|
| `id` | Stable string for code (`windup`, `lunge`, `recovery`, …) |
| `start` | Seconds from ability start (inclusive) |
| `end` | Seconds from ability start (**exclusive**) |
| `abilityPhase` (or `uiKind`) | Coloring / tooltips (maps to existing `AbilityPhase` or a small UI enum) |

**Invariant:** `start < end`. Intervals may overlap; order in the array is **significant** for UI merge (see §2).

### 1.2 Total duration

`totalAbilityDuration = max(end)` across all intervals (plus optional explicit padding if ever needed).

### 1.3 Simulation queries (for `doCardEffect` / future hooks)

- `activeTimingIds(elapsed, timings): Set<string>` — `start <= elapsed < end`
- `enteredTimingIds(prevElapsed, nextElapsed, timings)` / `exitedTimingIds(...)` — for one-shot effects at boundaries (respect half-open rules)

These are **pure** functions in `abilities/abilityTimings.ts` (or `abilities/timingQueries.ts`).

---

## 2. Primary band for Battle Timeline (design decision §8)

For the **horizontal timeline bar only**, do **not** draw overlapping segments as separate stacked lanes. Instead:

1. Build a **single** list of **non-overlapping** segments along the time axis that cover the union of all intervals.
2. For any time `t`, if multiple source intervals contain `t`, assign **`t` to the interval that appears first** in the **declaration order** of `abilityTimings` (the array order on the ability def).

**Algorithm sketch (for sub-agent implementation):**

- Sort by `start`, then by **original index** (stable) for tie-breaking on starts.
- Sweep or merge: for each sub-interval where the set of covering ids is constant, pick the **minimum original index** among covering intervals; attach that interval’s `id` + `abilityPhase` for color/label.

**Output:** A list of `{ start, end, sourceId, abilityPhase, label?, description? }` suitable for existing `TimelinePhaseSegment`-style rendering (one row).

**Note:** Tooltip text can still mention secondary overlaps in a later iteration; v1 is single band + first-wins.

---

## 3. Dependency graph (high level)

```
[Core types + queries] ──► [getTotalAbilityDuration + GameEngine]
         │
         ├──► [BattleTimeline + primary merge]
         │
         └──► [Per-ability migrations] (parallel after core is merged)
```

**Blocking:** Core interval types + `max(end)` duration must land before or with GameEngine change, or behavior diverges.

---

## 4. Workstreams (parallelizable)

These can be assigned to **different sub-agents** after **Track A** (foundation) is merged or in a short sequential “foundation PR”.

### Track A — Foundation (sequential gate; one sub-agent)

**Deliverables:**

- [x] Add `AbilityTimingInterval` type and validators (`validateAbilityTimings`, assert `start < end`, optional warn on negative).
- [x] Implement `getTotalAbilityDurationFromIntervals(timings)` → `max(end)`.
- [x] Implement `activeTimingIds`, `enteredTimingIds`, `exitedTimingIds` (half-open).
- [x] **Migration adapter:** `normalizeLegacyAbilityTimings(legacy: AbilityTiming[])` — convert old `{ duration, abilityPhase }[]` **sequential** list into half-open intervals `[cursor, cursor+duration)` preserving order (document that legacy = no overlap).
- [x] Deprecation path: keep existing `AbilityTiming` export during migration; re-export or alias to new name when ready.

**Tests (Vitest):** boundary cases (`elapsed === end` inactive), overlapping ids, legacy normalization sums to same total duration as old `reduce(duration)`.

**Exit criteria:** Pure module, no `GameEngine` change yet unless trivial.

---

### Track B — Engine duration source of truth (depends on Track A)

**Deliverables:**

- [x] Update `getTotalAbilityDuration` in `abilityTimings.ts` to:
  - Prefer **new** interval list when present (`abilityTimingsV2` or unified field — see naming note below).
  - Else run **legacy** path: sequential durations **or** `prefireTime + cooldownTime`.
- [x] `GameEngine.processActiveAbilities`: already uses `getTotalAbilityDuration`; verify it matches `max(end)` once intervals are wired.

**Naming note:** Either extend `AbilityStatic` with `abilityTimingIntervals?: AbilityTimingInterval[]` alongside legacy, or replace `abilityTimings` in one type rename PR. Prefer **one field** `abilityTimings` with a discriminated union or version flag to avoid dual maintenance — **Track A owner** should pick the smallest-change strategy documented here.

**Tests:** engine-level test or unit test that an ability with overlapping intervals completes at `max(end)`, not sum of durations.

**Parallel with:** Track C only after Track A types exist (can stub types locally until A merges).

---

### Track C — Battle timeline + primary merge (depends on Track A)

**Deliverables:**

- [x] Remove hardcoded `getAbilityTimelineDef` / `buildDefaultTimeline` heuristics based on `prefireTime` / fixed `0.5` active where possible.
- [x] Implement `buildPrimaryTimelineSegments(ability, windowSeconds, elapsed)` using:
  - normalized intervals from ability def,
  - merge rule §2 (first declaration order wins),
  - clamp to `[0, windowSeconds]` “from now” like current `computeRemainingPhases`.
- [x] Remove inline `throw_rock` exception; replace with **default** path + optional **`AbilityStatic.getBattleTimelineSpec?`** or registry if an ability needs custom labels only (polymorphism, not `if (id === …)` in the component).
- [x] Enemy row: align “action window” segment with a **convention** (e.g. first `abilityPhase === Active` interval, or explicit `id === 'hit'`) — document in code.

**Tests:** shallow React test or snapshot for merge: two overlapping intervals, first wins for the overlap region.

**Parallel with:** Track B (both need Track A).

---

### Track D — ChargeAttack template migration (depends on Track A + B)

**Deliverables:**

- [x] Replace `ChargeAttackConfig` windup/lunge/cooldown **numbers** as the source of truth with **one** exported const block that builds `abilityTimings` intervals (ids e.g. `windup`, `lunge`, `cooldown`).
- [x] Derive `prefireTime` / movement (`LungeMovement`) inputs from intervals **by id** (e.g. end of `lunge` for “main phase” end) or keep thin computed getters.
- [x] Update `doCardEffect` / `renderActivePreview` to use `activeTimingIds` / ids instead of `config.windupTime` literals where possible.

**Parallel with:** Track E (different files).

---

### Track E — Card ability defs migration (parallel batch work)

Split by **directory or file batches** so sub-agents do not conflict:

- [x] Batch 1: `card_defs/01xx_*` player abilities
- [x] Batch 2: `card_defs/02xx_*` guns
- [x] Batch 3: `card_defs/05xx_*` / claws
- [x] Batch 4: `card_defs/dark_animals/*` (non–ChargeAttack)
- [x] Batch 5: `0001` / `0002` enemies

**Per file:** Convert sequential `abilityTimings` to explicit intervals **or** rely on `normalizeLegacyAbilityTimings` until hand-edited.

**Parallel with:** Track D (touch different paths until shared template merges).

---

### Track F — AbilityBase + UI consumers (after Track A)

**Deliverables:**

- [x] Replace or supplement `getPhaseAtTime` / `didEnterPhase(AbilityPhase, …)` with **id-based** helpers, or shim `AbilityPhase` by mapping phase → id (temporary).
- [x] Circular progress / any UI using `ABILITY_PHASE_COLORS`: ensure phases still resolve when overlaps exist (primary: same “first wins” or “highest priority phase” — align with timeline or document difference).

**Parallel with:** Track E for files that don’t touch AbilityBase.

---

### Track G — Cleanup + docs (after Tracks B–E mostly done)

**Deliverables:**

- [ ] Remove legacy sequential `AbilityTiming` if fully migrated.
- [x] Update `app/js/games/minion_battles/Agents.md` / `.cursor` skill for “creating an ability” with interval table + id conventions.
- [x] Optional: `getAllAbilities()` assertion test — every registered ability has non-empty `abilityTimings` (interval form).

---

## 5. Suggested merge order (minimize rebase pain)

1. **PR1 — Track A** (foundation + tests) — *blocks everything*
2. **PR2 — Track B** + **PR3 — Track C** in parallel (rebase on PR1)
3. **PR4 — Track D** (ChargeAttack) — unblocks dark animals card files that only pass config
4. **PR5+ — Track E** batches in parallel
5. **PRn — Track F / G** as debt burns down

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Checkpoint / replay expects old timing shape | Intervals live on **static** defs only; serialized state still `startTime` + `abilityId`. No wire format change. |
| Dual `prefireTime` vs intervals drift | Until removal, add dev-only assert: `prefireTime === derivedFromIntervals` for migrated abilities. |
| Sub-agents conflict on `Ability.ts` | Track A owns interface change; others import types only. |

---

## 7. Sub-agent brief template (copy for each task)

```
Context: ABILITY_TIMINGS_IMPLEMENTATION_PLAN.md §X (Track Y)
Scope: [files / dirs]
Must: npm run lint; npm run test; half-open [start,end); primary band merge = first in array order
Out of scope: […]
Handoff: [what the next PR expects]
```

---

## 8. Done definition (project)

- [x] No `if (ability.id === 'throw_rock')` in `BattleTimeline.tsx`
- [x] `getTotalAbilityDuration` uses `max(end)` for interval-based defs
- [x] Timeline shows a **single** primary band; overlapping intervals use **first-listed** win
- [x] `ChargeAttack` (and eventually all abilities) define timings once; simulation keys off ids where migrated
