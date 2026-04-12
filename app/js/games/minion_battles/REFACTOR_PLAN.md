# Minion Battles — Architecture Refactor Plan

**Goal:** Reorganize the `minion_battles/` directory structure to match the target
architecture described in `AGENTS.md`.

**Baseline:** 58 tests passing across 9 test files. All tests must pass after every step.

**Principle:** Move files first (preserving git history via `git mv`), update imports,
then do behavioral refactoring in later phases.

---

## Current → Target directory mapping

| Current path | Target path | Import count |
|---|---|---|
| `engine/*` | `game/*` | ~65 imports across codebase |
| `engine/managers/*` | `game/managers/*` | (included above) |
| `engine/deathEffects/*` | `game/deathEffects/*` | (included above) |
| `engine/unitDef.ts` | `game/units/unit_defs/unitDef.ts` | (included above) |
| `objects/GameObject.ts` | `game/GameObject.ts` | ~55 imports across codebase |
| `objects/Unit.ts` | `game/units/Unit.ts` | (included above) |
| `objects/units/*` | `game/units/*` | (included above) |
| `objects/units/unitAI/*` | `game/units/unitAI/*` | (included above) |
| `objects/Effect.ts` | `game/effects/Effect.ts` | (included above) |
| `objects/Projectile.ts` | `game/projectiles/Projectile.ts` | (included above) |
| `objects/SpecialTile.ts` | `game/specialTiles/SpecialTile.ts` | (included above) |
| `constants/unitConstants.ts` | `game/units/unit_defs/unitConstants.ts` | few |
| `components/*` | `ui/components/*` | ~8 imports |
| `components/CharacterEditor/*` | `ui/components/CharacterEditor/*` | (included above) |
| `phases/*` | `ui/pages/*` | ~5 imports (from Game.tsx) |

---

## Phase 0 — Preparation
> _Subagent call: 1 step. No testing checkpoint needed._

- [x] **0.1** Create the target directory scaffolding (empty dirs):
  ```
  game/
  game/managers/
  game/deathEffects/
  game/units/
  game/units/unit_defs/
  game/units/dark_animals/
  game/units/unitAI/
  game/units/unitAI/default/
  game/units/unitAI/alphaWolfBoss/
  game/units/unitAI/aggroWander/
  game/effects/
  game/projectiles/
  game/specialTiles/
  ui/
  ui/components/
  ui/components/CharacterEditor/
  ui/pages/
  ```

---

## Phase 1 — Move `engine/` → `game/`
> _The largest move. ~20 files, ~65 import sites to update._
> _Split into 3 subagent calls to keep each manageable._

### Step 1.1 — Move engine core files to `game/`
> _Subagent call 1 of 3_

- [x] `git mv` the following files from `engine/` to `game/`:
  - `GameEngine.ts`
  - `Camera.ts`
  - `EventBus.ts`
  - `LightGrid.ts`
  - `EngineContext.ts`
  - `types.ts`
  - `teams.ts`
  - `forceMove.ts`
  - `AbilityNote.ts`
  - `effectDef.ts`
  - `effectImages.ts`
- [x] Update all imports across the codebase that referenced `engine/` for these files
- [x] Run tests — must pass

### Step 1.2 — Move engine subdirectories to `game/`
> _Subagent call 2 of 3_

- [x] `git mv engine/managers/* game/managers/`
  - `UnitManager.ts`, `CardManager.ts`, `EffectManager.ts`,
    `ProjectileManager.ts`, `LevelEventManager.ts`, `SpecialTileManager.ts`
- [x] `git mv engine/deathEffects/* game/deathEffects/`
  - `DeathEffect.ts`, `ParticleExplosion.ts`
- [x] Update all imports referencing `engine/managers/` → `game/managers/`
- [x] Update all imports referencing `engine/deathEffects/` → `game/deathEffects/`
- [x] Run tests — must pass

### Step 1.3 — Move GameRenderer, unitDef, test files, and clean up
> _Subagent call 3 of 3_

- [x] `git mv engine/GameRenderer.ts game/GameRenderer.ts`
- [x] `git mv engine/unitDef.ts game/units/unit_defs/unitDef.ts`
- [x] `git mv` test files:
  - `engine/GameEngine.test.ts` → `game/GameEngine.test.ts`
  - `engine/Camera.test.ts` → `game/Camera.test.ts`
  - `engine/twoPlayerOrders.test.ts` → `game/twoPlayerOrders.test.ts`
