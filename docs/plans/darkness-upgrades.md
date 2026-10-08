# Darkness Upgrades

Per-player, admin-granted global upgrades that modify **all units on the field** and add **bonus mission rewards**. Tracked as a research tree (`darkness_upgrades`) so existing research UI/aggregation is reused, but stored in a **separate player-level field** (`darknessUpgrades`), not on `CampaignCharacter`. Only the **host's** upgrades count in battle (single resolver function so the policy is easy to change later).

First upgrade: **Empowered Spirits** (the "ghost" enemy is the **slime**: `characterId: 'slime'`, ability `0001` SlimeShot, `game/units/dark_animals/slimeRanged.ts`):
- Slimes get +12 max health.
- Slimes fire 2 additional projectiles in a wedge; targeting preview shows them as smaller, paler lines with **no narrowing effect**, length < 40 px + slime radius.
- Grants +2 of **each** resource at the end of a victorious mission (rolled into total mission rewards).

Do not confuse with `app/js/darknessStrength/` (campaign difficulty packages) — separate system. Name everything `darknessUpgrade*` / `darkness_upgrades`.

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never background), waits for each to finish, then reports plan completion to the user. Each worker implements **exactly one step**, checks off its items with a one-line summary, and **stops without spawning the next agent**.

Relevant project skills: `research-trees`, `working-on-minion-battles`, `creating-an-ability`, `editing-card-behaviour`, `game-engine`, `game-object-def-pattern`, `game-sync-data-flow`, `editing-and-creating-components`, `scoped-testing`, `ability-tests`.

Rules for every step:
- Per-step verification is limited to `npm run lint` (plus `npx tsc --noEmit` when the step crosses interface/type boundaries) and **only the specific test files the step touches or creates** (`npx vitest run path/to/That.test.ts`). **Never** run the full suite, whole directories, or AbilityTests in a regular step — that is the final step's job.
- Write the failing test first where the step lists tests (CLAUDE.md: Vitest, not Jest).
- Working tree has uncommitted edits (e.g. `0001Ability.ts`, `unitDef.ts`); build on top of them, never revert them.
- Line endings: files are CRLF in the working tree; preserve existing endings.

## Design decisions (already agreed)

- Stat keys: `enemy_unit_slime_max_health_bonus` (add 12) and `enemy_unit_slime_extra_projectiles` (add 2). General pattern: `enemy_unit_<characterId>_<stat>`.
- Storage: `darknessUpgrades: { researchTrees, researchNodeLevels, researchNodeSources }` on the player (same shapes as character research), defaulting to empty for legacy saves.
- `Empowered Spirits` node: `disabled: true` (admin-only), no cost.
- `bonusRewards`: optional `Partial<Record<CampaignResourceKey, number>>` on the node def. Victory only.
- Host-only: `resolveActiveDarknessUpgrades(lobby)` is the one place deciding whose upgrades count.

## Steps

### Step 1 — Types, stat keys, and node-def fields

Files: `app/js/researchTrees/types.ts`, `app/js/types.ts`

- [ ] Add `PassiveStatKey.EnemyUnitSlimeMaxHealthBonus = 'enemy_unit_slime_max_health_bonus'` and `PassiveStatKey.EnemyUnitSlimeExtraProjectiles = 'enemy_unit_slime_extra_projectiles'` to the enum in `researchTrees/types.ts`.
- [ ] Add optional `bonusRewards?: Partial<Record<CampaignResourceKey, number>>` to `ResearchNodeDef` (import/use the existing `CampaignResourceKey` type; check where it is defined and avoid circular imports).
- [ ] Add a `DarknessUpgradesState` type (`{ researchTrees: Record<string,string[]>; researchNodeLevels: ResearchNodeLevels; researchNodeSources: ResearchNodeSources }`) and an optional `darknessUpgrades?: DarknessUpgradesState` field on the player/account-level campaign state type in `app/js/types.ts` (next to where per-player research/campaign data lives; pick the same level as `campaignCharacters` owner data — inspect `CampaignState` and decide, documenting the choice in a comment). Export an `EMPTY_DARKNESS_UPGRADES` default.
- [ ] Run `npx tsc --noEmit` and `npm run lint`.

### Step 2 — Persistence (TS defaults + PHP)

Files: `app/js/darknessStrength/campaignFields.ts` (pattern reference only — put new code in `app/js/darknessUpgrades/campaignFields.ts`), `backend/Campaign.php`, `backend/Http/Handlers/UpdateCampaignHandler.php`, `app/js/LobbyClient.ts`, `app/js/App.tsx` (only if campaign payload plumbing requires it)

