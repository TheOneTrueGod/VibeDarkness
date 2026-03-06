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

Characters are **player-created** and **reusable across games**. They are not static constants. Each character is stored on the server in its own file and is owned by an account. Players have a list of character IDs (on the account); character data is not stored on the lobby Player object.

## Backend

- **Storage**: Characters live in `storage/characters/<characterId>.json`. Each file is named by the character's ID (e.g. `char_<hex>.json`).
- **Ownership**: `Character` has `ownerAccountId`. Accounts have `characterIds` (list); adding a character updates the account and the character file.
- **API**:
  - `GET /api/account/characters` — list all characters for the current user (requires login).
  - `POST /api/account/characters` — create a character (body: `portraitId`, `campaignId`, `missionId`, optional `equipment`, `knowledge`, `traits`, `battleChipDetails`). Returns the created character.
  - `GET /api/characters/:id` — get one character (must be owned by current account).
- **Game state**: When a player selects a character, the client sends `character_select` with `characterId` and `portraitId`. The server stores `characterSelections[playerId] = characterId` and `characterPortraitIds[playerId] = portraitId`. Battle phase uses `characterPortraitIds` to resolve which unit archetype (warrior, mage, etc.) to spawn.

## Serializable character shape

All data sent to or from the server must be serializable (JSON-friendly):

- `id`, `ownerAccountId`, `equipment` (string[]), `knowledge` (map: id → details), `traits` (string[]), `portraitId`, `battleChipDetails` (object: letter, innerCircleColor, image, etc.), `campaignId`, `missionId`.

## Frontend

- **Types**: `CampaignCharacterData` (serializable), `CharacterTrait` (union of allowed trait strings), `BattleChipDetails`, `KnowledgeDetails`. See `app/js/games/minion_battles/character_defs/campaignCharacterTypes.ts`.
- **Portraits**: `PORTRAITS` in `character_defs/portraits.ts` — map of portrait ID → `{ id, name, picture }`. Filled from the same defs as legacy characters (warrior, mage, ranger, healer, rogue, necromancer).
- **Class**: `CampaignCharacter` in `character_defs/CampaignCharacter.ts`. Create from server data with `fromCampaignCharacterData(data)`.
  - `canBeUsedOnMission(campaignId, missionId?, missionDef?)` — returns true if character's campaign matches and trait filters pass.
  - `getDisallowReason(campaignId, missionId?, missionDef?)` — returns a one-word reason (`'campaign'`, `'allowed'`, `'disallowed'`) or null if allowed.
- **Missions**: `MissionBattleConfig` can define `allowedTraits?: string[]` (allowlist) and `disallowedTraits?: string[]` (denylist). If `allowedTraits` is set, the character must have at least one of those traits; if `disallowedTraits` is set, the character must not have any of those traits.
- **Character select**: Shows a "Create Character" card (plus in circle, "Create Character" below) and the player's characters sorted by whether they can be used on the current campaign/mission. Characters that cannot be used show a diagonal one-word reason (e.g. CAMPAIGN, DISALLOWED).
- **CharacterCreator**: Popover with portrait carousel (selected in centre, prev/next faded beside), index/total below, Create button. Create calls the API then selects the new character and sends `character_select` with the new id and portraitId.

## Battle phase

- `initialGameState` (and thus game state from the server) may include `characterPortraitIds`: `Record<playerId, portraitId>`.
- When building `playerUnits` for `initializeGameState`, use `characterId = characterPortraitIds[playerId] ?? characterSelections[playerId]` so the unit factory receives a portrait/archetype ID (warrior, mage, ranger, healer, etc.). This keeps existing unit creation logic (e.g. `createUnitByCharacterId`) working.

## File reference

| Area | Files |
|------|--------|
| Backend character | `backend/Character.php`, `backend/CharacterManager.php` |
| Backend API | `backend/Http/Handlers/ListCharactersHandler.php`, `CreateCharacterHandler.php`, `GetCharacterHandler.php` |
| Account | `backend/PlayerAccount.php` (characterIds), `backend/AccountService.php` (addCharacterToAccount) |
| Game state / messages | `backend/Http/Handlers/PostMessageHandler.php` (character_select + portraitId), `backend/LobbyManager.php` (characterPortraitIds in merge) |
| Frontend types | `app/js/games/minion_battles/character_defs/campaignCharacterTypes.ts`, `portraits.ts` |
| Frontend class | `app/js/games/minion_battles/character_defs/CampaignCharacter.ts` |
| UI | `app/js/games/minion_battles/phases/CharacterSelectPhase.tsx`, `app/js/games/minion_battles/components/CharacterCreator.tsx` |
| Mission config | `app/js/games/minion_battles/storylines/types.ts` (allowedTraits, disallowedTraits, campaignId) |
| Battle | `app/js/games/minion_battles/phases/BattlePhase.tsx` (characterPortraitIds for playerUnits) |
| Client API | `app/js/LobbyClient.ts` (getMyCharacters, createCharacter, getCharacter) |
