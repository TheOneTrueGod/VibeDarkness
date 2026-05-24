# Faction: The Players

---

## Thematic Primer [Open]

The players are a small group of survivors moving through a world being consumed by Darkness. Details of their origin, culture, and individual identities are not yet defined. What is established: they are adaptive — they scavenge, research, craft, and form unexpected alliances (such as with the Lanternites) in order to push back against a hostile world.

*This section is intentionally sparse. Expand to Draft when character backstory and group identity are developed.*

---

## Mechanical Primer [Open]

- **Team ID:** `'allied'` — shares the allied team with Lanternites in missions.
- **Campaign Characters:** Player-created characters with traits and equipment that persist across missions.
- **Research / Upgrades:** Between missions, players invest in a research tree that unlocks new abilities and equipment. Research choices are the primary expression of player identity and build direction.
- **Abilities:** Players use card-based abilities in battle, drawn from a deck that evolves with research and equipment.

*Specific stat ranges, default abilities, and build archetypes are not yet locked. Do not treat any particular ability set as canonical for the faction.*

---

## Code Map [Open]

**Campaign characters** (creation, storage, traits):
- `app/js/games/minion_battles/` — primary game directory; use the `campaign-characters` skill for full detail

**Research / upgrade trees:**
- `app/js/games/minion_battles/` — use the `research-trees` skill for node structure, evaluator logic, and the Upgrades tab UI

**Ability and card system:**
- `app/js/games/minion_battles/abilities/` — ability implementations
- `app/js/games/minion_battles/card_defs/` — card definitions
- Use the `creating-an-ability` or `editing-card-behaviour` skills for specifics

**Mission spawn definitions for allied units:**
- `app/js/games/minion_battles/constants/enemyConstants.ts` — allied spawn def templates live alongside enemy ones
