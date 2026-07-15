# Lanternite Subsystem

Lanternites are allied light-bearing creatures that pulse light twice per round and drain their own max HP via Soul Sap until they die. This folder also owns the Swarm Nest (dark-creature) network, a hostile mirror of the lanternite nest system used to contest the same nest POIs.

## Files

| File | Owns |
|------|------|
| `lanternitePulse.ts` | Constants (`LANTERNITE_CHARACTER_ID`, light amounts/radii), Soul Sap, `upsertLanternLightSource`, `upsertNestLightSource`, `processLanternitePulseMilestone`, nest hydration helpers |
| `lanterniteNestTick.ts` | `processLanterniteNests` — per-tick nest spawn pacing, scout construction completion, network role assignment, construction particle emitters |
| `LanterniteRespawnManager.ts` | Queues and fires Spore rebirth respawns after `LANTERNITE_RESPAWN_DELAY_SEC` |
| `lanterniteNetworkUtils.ts` | Helpers for networked nest expansion: finding unoccupied connected POIs, counting children by role |
| `swarmNestTick.ts` | `processSwarmNests` — the `swarm_nest` (dark-creature) counterpart to the lanternite nest network: swarmlings seek unclaimed nest POIs and build new swarm nests there |

## Key mechanics

**Light production** — `processLanternitePulseMilestone` is called at `round_start` and `round_half` from `GameEngine`. It applies Soul Sap to each living lanternite then calls `upsertLanternLightSource` to create/replace a `LightSource` that follows the unit (`followUnitId`). Nests get their own persistent light source via `upsertNestLightSource`. Light sources live in `LightSourceManager` — see `game/lighting/AGENTS.md` for the full lighting engine.

**Soul Sap** — each pulse reduces `maxHp` by 7% (floor 1). When `maxHp` would fall below 1, the unit is killed immediately and its light source deactivated via `removeLanterniteLightSources`.

**Nest spawning** — `processLanterniteNests` (called every sim tick) drives two modes:
- *Legacy patrol*: lanternites walk a two-point patrol route.
- *Networked*: scouts are dispatched to unoccupied POIs to construct new nests; defenders hold the home nest. Scout completion spawns a child nest and kills the scout.

**Contested nest POIs** — a lanternite scout will not start (or continue) construction while its target POI is contested by a hostile presence, e.g. a rival `swarm_nest` or its swarmlings sitting on the same spot (`isNestSiteContested` in `game/units/unitAI/lanterniteNetwork/lnet_scout_travel.ts`). While contested, the scout holds position and relies on its normal opportunistic-attack behavior — and the swarmlings' own hostile-detection AI — to fight over the site rather than building on top of the enemy. This is intentional: nest POIs are meant to be a contested resource between the lanternite and swarm-nest networks, not something either side can claim uncontested (see `WorldOfDarkness/missions/008_thorn_march.ts` for an example where a `swarm_nest` is pre-spawned on a lanternite build site).

**Respawn** — `LanterniteRespawnManager` is notified on lanternite death and re-spawns a replacement at the same position after the delay.

**Swarm Nest network (`swarmNestTick.ts`)** — dark-creature counterpart to the lanternite network, driven by `processSwarmNests` each tick. Every swarmling it spawns is immediately assigned the nearest unclaimed `nest` POI (no scout/defender role split) and heads there via the `swarmlingNetwork` AI tree (`game/units/unitAI/swarmlingNetwork/`); on arrival it starts a construction timer, and on completion it dies and a new `swarm_nest` appears at that POI. Swarmlings break off to fight (`snet_hunt`) if an enemy gets close or they take damage, then resume seeking once the threat is gone. Unlike the lanternite side, the swarm network does not check for occupancy before targeting a POI — it will send swarmlings at a spot regardless of who's already there, which is what drives the contested-POI fights described above.