- [x] `git mv engine/SKILL.md game/SKILL.md` (if it exists)
- [x] Update all imports for the moved files
- [x] Delete empty `engine/` directory
- [x] Run tests — must pass

### 🧪 CHECKPOINT A — Manual testing
> After Phase 1: start dev server (`npm run dev` + `php -S localhost:8000 index.php`),
> create a lobby, start a mission, verify battle loads and renders correctly.
> All engine functionality should work identically — only file paths changed.

---

## Phase 2 — Move `objects/` → `game/`
> _~15 files, ~55 import sites. Split into 3 subagent calls._

### Step 2.1 — Move `GameObject.ts` and `Unit.ts` + unit factories
> _Subagent call 1 of 3_

- [x] `git mv objects/GameObject.ts game/GameObject.ts`
- [x] `git mv objects/Unit.ts game/units/Unit.ts`
- [x] `git mv objects/units/index.ts game/units/index.ts`
- [x] `git mv objects/units/WarriorUnit.ts game/units/WarriorUnit.ts`
- [x] `git mv objects/units/RangerUnit.ts game/units/RangerUnit.ts`
- [x] `git mv objects/units/MageUnit.ts game/units/MageUnit.ts`
- [x] `git mv objects/units/HealerUnit.ts game/units/HealerUnit.ts`
- [x] `git mv objects/units/GenericEnemy.ts game/units/GenericEnemy.ts`
- [x] `git mv objects/units/dark_animals/DarkWolf.ts game/units/dark_animals/DarkWolf.ts`
- [x] Update all imports
- [x] Run tests — must pass

### Step 2.2 — Move unitAI tree
> _Subagent call 2 of 3_

- [x] `git mv` all files from `objects/units/unitAI/` → `game/units/unitAI/`
  - Root: `types.ts`, `contextTypes.ts`, `contextBase.ts`, `index.ts`, `runner.ts`, `utils.ts`, `SKILL.md`
  - `default/`: `context.ts`, `index.ts`, `default_idle.ts`, `default_attack.ts`, `default_wander.ts`, `default_findLight.ts`, `default_siegeDefendPoint.ts`
  - `alphaWolfBoss/`: `context.ts`, `index.ts`, `alphaWolfBoss_idle.ts`, `alphaWolfBoss_attack.ts`
  - `aggroWander/`: `context.ts`, `index.ts`, `aggroWander_wander.ts`, `aggroWander_attack.ts`
  - Test: `DefaultAITree.test.ts`
- [x] Update all imports
- [x] Run tests — must pass

### Step 2.3 — Move Effect, Projectile, SpecialTile, clean up
> _Subagent call 3 of 3_

- [x] `git mv objects/Effect.ts game/effects/Effect.ts`
- [x] `git mv objects/Projectile.ts game/projectiles/Projectile.ts`
- [x] `git mv objects/SpecialTile.ts game/specialTiles/SpecialTile.ts`
- [x] `git mv` test files:
  - `objects/Unit.test.ts` → `game/units/Unit.test.ts`
  - `objects/Effect.test.ts` → `game/effects/Effect.test.ts`
  - `objects/Projectile.test.ts` → `game/projectiles/Projectile.test.ts`
- [x] Update all imports
- [x] Delete empty `objects/` directory tree
- [x] Run tests — must pass

### 🧪 CHECKPOINT B — Manual testing
> Same as Checkpoint A: full game flow (lobby → character select → mission → battle).
> Verify units spawn, move, attack, die. Verify effects and projectiles render.

---

## Phase 3 — Move `constants/unitConstants.ts` → `game/units/unit_defs/`
> _Subagent call: 1 step. Small move with few importers._

- [x] `git mv constants/unitConstants.ts game/units/unit_defs/unitConstants.ts`
- [x] Update all imports (primarily `engine/GameRenderer.ts`, `objects/Unit.ts`, a few card_defs)
- [x] Keep `constants/enemyConstants.ts` and `constants/npcs.ts` where they are (not part of target move)
- [x] Run tests — must pass

