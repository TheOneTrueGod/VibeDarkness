---
name: working-on-minion-battles
description: When working on anything called minion battles, work primarily in the app/js/games/minion_battles directory. Use when the user mentions minion battles or when editing or adding minion battles game code.
---

# Working on Minion Battles

## Instructions

When working on Minion Battles (the game):

1. **Primary location**: Work primarily in `app/js/games/minion_battles/`. Put new game logic, components, and assets there.
2. **Entrypoint**: The game entrypoint is `app/js/games/minion_battles/game.ts` (default export `MinionBattlesGame`).
3. **Integration**: If wiring to the lobby (e.g. game selection, messages), follow AGENTS.md for adding game state and message types; keep Minion Battles–specific code under `app/js/games/minion_battles/` where possible.
4. **Creating abilities**: When adding a new ability or card, use the **creating-an-ability** skill: create a folder `card_defs/####_ABILITY_NAME` with `####Ability.ts` containing both the CardDef and the ability, implement `doCardEffect` and `renderPreview`, and register in AbilityRegistry and card_defs/index. See that skill for the full workflow and group ID enum.
