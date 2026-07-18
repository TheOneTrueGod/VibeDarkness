# Lanternite Subsystem

Lanternites are allied light-bearing creatures that pulse light twice per round and drain their own max HP via Soul Sap until they die. This folder also owns the Swarm Nest (dark-creature) network, a hostile mirror of the lanternite nest system used to contest the same nest POIs.

Graph structure, node membership, and the `Structure` unit-tag convention live in
`game/managers/mapNetwork/AGENTS.md` — this doc covers lanternite/swarm-specific behavior built on
top of that shared graph.

## Files

| File | Owns |
|------|------|
| `lanternitePulse.ts` | Constants (`LANTERNITE_CHARACTER_ID`, light amounts/radii), Soul Sap, `upsertLanternLightSource`, `upsertNestLightSource`, `processLanternitePulseMilestone`, nest hydration helpers |
| `lanterniteNestTick.ts` | `processLanterniteNests` — per-tick nest spawn pacing, scout construction completion, network role assignment, construction particle emitters |
| `LanterniteRespawnManager.ts` | Queues and fires Spore rebirth respawns after `LANTERNITE_RESPAWN_DELAY_SEC` |
| `lanterniteNetworkUtils.ts` | Helpers for networked nest expansion: finding unoccupied connected POIs, counting children by role |
| `swarmNestTick.ts` | `processSwarmNests` — the `swarm_nest` (dark-creature) counterpart to the lanternite nest network; `isNodeClaimedBySwarm`/`isValidUnclaimedBuildNode` (build-eligibility) and `findUnclaimedNetworkNode` (bootstrap-only fallback target picker, see below) |

## Key mechanics

**Light production** — `processLanternitePulseMilestone` is called at `round_start` and `round_half` from `GameEngine`. It applies Soul Sap to each living lanternite then calls `upsertLanternLightSource` to create/replace a `LightSource` that follows the unit (`followUnitId`). Nests get their own persistent light source via `upsertNestLightSource`. Light sources live in `LightSourceManager` — see `game/lighting/AGENTS.md` for the full lighting engine.

**Soul Sap** — each pulse reduces `maxHp` by 7% (floor 1). When `maxHp` would fall below 1, the unit is killed immediately and its light source deactivated via `removeLanterniteLightSources`.

**Nest spawning** — `processLanterniteNests` (called every sim tick) drives two modes:
- *Legacy patrol*: lanternites walk a two-point patrol route.
- *Networked*: scouts are dispatched to unoccupied POIs to construct new nests; defenders hold the home nest. Scout completion spawns a child nest and kills the scout.

**Contested nest POIs** — a lanternite scout will not start (or continue) construction while its target POI is contested by a hostile presence, e.g. a rival `swarm_nest` or its swarmlings sitting on the same spot (`isNestSiteContested` in `game/units/unitAI/lanterniteNetwork/lnet_scout_travel.ts`). While contested, the scout holds position and relies on its normal opportunistic-attack behavior — and the swarmlings' own hostile-detection AI — to fight over the site rather than building on top of the enemy. This is intentional: nest POIs are meant to be a contested resource between the lanternite and swarm-nest networks, not something either side can claim uncontested (see `WorldOfDarkness/missions/008_thorn_march.ts` for an example where a `swarm_nest` is pre-spawned on a lanternite build site). On the swarm side this same "ignore the other faction" principle is enforced structurally rather than checked per-tick: a swarmling's build-eligibility check (`isValidUnclaimedBuildNode`/`isNodeClaimedBySwarm` in `swarmNestTick.ts`) never looks at non-swarm units at all, so a lanternite-held node simply never registers as "claimed" from the swarm's perspective.

**Respawn** — `LanterniteRespawnManager` is notified on lanternite death and re-spawns a replacement at the same position after the delay.

**Swarm Nest network (`swarmNestTick.ts` + `game/units/unitAI/swarmlingNetwork/`)** — dark-creature counterpart to the lanternite network, driven by `processSwarmNests` each tick. Unlike the lanternite side (a single fixed scout target, assigned once), swarmlings use a **population-gradient hop-by-hop migration with reassign-on-arrival** — a state machine exclusive to this tree (`networkHunt` and `lanterniteNetwork` keep their existing simpler models):

- Each swarmling tracks `swarmState.currentNodeId` (the node it last confirmed arrival at — spawn position counts as an implicit first arrival) and `swarmState.targetNodeId` (the node it's committed to as its next hop while in transit; `null` means stationary and due for a fresh decision).
- **It never reconsiders its target mid-transit** — only once it physically arrives does `currentNodeId` become the old `targetNodeId` and a fresh decision get made (`snet_seek.ts`, `execute`).
- **Decision, on arrival**: if the current node is a valid, unclaimed `nest`-tagged node (`isValidUnclaimedBuildNode`), the swarmling settles and starts (or joins) construction there. Otherwise it looks at its graph neighbors' populations (`MapNetworkManager.getNeighborNodes`, counted via a local per-tree tally, not a manager-level cache) and commits to the first neighbor with **strictly lower** population than its current node — plain gradient descent, no capacity/overflow threshold. In-transit swarmlings count toward their `targetNodeId`'s population, not their physical origin, so a burst of movers converging on the same "currently empty" neighbor don't all pick it independently. If no neighbor is strictly better (population is flat, e.g. at mission start), it falls back to `findUnclaimedNetworkNode` — now a **bootstrap-only** direction-picker (BFS-hop-nearest, Euclidean-nearest fallback for a disconnected graph), not the primary targeting mechanism it used to be.
- There is no more single pre-computed distant build target assigned at spawn time — `processSwarmNests`'s burst-spawn loop no longer calls `findUnclaimedNetworkNode` at all; a new swarmling starts with both fields `null` and resolves everything lazily on its first AI tick.
- Multiple swarmlings converging on the same **unfinished** build site is intended ("shared construction" — `processSwarmNests`'s shared-construction pooling accelerates completion per additional contributor); `isNodeClaimedBySwarm` only excludes a node once the actual `swarm_nest` structure exists there, not while a lone swarmling is mid-construction.
- Swarmlings still break off to fight (`snet_hunt`) if an enemy gets close or they take damage, then resume seeking (from wherever `currentNodeId` last was) once the threat is gone — this threat-detection precedence over travel/seek bookkeeping mirrors `nh_travel`'s existing pattern.
