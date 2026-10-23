---
name: campaign-characters
description: How player-created campaign characters work in Minion Battles: storage, API, types, character select, and mission trait filters.
---

# Campaign Characters

## When to use this skill

Use when working on:
- Character creation, storage, or listing
- Character select phase or CharacterCreator UI
- Mission allow/disallow traits for characters
- Battle phase resolving character/portrait for player units

## Overview

Characters are **player-created** and **reusable across games**. They are not static constants. Each character is stored on the server in its own file and is owned by an account. Players have a list of character IDs on their account; character data is not stored on the lobby Player object.

### Main weapon (campaign identity)

Each character has exactly one **main weapon** in the campaign sense: the focal piece of gear that started as the player’s **rock**, **stick**, or **shield** choice in the first-mission flow. Later, characters created outside that flow should still get a main weapon via a different selection step, but the term means the same thing everywhere (story, inventory, meta progression).

- **Purpose**: Narrative branching, inventory / character-sheet presentation, research and quest rewards that “upgrade” or transform the weapon over time—not the primary driver of in-battle card mechanics unless a feature explicitly links them.
- **Implementation sketch** (when wiring data/UI): Persist a stable field on campaign character data (e.g. `mainWeaponKind` and later a tier or cosmetic/transform id); show a dedicated row or slot on character and inventory screens (“Main weapon: …”); gate or flavor story choices with templates that resolve to the current main-weapon label. Keep battle spawning and ability decks orthogonal unless intentionally connected.

## Equipment unlocks and freezing

- **Unlocks are campaign-level.** `Campaign.unlockedItemIds` (TS: `CampaignState.unlockedItemIds`, read via `getUnlockedItemIds` in `character_defs/items/unlockedItems.ts`) is a deduplicated list; unlocking twice is a no-op. It grows from mission-result `itemIds` (`Campaign::addMissionResult`) and from story `equip_item` on the server. **A story `equip_item` always unlocks** (also the deterministic equipment grant and group-vote `grant_item_to_player`), via `CampaignManager::unlockItemsForCharacter`. Admin tools unlock/relock through `updateCampaign` (`unlockItemIds` / admin-only `relockItemIds`). The Character Editor inventory reads campaign unlocks for non-admins; account `inventoryItemIds` is legacy and no longer written.
- **Character to campaign lookup:** owner account's `campaignIds[0]` (`CampaignManager::getCampaignForCharacter`), because `campaignCharacters` is empty on disk.
- **Research never grants equipment** (except core swaps); see the **research-trees** skill. Abilities come only from `resolveCharacterLoadout`.
- **Equipment upgrades are items with tiers.** `ItemDef.tier` / `upgradesFrom` / `campaignIds` describe the upgrade path (`character_defs/items/itemUpgrades.ts`). A mission's `completionRewards.unlockItemTiers: [{ slot, tier }]` resolves (`storylines/unlockItemTiers.ts`) to every item of that slot and tier in the mission's campaign and is merged into the mission result `itemIds`, so it unlocks through the normal campaign path. The `{ kind: 'equipmentUpgrade' }` reward slot (`storylines/researchRewardSlots.ts`) turns each upgrade of the equipped item into an `equip_item` row whose equip replaces the old item (`replaceItemIds`). Chapter-skip replay applies both the same way.
- **Item passives** (`ItemDef.roundStartRecoveryCharges`) are copied onto the unit in `BaseMissionDef` and serialized with it.
- **Quest equipment freeze:** between missions equipment can change; once a quest starts, battles use `activeQuestRun.questCharacter.equipment` (`LobbyManager::mergePlayerEquipmentIntoState`). `CharacterManager::equipItem` writes both the character and the quest snapshot, so a mission that changes gear mid-quest still works. The editor locks equipment for non-admins during a quest; admin edits write both.

## Save data versions and migrations

Characters and campaigns store a `version`. On load, `CharacterManager::loadFromStorage` / `CampaignManager::loadCampaignFromStorage` run every migration from the stored version (missing = 0) up to current, in order, and persist if anything changed. New entities start at the current version.