- [ ] Create `app/js/darknessUpgrades/campaignFields.ts` with `withDarknessUpgradesDefaults(...)` (legacy saves without the key get `EMPTY_DARKNESS_UPGRADES`) and `DARKNESS_UPGRADES_PATCH_KEYS`, mirroring `darknessStrength/campaignFields.ts`.
- [ ] Test first: `app/js/darknessUpgrades/campaignFields.test.ts` — defaults applied for missing key, existing value preserved, PATCH keys listed. Run `npx vitest run app/js/darknessUpgrades/campaignFields.test.ts`.
- [ ] Update `backend/Campaign.php` `toArray`/`fromArray` to persist `darknessUpgrades` with unknown-safe defaults (`{researchTrees:{},researchNodeLevels:{},researchNodeSources:{}}`), and `UpdateCampaignHandler.php` to accept the new PATCH key. Follow exactly how `darknessStrengthInstances` is handled. Wire `LobbyClient.ts` / `App.tsx` only where the existing darkness-strength fields are plumbed.
- [ ] Run `npx tsc --noEmit` and `npm run lint`.

### Step 3 — Darkness Upgrades tree, Empowered Spirits node, and aggregation

Files: `app/js/researchTrees/trees/darkness_upgrades.ts` (new), `app/js/researchTrees/list.ts`, `app/js/researchTrees/researchTreeChrome.ts`, `app/js/researchTrees/darknessUpgrades.ts` (new), `app/js/researchTrees/darknessUpgrades.test.ts` (new)

- [ ] Test first (`darknessUpgrades.test.ts`): (a) `computeDarknessUpgradeBonuses(darknessUpgrades)` returns `enemy_unit_slime_max_health_bonus.add === 12` and `enemy_unit_slime_extra_projectiles.add === 2` when Empowered Spirits is owned, and `{}` when not; (b) character `computePassiveBonuses` for a character that has *no* research is unaffected by owning the upgrade (storage separation); (c) `collectDarknessUpgradeBonusRewards(...)` returns 2 of **each** `CampaignResourceKey` for Empowered Spirits and `{}` when not owned.
- [ ] Create `trees/darkness_upgrades.ts`: tree id `darkness_upgrades`, title "Darkness Upgrades", `accessRequirements` such that non-admins never see the tree (reuse existing admin/`disabled` mechanics — check how `disabled` trees/nodes are filtered in `ResearchTreePanel`), node `empowered_spirits` with `disabled: true`, no cost, `passiveBonus` for both keys, `bonusRewards` = 2 of every resource key (derive from the resource key list, not hand-written), description/flavor text. Register in `list.ts` and add colour/icon in `researchTreeChrome.ts` (reuse an existing asset or `assets/tree-generic.png`).
- [ ] Create `researchTrees/darknessUpgrades.ts` exporting `DARKNESS_UPGRADES_TREE_ID`, `isDarknessUpgradeTree(treeId)`, `computeDarknessUpgradeBonuses(state)` (delegates to `computePassiveBonuses`, passing the darkness upgrade maps), and `collectDarknessUpgradeBonusRewards(state)` (sums `bonusRewards` of owned nodes, scaled per level if levelled).
- [ ] Ensure `computePassiveBonuses` for character research ignores the `darkness_upgrades` tree (it iterates `RESEARCH_TREES`; character calls must skip this tree so owning a darkness node in character storage can never leak) — add a test in the same file.
- [ ] Run `npx vitest run app/js/researchTrees/darknessUpgrades.test.ts`, then `npx tsc --noEmit` and `npm run lint`.

### Step 4 — Research UI and admin grant/revoke storage switch

Files: `app/js/games/minion_battles/ui/components/ResearchTreePanel.tsx`, `app/js/games/minion_battles/ui/components/CharacterEditor/CharacterEditor.tsx`, `app/js/games/minion_battles/ui/components/CharacterEditor/StatBonusesTab.tsx`, plus one test file `app/js/researchTrees/darknessUpgradesAdmin.test.ts` (new, pure-logic helpers only)

