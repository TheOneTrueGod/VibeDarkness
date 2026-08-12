# CrowdSpacing — Living Design

Soft radius packing for grounded units in Minion Battles. Not rigid physics; does not overload ability **`nudge`**. Separate from `CellOccupancyManager` (tile capacity / shove).

Use this doc for future `/jp-plan` work. MVP implementation lives under `app/js/games/minion_battles/game/crowdSpacing/`. The one-shot MVP plan is `docs/plans/crowd-spacing-mvp.md`.

### Vocabulary

| Term | Meaning |
|---|---|
| **CrowdSpacing** | Soft radius packing: nudge overlapping grounded units apart |
| **Soft** | Participates and **can** be displaced |
| **Anchor** | Participates (occupies space) but is **never** displaced by CrowdSpacing |
| **Exempt** | Not in the grid (e.g. airborne) |
| **CrowdSpacingAnchor** | `UnitTag` for heavies/bosses (independent of `Boss`) |
| **Spacing weight** | How hard a unit resists being moved; MVP = `radius` |

---

## MVP (done)

Shipped with `crowd-spacing-mvp` plan (2026-08-10).

**What it does**

- After UnitManager movement (Phase 2c), sync participants into an ephemeral uniform `CrowdSpacingGrid`, then run **one** `resolveCrowdSpacingPass` per tick.
- Soft–soft: separate along the pair axis by overlap depth; split by inverse weights.
- Soft–anchor: full correction on the soft only. Anchor–anchor: no-op.
- Instant `x/y` correction with terrain clamp (`clampNudgeVectorToTerrain`); residual overlap OK next tick.
- Roles: airborne / dead / spawning → exempt; `isPlayerControlled()`, `UnitTag.CrowdSpacingAnchor`, or forced-mover (`knockback != null` or `controlled`) → anchor; else soft.
- Weight: `getCrowdSpacingWeight` → `unit.radius` (hook for later mass/override).
- Grid is runtime-only: rebuild on prepare/fromJSON clear; incremental cell updates in play; **never** checkpointed or synced.
- Boss spawn content: `UnitTag.CrowdSpacingAnchor` added alongside `Boss` in shared enemy constants (solver does not special-case Boss).
- AbilityTest: `crowd_spacing_pack_and_anchors` (general / Movement).

**Key files**

- `game/crowdSpacing/` — constants, roles, grid, resolve, `CrowdSpacingManager`
- Wired on `GameEngine` / `EngineContext`; tick from `UnitManager` Phase 2c
- Scenario: `testing/scenarios/general/crowdSpacing.ts`

**Baseline constants** (tune in later phases): overlap epsilon `0.5` px; cell size `2 * maxParticipatingRadius` (fallback `CELL_SIZE * 2`); one pass per tick.

---

## Phase 1 — Safety & feel

High-level instructions for a future plan. Do **not** expand into full checklists here.

1. **Per-tick max displacement** — Cap how far a soft can move in one CrowdSpacing pass (after weight split, before or after terrain clamp — pick one order and document it). Goal: stop teleport-like pops when many overlaps stack. Export a named constant; unit-test a squeezed soft that would otherwise jump far.

2. **Soft squeezed between anchors / walls** — When a soft is pinned (two anchors, or anchor + impassable), current one-pass + clamp can leave residual overlap or zero motion. Decide desired feel: leave residual, allow slight penetration visually, or a small “escape slide” along the free axis. Add a focused resolve test with a soft between two anchors and/or a wall.

3. **Player-owned pets** — Today pets that are `isPlayerControlled()` are anchors. Decide: keep as anchors (player formation stable) vs soft (pets pack with enemies/allies). If soft, refine participation so true player heroes stay anchors without tagging every pet. Update AbilityTest or add a pet-focused general scenario if behaviour changes.

4. **Feel tuning** — Revisit overlap epsilon, cell-size policy when tiny+huge radii mix, and whether wait/idle packs feel too sticky. Prefer constant tweaks + scenario assertions over solver rewrites. Document chosen numbers in `crowdSpacingConstants.ts` comments once settled.

5. **Forced-move coverage** — Catalog dashes / slides that are neither `knockback` nor `controlled`; if any should be temporary anchors, introduce a shared `isForcedMover` (or equivalent) rather than growing ad hoc checks in `getCrowdSpacingRole`.

Open decision from MVP (carry forward): pets soft vs anchor; shared forced-mover flag for future dashes.

---

## Phase 2 — Size / tier hierarchy

Optional spacing tier so larger units act as anchors relative to smaller ones (without requiring `CrowdSpacingAnchor` on every mid-tier).

1. **Define a tier source** — e.g. def field, derived from radius bands, or explicit enum. Keep `CrowdSpacingAnchor` as an absolute override (always anchor vs everyone).

2. **Pair rules (example shape only)** — Same tier: soft–soft as today. Higher tier vs lower: higher acts as anchor for that pair (lower takes full correction). Equal tiers with tag still absolute. Do not bake numeric band tables into this living doc; the implementing plan chooses bands/tests.

3. **Solver impact** — Role may become pair-relative (`effectiveRole(a, b)`) or precomputed “tier” used only in resolve. Prefer extending `resolveCrowdSpacing` over duplicating grid participation. Exempt (airborne) still never enters the grid.

4. **Content** — Tag only true immovables; use tiers for “large vs swarm” feel. Add AbilityTest: large soft (or tiered) unit holds vs overlapping small softs.

5. **Out of scope for Phase 2 unless needed** — Multi-pass-per-tick; network sync of the grid.

---

## Phase 3 — Explicit mass

Weight override separate from radius, plugged into the existing weight API.

1. **API** — Extend `getCrowdSpacingWeight` (and optionally a def/instance field) so MVP call sites stay valid: default remains `radius`; optional mass/override wins when set. Document precedence (override → mass → radius).

2. **Resolve** — Soft–soft inverse-weight split already uses `getCrowdSpacingWeight`; no second formula. Soft–anchor unchanged (100% on soft). Unit-test: equal radius, higher mass moves less.

3. **Authoring** — Decide def-based vs instance override (see game-object-def-pattern). Prefer def for heavies that should not get the tag; instance for temporary buffs.

4. **Interaction with Phase 2** — Tier hierarchy and mass are independent levers: tier can decide who may be pushed; mass decides how far. Implementing plan should state whether tier alone is enough for a content case before adding mass.

5. **Regression** — Keep `crowd_spacing_pack_and_anchors` green; add a mass-specific general or unit test. Still one pass per tick unless a later phase explicitly revisits that.
