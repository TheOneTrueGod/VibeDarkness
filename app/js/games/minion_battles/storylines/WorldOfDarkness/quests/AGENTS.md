# quests/

World of Darkness **QuestDef** content: mini-run definitions (slots, tags, completion Campaign Rewards) registered into `QUEST_MAP` via `storylines/questRegistry.ts`. Hierarchy is Campaign → Quest → Missions.

## Folder map

| Path | Owns |
|------|------|
| `*.ts` (this folder) | One file per quest: exported `QuestDef` + quest id constant. |
| `../questMissions/` | Missions used only by quests (copies / random-story bag). Keep separate `missionId`s from main-path missions so `missionResults` do not collide. |
| `../WorldOfDarkness.ts` | Storyline edges + `questSlotBanks` (map banks / unlock gates). |

## System code (not in this folder)

Runtime types, run state, slot resolve, lobby advance/retry/abandon, and Campaign Rewards apply-on-clear live under `storylines/` (`questTypes.ts`, `questRun.ts`, `questSlotResolve.ts`, `questLobby.ts`, `questCampaignRewards.ts`, `questRegistry.ts`). Design notes: `docs/plans/quest-system.md`.

Mission Map / Quests UI: `ui/components/CharacterEditor/` (`MissionMapTab`, `QuestBankPickerPopup`, `QuestPickRow`). Picker `QuestSlotBank`s (e.g. Surface Quests) open a single-column popup of eligible quests; dedicated banks keep the map tooltip. A character has **at most one** `activeQuestRun` (prep or active). The active quest’s list row shows **Continue** + **Abandon** (confirm popover); other rows show **Start**. Quest Prep (ability pick / freeze) is in character select (`characterSelect/prep/`, the same stack as mission Prepare Carefully; only `PrepLoadoutConfig` differs), not the Character Editor Equipment tab.

## Location cards

Per-character "location decks" built from quest rewards. A `location_encounter` quest slot draws a random card from the deck and resolves it to that card’s mission; cards can carry modifications (e.g., `add_reward` inserts bonus story choice options).

### Definitions and instances

- `locationCards.ts` defines the static lookup (`LOCATION_CARD_DEFS`: id 1 = Found Berries, id 2 = Surface Metal Deposit; each has `missionId`, display name, description, flavour text, and `location_tag` enum array for categorization) and reward definitions (`LOCATION_REWARD_DEFS`: id 4 = "Make a healing poultice" story choice option that restores 5 Hunger (reduces the mission Hunger loss)).
- Each card owned by a player is a `LocationCardInstance` (unique `instanceId`, `location_card_id`, optional `displayNameOverride`, `modifications`). Instances persist on `CampaignCharacter.locationDeck[campaignId]` (per-campaign map).
- Deck holds **one instance per `location_card_id`**: re-clearing a quest that grants a card you already own does nothing to that instance, so the player’s modifications are kept untouched.
- Grant new instances on quest clear via `addLocationCardsToDeck` (one instance per unique `completionRewards.locationCardIds` entry; duplicates and re-grants are skipped); see `Game.tsx` `prepareQuestVictoryContinue` (finale branch, inside `shouldGrant` guard).

### Slot kind and pick algorithm

- `location_encounter` slot kind (optional `fallback: RandomStorySlotParams` for when deck is empty).
- **Repeat rule**: `pickLocationCardInstance` filters to instances with the **minimum use count so far** (use count = already-resolved instances in this run for that `instanceId`). No repeats until every card has been used equally often. Deterministic within a run via `slotSeed`.
- **Empty deck fallback**: resolve as the old `random_story` bag pick (requires `fallback` params on the slot).

### Multiplayer determinism

- Quest starter’s resolved slots are stamped into the lobby (`questResolvedSlots` on `QuestLobbyFields`; persisted in `LobbyManager.php`).
- Joiners adopt stamped slots via `ensureQuestPrepRun` (instead of re-resolving), ensuring both players see the same card picks.
- Snapshot includes the card instance and its modifications (`locationCard` on `ResolvedMissionRef`), so all party members see the same inserted options.

### Modifications and choice insertion

- `LocationCardModification` (type `add_reward`, with `slot` and `reward_id`) inserts a story choice option from `LOCATION_REWARD_DEFS` into the encounter mission’s choice.
- `slot` is a 0-based index: when `slot < options.length`, the modification **replaces** that index; otherwise is **appended**.
- Applied in `PostMissionStoryPhase` via `applyLocationModificationsToOptions(options, modifications)` after computing the mission’s original choice options.
- `heal_wounds` action (on reward id 4, e.g., the healing poultice): when the player chooses that option, Hunger loss is reduced by the `amount` (1-to-1; see `applyHealWoundsToHungerLoss` in `matchHunger.ts`).

### UI

- `LocationCardPill` component with Mountain icon, hover tooltip (name, description, italic flavour text, mission badge, modifications list with descriptions from `describeLocationModification`).
- Wired into: `VictoryPopover` (Campaign Results row), `CampaignDataPanel` (Location Deck section showing grouped instances + counts), `MissionMapTab` (quest panel slot pills labeling `location_encounter`).