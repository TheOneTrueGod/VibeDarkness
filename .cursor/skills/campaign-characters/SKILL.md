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

## Backend

- **Storage**: Characters live in `storage/characters/` as JSON files named by character ID.
- **Ownership**: `Character` has `ownerAccountId`. Accounts have `characterIds`.
- **API**: Character CRUD endpoints are defined in `backend/Http/Handlers/` — see `ListCharactersHandler`, `CreateCharacterHandler`, and `GetCharacterHandler` for endpoint details.
- **Game state**: When a player selects a character, the client sends `character_select` with `characterId` and `portraitId`. The server stores selections per player. Battle phase uses portrait IDs to resolve which unit archetype to spawn.

## Frontend

- **Types**: See `app/js/games/minion_battles/character_defs/campaignCharacterTypes.ts` for the serializable character shape (`CampaignCharacterData`), traits, and related types.
- **Portraits**: See `character_defs/portraits.ts` for the portrait registry.
- **Class**: `CampaignCharacter` in `character_defs/CampaignCharacter.ts`. Create from server data with `fromCampaignCharacterData(data)`.
  - `canBeUsedOnMission(...)` — checks campaign match and trait filters.
  - `getDisallowReason(...)` — returns a reason string or null if allowed.
- **Missions**: `MissionBattleConfig` can define `allowedTraits` (allowlist) and `disallowedTraits` (denylist). See `storylines/types.ts` for the full config.
- **Character select**: Shows a "Create Character" card and the player's characters sorted by usability. Characters that cannot be used show a diagonal reason label.
- **CharacterCreator**: Popover with portrait carousel and Create button. See `ui/components/CharacterEditor/CharacterCreator.tsx`.

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
| UI | `app/js/games/minion_battles/ui/pages/CharacterSelectPhase.tsx`, `ui/components/CharacterEditor/` |
| Mission config | `app/js/games/minion_battles/storylines/types.ts` |
| Battle | `app/js/games/minion_battles/ui/pages/BattlePhase.tsx` |
| Client API | `app/js/LobbyClient.ts` |
