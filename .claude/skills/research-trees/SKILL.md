---
name: research-trees
description: Research tree definitions, node structure, evaluator logic, and the Upgrades tab UI in the Character Editor. Use when adding or modifying research trees, nodes, costs/requirements/effects, or the Upgrades tab rendering in Minion Battles.
---

# Research Trees & Upgrades UI

## Concept

The **Upgrades** tab in the Character Editor displays research trees. Each tree is a set of nodes; each node has prerequisites, exclusions, requirements, a cost, and effects that modify a character's abilities or equipment.

Research trees are a **meta-game** system — they belong to campaign characters, not to battles. **Design principle: apply research effects before battle starts, not during.** Round-start passives that used to be read from research in `GameEngine` (Charged Rocks' Light Charge) are now **item passives**: `ItemDef.roundStartRecoveryCharges`, copied onto the unit by `BaseMissionDef.collectRoundStartRecoveryCharges` before battle and applied by `GameEngine.applyItemRoundStartRecoveryCharges` each round start. The engine no longer looks up research for this.

## Equipment vs research (binding model)

- **Equipment grants abilities; research only modifies them** (`addCard` / `replaceCard` / `removeCard`, modifiers, passives, pets). **Research never grants equipment**, except core swaps: `replaceEquippedItem` is core-only (e.g. BasicCore to an X core). `equipItem`, `addExtraCardsFromItem` and `overrideCurrentEquipment` no longer exist. **Weapon upgrades are items, not research**: the old swap nodes (`charged_rocks`, `throwing_knives`, `craft_sword`, `pipe_bat`, `crystal_embedded_shield`, `throwing_crystal_shield`) are retired. Charged Rocks, Knives, Sword, Mace, Crystal Shield and Charged Shield are items `011`-`016`, equipped through mission rewards (see below) and migrated from old saves by `M0003EquipmentUpgradeRewards`.
- Equipment is unlocked at campaign level and changed outside research; see the **campaign-characters** skill.
- **Earth Core gives no bonus Throw Rock.** Rock throws come only from equipping Rocks; Earth's `replaceCard` still upgrades that throw when no weapon item claims it.

### Bound trees, virtual roots, active research

- `ResearchTreeDef.boundItem = { itemId, rootNodeId }` marks a **weapon tree**. `itemId` is a `string | readonly string[]` (`getBoundItemIds(tree)` in `researchTrees/types.ts`): the tree is active while **any** bound item is equipped. Trees without `boundItem` (cores, training, misc) are always active.
- **One tree per equipment item**: Rocks / Stick / Shield keep the old ids `crystal_rocks` / `stick_sword` / `tech_shield`; the upgrade items have `charged_rocks_item`, `knives_item`, `sword_item`, `mace_item`, `crystal_shield_item`, `charged_shield_item`. Ids and node constants live in `trees/weaponTreeIds.ts`. **Shared family trees** bind several items: `thrown_weapons` (Charged Rocks + Knives; More Rock) and `melee_weapons` (Sword + Mace; Iron Wrists), deliberately excluding the base Rocks / Stick. Moved follow-up nodes (`more_power`, `piercing_knives`, `sword_jagged_edge`, `pipe_bat_damage`, `extra_shields`, `more_rock`, `sword_extra_uses`) kept their node ids; only their tree changed.
- **`'equipment'` tag**: every equipment tree carries `['weapon', 'equipment']`. `sortResearchTreesByPlayerAbilities` puts equipment-tagged trees **after** all other trees in the Upgrades sidebar (stable within each group, ability-match first). Bound trees with no non-root nodes are hidden from players (`isPlayerVisibleResearchTree`); admins still see them dimmed.
- Cross-tree requirements on equipment use `characterHasEquippedItem` (e.g. Charging Punch needs Charged Rocks `011`, Imbued Mace needs Mace `014`).
- The `rootNodeId` is a **free virtual root**: no effects, requirements or exclusivity; it counts as researched while the tree is active and is never persisted. Roots no longer exclude each other (there is no starting-weapon exclusivity).
- Switching weapons does not delete research: the stored research is never rewritten, the inactive tree is just ignored and applies again if its weapon is re-equipped.
- **Active research** = stored research minus inactive bound trees plus virtual roots (`researchTrees/activeResearch.ts`; per-player batch helpers in `character_defs/characterLoadout.ts`). The filter is idempotent. Every consumer reads active research: battle setup (`BattleSession.loadBattle` then `BaseMissionDef.initializeGameState`, and the engine's `ResearchManager`), Quest Prep / Prepare Carefully, Upgrades eligibility in `CharacterEditor.tsx`, and random research rewards. Purchase and reset still write **stored** research.

### One loadout resolver

`resolveCharacterLoadout(equipment, researchTrees)` in `character_defs/characterLoadout.ts` is the only place that turns equipment and research into abilities. Phases: active research, core swaps, item `cardsToAdd`, then card effects from **bound trees first**, then **unbound trees**; each phase applies `addCard`, `removeCard`, then chained `replaceCard` (`applyCardReplacements` follows `from` to `to` chains to a fixed point). Replacement maps are per phase, so a core tree cannot overwrite a weapon tree's swap.

## Definitions

All tree and node definitions live in `app/js/researchTrees/`:

- `types.ts` — `ResearchTreeDef`, `ResearchNodeDef`, `Requirement`, `ResearchEffect`
- `researchTreeChrome.ts` — shared tree colours and icons (`assets/tree-*.png`)
- `list.ts` — registry of all trees
- `evaluator.ts` — `canResearchNode`, `applyResearchEffects`, `prereqClosure`, `meetsRequirement`, `computeEffectiveResourcesForTree`, `getAvailableResearchNodes`
- `descriptiveValue.ts` — `DescriptiveValue` magnitude labels (Tiny/Small/Medium/Large/Huge)
- `trees/` — one file per tree; each exports its tree ID constants and a `ResearchTreeDef`
- `researchCostPolicy.ts` — core-tree total/floor targets (Light has its own curve)
- `weaponResearchCosts.ts` — standard vs premium metal for starting-weapon trees

Each tree has `colour` and `icon`. Cards and the Upgrades sidebar use those fields — do not keep a separate research-type enum.

### Campaign costs
Starting-weapon root nodes are free virtual roots. Stick & Sword, Tech Shield, and Throw Rock upgrades are metal-only (standard vs premium in `weaponResearchCosts.ts`). Core trees except Light follow `researchCostPolicy.ts`: about 20 total at tier 10 and about 30 at tier 15, interpolated between, with variety; tier 10 ≥ 10 crystals and 5 food; tier 15 ≥ 15 crystals and 5 food. Remaining lean: Earth → metal, Command → food, Gravity → crystals, Blood Mage → crystals and food. **Do not retune Light.**

### Node relationships
- `prereqNodeIds` — nodes that must be researched before this one is available
- `exclusiveWithNodeIds` — nodes that conflict; only one of the group may be researched
- `draft` — when `true`, the node is WIP: hidden from Upgrades selection UI and excluded from `getAvailableResearchNodes` / filter-style mission reward discovery
- `disabled` — when `true`, hidden from non-admins (Upgrades graph/grid and discovery). Admins still see the node and can grant it.

### Persistence
Research is stored on `CampaignCharacter` as `researchTrees` (node ids), `researchNodeLevels`, and `researchSources` (per-level `Purchased` / `Admin` / `QuestReward`). Missing sources on legacy characters count as Purchased. Effective resources subtract **only Purchased** costs. Mission/quest grants persist `QuestReward`; plain clicks on Upgrades persist `Purchased` (admins included: costs and requirements apply); **Shift+click as admin** persists `Admin` and grants that node even when it would not be available to the player (skips cost, requirements, prereqs, exclusivity, and disabled-node checks; does not auto-grant prereqs). The Upgrades Resources row has **Reset Research** (strips Purchased) and an admin-only **Reset Admin Research** button.

## Querying available nodes

`getAvailableResearchNodes(researchedTrees, { treeId?, tier? })` in `evaluator.ts` returns nodes the character hasn't researched yet and can structurally unlock:
- all `prereqNodeIds` are satisfied
- no `exclusiveWithNodeIds` entry has been researched
- `anyResearched` / `notResearched` requirements pass

External requirements (accountKnowledge, equipment, costs) are intentionally ignored — the function needs no account or character context. Pass `treeId` to scope to one tree, `tier` to scope to one display tier. Both are optional.

## Mission reward slots (`researchRewardSlots`)

Post-mission choice phrases can set `researchRewardSlots` on a `ChoicePhrase` instead of hard-coding `options`. The resolver (`storylines/researchRewardSlots.ts`) turns each slot into one `StoryChoiceOptionRow`.

Two slot forms (defined in `storyTypes.ts` as `ResearchRewardSlot`):
- **Specific** (`treeId` + `nodeId`): always resolves to that exact node. Prereqs and exclusivity are intentionally bypassed — this is a deliberate designer grant.
- **Filter** (no `nodeId`): picks the first unresearched node matching optional `treeId` and `minTier`/`maxTier`. By default also enforces `prereqNodeIds` and `exclusiveWithNodeIds` so players only see nodes they could structurally unlock. Set `respectRequirements: false` on the slot to revert to bypass behaviour.

Both forms check `node.requirements` (e.g. `characterHasEquippedItem`, `anyResearched`). Neither checks cost — mission rewards bypass cost gating.

**Random (filter) slots depend on what is equipped:** the resolver computes active research first, so `treeOpenForRandomReward` is false for an inactive bound tree even if it holds stored research, and virtual roots satisfy prerequisites. Specific slots are unchanged. `grant_research_conditional` / `skipIfResearched` in the story phases also read active research.

**Adding a requirement to a node**: if a node should only appear as a randomized reward when certain conditions are met (e.g. a tier-2 upgrade that prereqs a core node), add an `anyResearched` entry to `node.requirements` mirroring the structural `prereqNodeIds`. Example:
```ts
requirements: [{ type: 'anyResearched', treeId: MY_TREE_ID, nodeIds: [MY_NODE_CORE] }],
```

## Pre-battle application

Research effects are applied to player units in `storylines/BaseMissionDef.ts`, from **active** research (derived at the top of `initializeGameState`; abilities via `resolveCharacterLoadout`):
- Stat bonuses (health, damage, stamina recovery) via research callback helpers
- Ability runtime modifiers via `applyXxxResearchToAbilityRuntime(unit, getResearchNodes)`

When adding new research effects that affect battle, wire them here — not via in-battle lookups.

`AbilityModifier` fields live in `researchTrees/types.ts`. Flat cost changes use `resourceCostFlat` (added to the ability's primary resource cost at spend/display time via `getAbilityResourceCosts(ability, unit)`).

## Upgrades Tab UI

Components (all under `app/js/games/minion_battles/ui/components/`):

| Component | Role |
|-----------|------|
| `CharacterEditor.tsx` | Hosts the Upgrades tab; passes character + campaign state down |
| `ResearchTreePanel.tsx` | Outer container for the tab content |
| `ResearchTreeList` | Sidebar selector listing eligible trees with node-count badges |
| `ResearchTreeContent` | SVG graph rendering nodes at their `(x, y)` positions with edges |
| `ResearchedNodesGrid` | Shared Upgrades right-panel grid: eligible, possessed, and (admins) remaining unowned; sorted by node tier |
| `researchNodeGrid.ts` | Sort-by-tier helpers, missing-prereq line text, eligible / possessed / unowned collections |
| `ResearchNodeCard.tsx` | **ResearchNodeCard** — tree icon + title, 3-line description, medium cost pills, optional requirements strip. Admin comfortable cards add an in-flow id/source/tier footer (taller than player cards). Border colour comes from the owning tree. |

### Node states
`researched` · `enabled` · `blocked` · `default`

### Upgrades grid cards
Comfortable **ResearchNodeCard**s share one height: title, a reserved 3-line description, medium ResourcePill costs, then a fixed-height requirements wrapper (dark 2-line strip while any listed clause is unsatisfied; empty wrapper of the same height when hidden). Eligible cards omit that slot. Admin cards add an in-flow id/source/tier footer and are slightly taller. The strip lists unsatisfied research clauses (`prereqNodeIds` + `anyResearched`) with CSS ellipsis; multi-node `anyResearched` is one `(A or B)` clause, green if any option is owned. Hover lists every clause (unmet red, met green). The grid starts with **Resources** (effective campaign pills), then **Eligible research** (prereqs + non-cost requirements met, cost ignored), then **Possessed research**, then (admins) **Unowned research** excluding eligible. All lists sort by `tier` (then `order`). Cards the player can afford (`canResearchNode`) use a pointer cursor and click to purchase. Admins Shift+click to grant a node even when it is not normally available; unaffordable or locked cards stay non-pointer but remain clickable for that grant.

### Eligibility gating
`eligibleResearchTrees` filters which trees are shown based on account knowledge, campaign resource minimums, equipped items, and character traits. Inactive bound trees (weapon not equipped) are hidden from players even if they hold research; admins see them dimmed. Players then only see trees they have abilities in (or already researched). Admins always see every tree, with ability-matching trees sorted first; trees the player would not see are dimmed. Tree **cores** (tier-10 nodes with no prereqs) use `{ type: 'missionReward' }` so players cannot buy them — they only come from mission/quest rewards.

### Text formatting
Use `{highlighted}` token syntax in node description strings to render magnitude words in yellow. Use `DescriptiveValue` enum values (`DescriptiveValue.Tiny`, etc.) from `researchTrees/descriptiveValue.ts` for consistent magnitude labels.