---

## Phase 4 — Move `components/` → `ui/components/`
> _Subagent call: 1 step. ~15 files, only ~8 import sites._

- [x] `git mv` all files from `components/` → `ui/components/`:
  - `BattleCanvas.tsx`, `BattleTimeline.tsx`, `CardHand.tsx`, `CardComponent.tsx`,
    `CardTooltip.tsx`, `CardDescription.tsx`, `TimelinePhaseSegment.tsx`,
    `RoundProgressBar.tsx`, `TurnIndicator.tsx`, `VictoryModal.tsx`,
    `ResearchTreePanel.tsx`, `AdminPlayersPanel.tsx`, `VNTextBox.tsx`,
    `StoryTextEffect.tsx`, `CharacterPortrait.tsx`
- [x] `git mv components/CharacterEditor/* ui/components/CharacterEditor/`
  - `CharacterEditor.tsx`, `CharacterCreator.tsx`, `InventoryPanel.tsx`,
    `InventoryGrid.tsx`, `InventoryItemCard.tsx`
- [x] Update all imports (mostly in `phases/` and `Game.tsx`)
- [x] Delete empty `components/` directory
- [x] Run tests — must pass

---

## Phase 5 — Move `phases/` → `ui/pages/`
> _Subagent call: 1 step. ~6 files, only Game.tsx imports them._

- [x] `git mv` all files from `phases/` → `ui/pages/`:
  - `BattlePhase.tsx`, `MissionSelectPhase.tsx`, `CharacterSelectPhase.tsx`,
    `PreMissionStoryPhase.tsx`, `PostMissionStoryPhase.tsx`
  - Test: `snapshotLoad.test.ts`
- [x] Update imports in `Game.tsx` (the only importer of phase files)
- [x] Delete empty `phases/` directory
- [x] Run tests — must pass

### 🧪 CHECKPOINT C — Manual testing
> Full game flow again. All UI components and phase screens should render correctly.
> This is the last file-move checkpoint — the directory structure now matches the target.

---

## Phase 6 — Update documentation and skills
> _Subagent call: 1 step. No code changes, just docs._

- [x] Update `AGENTS.md` — change "Current layout" table to reflect the new paths
- [x] Update `AGENTS.md` — remove "Target layout (migration not yet started)" table
  (or mark as "Complete" and keep for reference)
- [x] Update any `.cursor/skills/` files that reference old paths
  (e.g. `working-on-minion-battles/SKILL.md`, `game-engine/SKILL.md`)
- [x] Update root-level `AGENTS.md` file paths table
- [x] Run tests — must pass (no code changes, but verify nothing broke)

### 🧪 CHECKPOINT D — Verify documentation
> Spot-check that skill files and agent guides reference correct paths.

---

## Phase 7 — Create `api/` directory (new code)
> _Subagent call: 1 step. Extract minion-battles-specific API calls._

- [ ] Create `api/` directory under `minion_battles/`
- [ ] Extract minion-battles-specific methods from `LobbyClient.ts` into
  `api/minionBattlesApi.ts` (or similar)
- [ ] Define DTO types for game state payloads in `api/types.ts`
- [ ] Update callers (Game.tsx, phases) to use the new API module
- [ ] Run tests — must pass

### 🧪 CHECKPOINT E — Manual testing
> Verify all API calls work: create lobby, join, start game, checkpoint save/load.

---

## Phase 8 — Extract `BattleSession` from `BattlePhase` (refactor)
> _Subagent calls: 2-3 steps. This is the biggest behavioral refactor._

### Step 8.1 — Create `BattleSession` class skeleton
- [ ] Create `game/BattleSession.ts` with:
  - Constructor taking mission def + player ID
  - `loadFromSnapshot(state)`, `loadFreshMission(mission)`
  - `getEngine()`, `getCamera()`, `getRenderer()`
  - `submitOrder(order)`, `skipTurn()`
  - `getSnapshot()`, `applyRemoteOrders()`, `fullResync()`
  - `destroy()`
  - Typed event emitter for UI events (waitingForOrders, roundChanged, etc.)
- [ ] Run tests — must pass (class exists but not yet wired)

