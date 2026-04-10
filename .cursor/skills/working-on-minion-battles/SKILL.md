---
name: working-on-minion-battles
description: When working on anything called minion battles, work primarily in the app/js/games/minion_battles directory. Use when the user mentions minion battles or when editing or adding minion battles game code.
---

# Working on Minion Battles

## Instructions

When working on Minion Battles (the game):

1. **Primary location**: Work primarily in `app/js/games/minion_battles/`. Put new game logic, components, and assets there.
2. **Entrypoint**: The game entrypoint for the UI is `app/js/games/minion_battles/Game.tsx` (default export `MinionBattlesGame`).
3. **Integration**: If wiring to the lobby (e.g. game selection, messages), follow AGENTS.md for adding game state and message types; keep Minion Battles–specific code under `app/js/games/minion_battles/` where possible.
4. **Creating abilities**: When adding a new ability or card, use the **creating-an-ability** skill: create a folder `card_defs/####_ABILITY_NAME` with `####Ability.ts` containing both the CardDef and the ability, implement `doCardEffect` and `renderPreview`, and register in AbilityRegistry and card_defs/index. See that skill for the full workflow and group ID enum.
5. **Hitboxes**: When an ability needs collision detection against enemies (melee, lunge, AoE), use the hitbox classes in `hitboxes/`. See the **working-with-hitboxes** skill for available types, usage patterns, and how to add new shapes.

## Teams

Each unit has a **team** via `unit.teamId` (`TeamId` in `engine/teams.ts`). Use teams (not `ownerId`) when you need “same side” or “ally” logic.

- **TeamId**: `'player' | 'allied' | 'enemy'`.
- **Defaults**: By default, enemy units use `teamId: 'enemy'`; player units use `teamId: 'player'`. Missions or spawn logic can set `teamId: 'allied'` (or change it) for NPCs that fight with the player.
- **Alliances**: `player` and `allied` are allied with each other (see `ALLIANCE_MAP` in `engine/teams.ts`). Use **`areAllies(teamA, teamB)`** and **`areEnemies(teamA, teamB)`** from `engine/teams` to test relationship between two teams.
- **Getting allies**: Use **`engine.getAllies(caster)`** to get all units on the same team as the caster (alive, excluding the caster). This filters by team alliance, not by `ownerId`.
- **Where teamId is set**: Player units get `teamId: 'player'` in `storylines/BaseMissionDef.ts` when building player units; enemy spawn configs and constants (e.g. `enemyConstants.ts`) use `teamId: 'enemy'`. Override in mission or unit config when you need a different team (e.g. `allied`).

## Host vs Client vs Server

These terms are different than normally used.
Server: The backend, written in PHP and stored in the `/backend` folder
Host: One of the players in the game.  If it is a single player game, the only player is the host.  If it is multiplayer, only one player can be the host.  The host is considered to have the authoritative state for the game, and is responsible for submitting regular gamestate updates to the backend.
Client: One of the players in the game.  If it is a game with multiple players, then every player who isn't the host is a client.  Clients are responsible for updating the game state locally, and for playing out game actions so they're visible to the user, and the game should ideally play out the same on clients vs hosts, but whenever there is a disagreement between the host's game state, and the client's game state, the host will always win.  A client should never submit game state to the backend, though they may submit other things, such as commands from the player.