- Framework and recipe: `backend/SaveData/SaveMigrator.php`; per-entity migrations in `CharacterMigrations.php` and `CampaignMigrations.php` (same folder).
- To change stored shape: bump `CURRENT_VERSION`, add a pure migration for the previous version, add a self-test fixture.
- `M0003EquipmentUpgradeRewards` (with `CharacterMigrations` / `CampaignMigrations` version 3) converted the old swap research into items `011`-`016` (equipped in place of the base item, also in the quest snapshot), moved the follow-up nodes to their new tree ids and unlocked the tier items for completed chapter-1 missions.
- Deploy-time migrations sweep all stored data once: numbered `backend/Migrations/Versions/M<NNNN>*.php` classes listed in `MigrationRegistry`, run by `backend/scripts/migrate.php` (`npm run migrate`; `--status`, `--dry-run`, `--self-test`, `--storage <dir>`).
  - The applied version lives in `storage/_migrations/ledger.json`; only newer migrations run, so `npm run deploy` runs it on every deploy and it is a no-op unless a new migration shipped.
  - Each migration's `touchedDirs()` are backed up to `storage/_migration_backup/` first; the first failure stops the run and is not recorded. Runs hold a lock; the runner refuses when storage is ahead of the code (rolled-back deploy).
  - Forward-only and immutable: never edit or renumber a shipped migration (checksums are recorded and drift is warned); `up()` must be idempotent.

## Backend

- **Storage**: Characters live in `storage/characters/` as JSON files named by character ID.
- **Ownership**: `Character` has `ownerAccountId`. Accounts have `characterIds`.
- **API**: Character CRUD endpoints are defined in `backend/Http/Handlers/` — see `ListCharactersHandler`, `CreateCharacterHandler`, and `GetCharacterHandler` for endpoint details.
- **Game state**: When a player selects a character, the client sends `character_select` with `characterId` and `portraitId`. The server stores selections per player. Battle phase uses portrait IDs to resolve which unit archetype to spawn.

## Frontend

- **Types**: See `app/js/games/minion_battles/character_defs/campaignCharacterTypes.ts` for the serializable character shape (`CampaignCharacterData`), traits, and related types. Includes `locationDeck: Record<campaignId, LocationCardInstance[]>` for per-campaign location card ownership. Location cards grant bonus story choice options during quests; see `storylines/locationCards.ts` and `storylines/WorldOfDarkness/quests/AGENTS.md` for details.
- **Portraits**: See `character_defs/portraits.ts` for the portrait registry; art files live under `character_defs/portraits/`. Other media: **minion-battles-assets**.
- **Class**: `CampaignCharacter` in `character_defs/CampaignCharacter.ts`. Create from server data with `fromCampaignCharacterData(data)`.
  - `canBeUsedOnMission(...)` — checks campaign match and trait filters.
  - `getDisallowReason(...)` — returns a reason string or null if allowed.
- **Missions**: `MissionBattleConfig` can define `allowedTraits` (allowlist) and `disallowedTraits` (denylist). See `storylines/types.ts` for the full config.
- **Character select**: Shows a "Create Character" card and the player's characters sorted by usability. Characters that cannot be used show a diagonal reason label.
- **CharacterCreator**: Popover with portrait carousel and Create button. See `ui/components/CharacterEditor/CharacterCreator.tsx`.
- **Quests**: `activeQuestRun` is singular — at most one prep/active quest run per character. Mission Map Quests panel shows Continue + Abandon on that row (not a separate header Continue). See `docs/plans/quest-system.md` and `storylines/WorldOfDarkness/quests/AGENTS.md`.

## Battle phase

When building player units, the battle phase resolves character portrait/archetype from `characterPortraitIds` in game state. See `BattlePhase.tsx` for how `playerUnits` are created.

## File reference

| Area | Files |
|------|--------|
| Backend character | `backend/Character.php`, `backend/CharacterManager.php` |
| Backend API | `backend/Http/Handlers/ListCharactersHandler.php`, `CreateCharacterHandler.php`, `GetCharacterHandler.php` |
| Account | `backend/PlayerAccount.php`, `backend/AccountService.php` |
| Game state / messages | `backend/Http/Handlers/PostMessageHandler.php`, `backend/LobbyManager.php` |
| Frontend types | `app/js/games/minion_battles/character_defs/campaignCharacterTypes.ts`, `portraits.ts` |
| Frontend class | `app/js/games/minion_battles/character_defs/CampaignCharacter.ts` |
| UI | `app/js/games/minion_battles/ui/pages/CharacterSelectPhase.tsx`, `ui/components/CharacterEditor/`, campaign-home layers in `app/js/components/CampaignHomeScreen/CharactersTab/` |
| Mission config | `app/js/games/minion_battles/storylines/types.ts` |
| Battle | `app/js/games/minion_battles/ui/pages/BattlePhase.tsx` |
| Client API | `app/js/LobbyClient.ts` |
