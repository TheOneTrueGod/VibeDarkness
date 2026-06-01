# Lanternite Subsystem

Lanternites are allied light-bearing creatures that pulse light twice per round and drain their own max HP via Soul Sap until they die.

## Files

| File | Owns |
|------|------|
| `lanternitePulse.ts` | Constants (`LANTERNITE_CHARACTER_ID`, light amounts/radii), Soul Sap, `upsertLanternLightSource`, `upsertNestLightSource`, `processLanternitePulseMilestone`, nest hydration helpers |
| `lanterniteNestTick.ts` | `processLanterniteNests` — per-tick nest spawn pacing, scout construction completion, network role assignment, construction particle emitters |
| `LanterniteRespawnManager.ts` | Queues and fires Spore rebirth respawns after `LANTERNITE_RESPAWN_DELAY_SEC` |
| `lanterniteNetworkUtils.ts` | Helpers for networked nest expansion: finding unoccupied connected POIs, counting children by role |

## Key mechanics

**Light production** — `processLanternitePulseMilestone` is called at `round_start` and `round_half` from `GameEngine`. It applies Soul Sap to each living lanternite then calls `upsertLanternLightSource` to create/replace a `LightSource` that follows the unit (`followUnitId`). Nests get their own persistent light source via `upsertNestLightSource`. Light sources live in `LightSourceManager` — see `game/lighting/AGENTS.md` for the full lighting engine.

**Soul Sap** — each pulse reduces `maxHp` by 7% (floor 1). When `maxHp` would fall below 1, the unit is killed immediately and its light source deactivated via `removeLanterniteLightSources`.

**Nest spawning** — `processLanterniteNests` (called every sim tick) drives two modes:
- *Legacy patrol*: lanternites walk a two-point patrol route.
- *Networked*: scouts are dispatched to unoccupied POIs to construct new nests; defenders hold the home nest. Scout completion spawns a child nest and kills the scout.

**Respawn** — `LanterniteRespawnManager` is notified on lanternite death and re-spawns a replacement at the same position after the delay.
