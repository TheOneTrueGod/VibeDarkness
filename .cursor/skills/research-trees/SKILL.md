---
name: research-trees
description: Research tree definitions, node structure, evaluator logic, and the Upgrades tab UI in the Character Editor. Use when adding or modifying research trees, nodes, costs/requirements/effects, or the Upgrades tab rendering in Minion Battles.
---

# Research Trees & Upgrades UI

## Concept

The **Upgrades** tab in the Character Editor displays research trees. Each tree is a set of nodes; each node has prerequisites, exclusions, requirements, a cost, and effects that modify a character's abilities or equipment.

Research trees are a **meta-game** system — they belong to campaign characters, not to battles. **Design principle: apply research effects before battle starts, not during.** One in-battle check exists in `GameEngine.ts` (`applyChargedRocksLightChargePulse`) — treat this as tech debt to eliminate.

## Definitions

All tree and node definitions live in `app/js/researchTrees/`:

- `types.ts` — `ResearchTreeDef`, `ResearchNodeDef`, `Requirement`, `ResearchEffect`
- `researchTreeChrome.ts` — shared tree colours and icons (`assets/tree-*.png`)
- `list.ts` — registry of all trees
- `evaluator.ts` — `canResearchNode`, `applyResearchEffects`, `prereqClosure`, `meetsRequirement`, `computeEffectiveResourcesForTree`, `getAvailableResearchNodes`
- `descriptiveValue.ts` — `DescriptiveValue` magnitude labels (Tiny/Small/Medium/Large/Huge)
- `trees/` — one file per tree; each exports its tree ID constants and a `ResearchTreeDef`

Each tree has `colour` and `icon`. Cards and the Upgrades sidebar use those fields — do not keep a separate research-type enum.

### Node relationships
- `prereqNodeIds` — nodes that must be researched before this one is available
- `exclusiveWithNodeIds` — nodes that conflict; only one of the group may be researched
- `draft` — when `true`, the node is WIP: hidden from Upgrades selection UI and excluded from `getAvailableResearchNodes` / filter-style mission reward discovery
- `disabled` — when `true`, hidden from non-admins (Upgrades graph/grid and discovery). Admins still see the node and can grant it.

### Persistence
Research is stored on `CampaignCharacter` as `researchTrees` (node ids), `researchNodeLevels`, and `researchSources` (per-level `Purchased` / `Admin` / `QuestReward`). Missing sources on legacy characters count as Purchased. Effective resources subtract **only Purchased** costs. Mission/quest grants persist `QuestReward`; player clicks on Upgrades persist `Purchased`; admin clicks persist `Admin`. The Upgrades Resources row has **Reset Research** (strips Purchased) and an admin-only **Reset Admin Research** button.

## Querying available nodes

`getAvailableResearchNodes(researchedTrees, { treeId?, tier? })` in `evaluator.ts` returns nodes the character hasn't researched yet and can structurally unlock:
- all `prereqNodeIds` are satisfied
- no `exclusiveWithNodeIds` entry has been researched
- `anyResearched` / `notResearched` requirements pass

External requirements (accountKnowledge, equipment, costs) are intentionally ignored — the function needs no account or character context. Pass `treeId` to scope to one tree, `tier` to scope to one display tier. Both are optional.

## Pre-battle application

Research effects are applied to player units in `storylines/BaseMissionDef.ts`:
- Stat bonuses (health, damage, stamina recovery) via research callback helpers
- Ability runtime modifiers via `applyXxxResearchToAbilityRuntime(unit, getResearchNodes)`

When adding new research effects that affect battle, wire them here — not via in-battle lookups.

## Upgrades Tab UI

Components (all under `app/js/games/minion_battles/ui/components/`):

| Component | Role |
|-----------|------|
| `CharacterEditor.tsx` | Hosts the Upgrades tab; passes character + campaign state down |
| `ResearchTreePanel.tsx` | Outer container for the tab content |
| `ResearchTreeList` | Sidebar selector listing eligible trees with node-count badges |
| `ResearchTreeContent` | SVG graph rendering nodes at their `(x, y)` positions with edges |
| `ResearchNodeCard.tsx` | Individual node: tree icon + title, description, cost pills, then requirements strip. Border colour comes from the owning tree. |

### Node states
`researched` · `enabled` · `blocked` · `default`

### Eligibility gating
`eligibleResearchTrees` filters which trees are shown based on account knowledge, campaign resource minimums, equipped items, and character traits. Players then only see trees they have abilities in (or already researched). Admins always see every tree, with ability-matching trees sorted first; trees the player would not see are dimmed. An admin "show all" debug flag does the same for non-admins. The Upgrades grid shows **Resources** (effective campaign pills) above Eligible research. Cards the player can afford (`canResearchNode`) use a pointer cursor and click to purchase. Tree **cores** (tier-10 nodes with no prereqs) use `{ type: 'missionReward' }` so players cannot buy them — they only come from mission/quest rewards.

### Text formatting
Use `{highlighted}` token syntax in node description strings to render magnitude words in yellow. Use `DescriptiveValue` enum values (`DescriptiveValue.Tiny`, etc.) from `researchTrees/descriptiveValue.ts` for consistent magnitude labels.