### Step 8.2 — Migrate engine lifecycle from BattlePhase into BattleSession
- [ ] Move engine creation/destruction from BattlePhase into BattleSession
- [ ] Move `loadGameState` logic into session methods
- [ ] BattlePhase creates BattleSession on mount, destroys on unmount
- [ ] BattlePhase subscribes to session events for React state
- [ ] Run tests — must pass

### Step 8.3 — Migrate sync bridge to BattleSession
- [ ] Move BattleCallbacks registration to use session methods
- [ ] Move order submission through session
- [ ] Move checkpoint handling through session
- [ ] Clean up removed refs from BattlePhase
- [ ] Run tests — must pass

### 🧪 CHECKPOINT F — Manual testing
> Full multiplayer flow: host starts battle, non-host joins, orders sync,
> checkpoint save/load, reconnection. This validates the session extraction.

---

## Phase 9 — Extract `GameState` from `GameEngine` (refactor)
> _Subagent calls: 2 steps._

### Step 9.1 — Create `GameState` data aggregate
- [ ] Create `game/GameState.ts` with manager ownership and collections
- [ ] `GameEngine` delegates data ownership to `GameState`
- [ ] Serialization (`toJSON`/`fromJSON`) stays coordinated by `GameEngine`
  but reads from `GameState`
- [ ] Run tests — must pass

### Step 9.2 — Clean separation of "what" vs "when"
- [ ] Move remaining data fields from `GameEngine` to `GameState`
- [ ] Ensure `GameEngine` only has orchestration (tick, scheduling, step order)
- [ ] Run tests — must pass

### 🧪 CHECKPOINT G — Manual testing
> Same as Checkpoint F. Full game flow + multiplayer sync.

---

## Summary of subagent calls

| # | Phase | Step | Description | Files moved | Import updates |
|---|-------|------|-------------|-------------|----------------|
| 1 | 0 | 0.1 | Create directory scaffolding | 0 | 0 |
| 2 | 1 | 1.1 | Move engine core → game/ | 11 | ~40 |
| 3 | 1 | 1.2 | Move engine subdirs → game/ | 8 | ~15 |
| 4 | 1 | 1.3 | Move GameRenderer, unitDef, tests | 5-6 | ~15 |
| 5 | 2 | 2.1 | Move GameObject, Unit, unit factories | 9 | ~40 |
| 6 | 2 | 2.2 | Move unitAI tree | ~18 | ~10 |
| 7 | 2 | 2.3 | Move Effect, Projectile, SpecialTile | 6 | ~20 |
| 8 | 3 | 3.1 | Move unitConstants → unit_defs/ | 1 | ~5 |
| 9 | 4 | 4.1 | Move components/ → ui/components/ | ~20 | ~8 |
| 10 | 5 | 5.1 | Move phases/ → ui/pages/ | 6 | ~5 |
| 11 | 6 | 6.1 | Update docs and skills | 0 | 0 |
| 12 | 7 | 7.1 | Create api/ directory | new files | ~5 |
| 13 | 8 | 8.1 | BattleSession skeleton | new file | 0 |
| 14 | 8 | 8.2 | Migrate engine lifecycle | 0 | ~10 |
| 15 | 8 | 8.3 | Migrate sync bridge | 0 | ~5 |
| 16 | 9 | 9.1 | GameState data aggregate | new file | ~10 |
| 17 | 9 | 9.2 | Clean GameEngine separation | 0 | ~5 |

**Total: ~17 subagent calls, 7 manual testing checkpoints**

---

## Notes

- **Git history:** Always use `git mv` to preserve file history.
- **Import strategy:** After each `git mv` batch, use ripgrep to find all broken imports
  and update them. Pattern: `from ['"]\..*\/(old_dir)\/` → adjust to new path.
- **Intra-engine imports:** Files within `engine/` that import each other will change from
  `./X` to `./X` (same, since they move together) — no update needed for co-located files.
- **Test files move with their source:** Keep `.test.ts` files next to the code they test.
- **Non-moving directories:** `abilities/`, `buffs/`, `card_defs/`, `character_defs/`,
  `constants/` (except unitConstants), `hitboxes/`, `resources/`, `research/`,
  `storylines/`, `terrain/`, `utils/`, `assets/` stay where they are.
- **SKILL.md files:** Move alongside their parent directories.