- [ ] Add pure helpers (in `researchTrees/darknessUpgrades.ts` or a sibling) `grantDarknessUpgradeNode(state, nodeId)` / `revokeDarknessUpgradeNode(state, nodeId)` that update `researchTrees`, `researchNodeLevels`, and `researchNodeSources` (source `ResearchSource.Admin`). Test first in `darknessUpgradesAdmin.test.ts`: grant adds node + source, revoke removes it and cleans empty entries, non-admin flag cannot grant (pure `canInteractWithDarknessUpgradeTree(isAdmin)`).
- [ ] In `CharacterEditor.tsx`/`ResearchTreePanel.tsx`, when `isDarknessUpgradeTree(tree.id)`: read owned/level/source data from the player's `darknessUpgrades` instead of the character, route admin shift-grant/revoke through the helpers above, persist via the campaign PATCH key from Step 2, and render the tree only for admins (non-admins cannot see or interact). Keep changes minimal — branch on tree id at the data source/callback boundary rather than forking components.
- [ ] `StatBonusesTab.tsx`: add friendly labels for the two new stat keys (and make sure darkness keys never show in a character's own bonuses).
- [ ] Run `npx vitest run app/js/researchTrees/darknessUpgradesAdmin.test.ts`, then `npx tsc --noEmit` and `npm run lint`.

### Step 5 — Host-only resolution and engine plumbing

Files: `app/js/researchTrees/darknessUpgrades.ts` (add resolver), `app/js/games/minion_battles/game/GameEngine.ts`, `app/js/games/minion_battles/game/GameState.ts`, `app/js/games/minion_battles/game/BattleSession.ts` and/or the lobby→engine setup site (find where `activeDarknessStrengths` is assigned at battle start), `app/js/researchTrees/darknessUpgradesHost.test.ts` (new)

- [ ] Test first (`darknessUpgradesHost.test.ts`): `resolveActiveDarknessUpgrades(lobby)` returns the **host's** upgrade bonuses even when a non-host player also owns Empowered Spirits, ignores a non-host's upgrades when the host has none, and returns `{}` when the host has none. Determine from the lobby/player model how the host is identified (check `LobbyClient.ts`, lobby types) and note it in the function's doc comment: "Only the host's upgrades count — change here to alter policy."
- [ ] Implement `resolveActiveDarknessUpgrades(lobby)` returning a `PassiveBonuses` bag (and the list of active node ids for reward display).
- [ ] Add `darknessUpgradeBonuses: PassiveBonuses` to `GameState` + `GameEngine` getter/setter, **serialized and restored in engine checkpoints** next to `activeDarknessStrengths` (`GameEngine.ts` serialize ~line 1994 / deserialize ~line 2057) so recovery/refresh stays in sync (see `game-sync-data-flow` skill — recovery vs refresh pitfalls). Set it at battle start where `activeDarknessStrengths` is set.
- [ ] Add a serialization round-trip assertion to the host test file (checkpoint → restore keeps the bag).
- [ ] Run `npx vitest run app/js/researchTrees/darknessUpgradesHost.test.ts`, then `npx tsc --noEmit` and `npm run lint`.

### Step 6 — Apply upgrades to units at spawn (slime +12 max health)

Files: `app/js/games/minion_battles/game/units/spawning/spawnUnit.ts`, `app/js/games/minion_battles/game/units/spawning/spawnUnit.test.ts` (existing — add cases)

- [ ] Test first in `spawnUnit.test.ts`: with `engine.darknessUpgradeBonuses = { enemy_unit_slime_max_health_bonus: {add: 12, mult: 1} }`, a spawned **enemy** slime has max health `base + 12` (use `applyPassiveBonusToBase` semantics, integer floor); a player-team unit or a non-slime enemy is unchanged; with an empty bag nothing changes. Mirror the existing `DS_ENEMY_HARDENED_MAX_HEALTH_MULT` test at ~line 331 for setup.
- [ ] In `spawnUnit.ts`, for enemy-team units look up `enemy_unit_<characterId>_max_health_bonus` in `engine.darknessUpgradeBonuses` and bake it into the unit's max health the same place/way DarknessStrength `statBuff` is baked (mirror `darknessStrength/compile.ts` ordering so the two systems compose). Keep it generic across characterIds.
- [ ] Run `npx vitest run app/js/games/minion_battles/game/units/spawning/spawnUnit.test.ts`, then `npx tsc --noEmit` and `npm run lint`.

### Step 7 — SlimeShot wedge projectiles and targeting preview

Files: `app/js/games/minion_battles/card_defs/0001_SlimeShot/0001Ability.ts` (has uncommitted edits — build on them), `app/js/games/minion_battles/card_defs/0001_SlimeShot/0001Ability.test.ts` (existing or new), `app/js/games/minion_battles/game/GameRenderer/renderers/PreviewRenderer.ts`, plus a small pure helper and test: `app/js/games/minion_battles/card_defs/0001_SlimeShot/slimeWedge.ts` / `slimeWedge.test.ts`

- [ ] Test first (`slimeWedge.test.ts`): `computeSlimeWedgeDirections(aimAngle, extraCount)` returns `extraCount` angles symmetric around the aim angle (for 2: one each side), and `getSlimeWedgePreviewLength(slimeRadius)` is `< 40 + slimeRadius` (define a `SLIME_WEDGE_PREVIEW_MAX_LENGTH = 40` constant).
- [ ] Test first (`0001Ability.test.ts`): a slime with the Empowered Spirits bag (`enemy_unit_slime_extra_projectiles.add === 2`) fires **3** projectiles total (1 main + 2 wedge), without the bag fires 1. Follow the multi-order ability-test pattern from the `ability-tests` skill; read the bag via the engine's `darknessUpgradeBonuses`. Extra projectiles use the same damage as the main shot unless the existing ability defines otherwise.
- [ ] Implement in `0001Ability.ts` using the helper; use existing projectile-spawn/hitbox infrastructure (see `working-with-hitboxes`, `creating-an-ability`), respecting the existing uncommitted changes.
- [ ] `PreviewRenderer.ts` / the SlimeShot preview spec: draw the extra wedge lines **smaller and paler** than the main targeting line, **without** the narrowing effect, with length from `getSlimeWedgePreviewLength`. Keep the change inside the existing preview path (check `game/interaction/AGENTS.md` and `hitbox-spec-targeting-refactor.md` for the conventions); only show them when the bonus is active.
- [ ] Run `npx vitest run` on the two new/edited test files above only, then `npx tsc --noEmit` and `npm run lint`.

### Step 8 — Bonus rewards at mission end and Victory modal

Files: `app/js/games/minion_battles/Game.tsx`, `app/js/games/minion_battles/ui/components/VictoryModal.tsx`, `app/js/games/minion_battles/ui/pages/PostMissionStoryPhase.tsx` (only if it displays totals), `app/js/researchTrees/darknessUpgradeRewards.ts` (new) + `darknessUpgradeRewards.test.ts` (new)

- [ ] Test first (`darknessUpgradeRewards.test.ts`): `mergeDarknessUpgradeRewards(resourceDelta, activeUpgradeRewards, victory)` — on victory adds each upgrade's `bonusRewards` into the total and returns per-upgrade line items `{ nodeId, title, delta }`; on defeat returns the input unchanged and no line items; does not mutate inputs; empty when no upgrades active; Empowered Spirits yields +2 for every resource key.
- [ ] Implement the pure merge function; call it in `Game.tsx` where `rewards.resourceDelta` is consumed (~line 723, `onComplete`) using the **host's** active upgrades from Step 5, so the merged total is what gets applied to campaign resources; ensure only the host path applies it (no double-grant in multiplayer — check how `resourceDelta` is currently applied per client and keep that behaviour).
- [ ] `VictoryModal.tsx`: show a line item per active upgrade ("Empowered Spirits: +2 each resource") included in the displayed total, consistent with the existing `missionRewards.resourceDelta` display (~lines 85–93).
- [ ] Run `npx vitest run app/js/researchTrees/darknessUpgradeRewards.test.ts`, then `npx tsc --noEmit` and `npm run lint`.

### Step 9 — Final verification (run expensive checks once)

Files: `app/js/games/minion_battles/testing/` ability-test scenario file for Empowered Spirits (follow the `ability-tests` skill for location/registration)

- [ ] Add one high-level AbilityTest scenario, "Empowered Spirits": tiny battle with an enemy slime and a player target, `darknessUpgradeBonuses` set to the Empowered Spirits bag; assert deterministically that the slime has +12 max health and that a single SlimeShot cast results in 3 projectiles (one wedge to each side). Keep it fast and feature-level, not number-level beyond those two facts.
- [ ] Run the new AbilityTest scenario (headless runner per `ability-tests` skill) plus the existing SlimeShot / slime-related AbilityTest scenarios once.
- [ ] Run the broad regression once: `npx vitest run --changed` (or `npm run test` if the change set is large), then `npx tsc --noEmit` and `npm run lint`. Fix any failures attributable to this plan.
- [ ] Manual browser checklist (use the built-in browser if feasible; otherwise list as pending for the user): as admin, open the Darkness Upgrades tree and grant/revoke Empowered Spirits; as a non-admin the tree is not visible; start a mission as host with the upgrade — slime has +12 HP, targeting preview shows two short pale wedge lines with no narrowing, SlimeShot fires 3 projectiles; win the mission — Victory modal shows the Empowered Spirits line item and +2 of each resource is added to the total; reload mid-battle (refresh/recovery) — bonuses persist.
