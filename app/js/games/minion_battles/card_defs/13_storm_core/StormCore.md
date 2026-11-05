# Storm Core (Ability group **13**)

All Storm cards use 4-digit ids starting with `13` (`AbilityGroupId.Storm`). Shared tuning lives in `stormConstants.ts`; shared visuals in `stormVfx.ts`. The research tree is `app/js/researchTrees/trees/storm.ts`; the core item is `character_defs/items/core/024_core_storm.ts`.

## Player profile

Storm is the **skirmisher** core: it rewards never standing still. Its resource is built by distance travelled and bleeds away when you plant your feet, so the kit plays as a loop of *move, tag, cash in*: dart around the fight tagging enemies Conductive, then spend the marks with a chain or a burst that pays off every tag at once. It is ranged-ish damage and setup, not control (that is Gravity) and not sustain (Light / Blood Mage).

## Ability spine

Every Storm card refills all its uses at round start (no `recoveries`, the engine default).

| Card | Ability | Research | Cost | Uses | Role |
|------|---------|----------|------|------|------|
| **1301** | **Arc Bolt** | Storm Core | free | 3 | Fast poke projectile (`arc_bolt`). Arcs down the Conductive ladder: from N stacks to a nearby enemy with N - 1, ending on an unmarked enemy; each leap deals +4. Spends nothing; the last enemy reached gets Conductive 1 |
| **1303** | **Chain Lightning** | Storm Core | 2 Static | 2 | Unit-target bolt that leaps to 6 more enemies (Forked Lightning: +2), Conductive first; spends all Conductive for +4 damage per stack and a Stagger; relays through conductors (not in the tooltip) |
| **1302** | **Static Step** | Static Step (tier 2) | 1 Static | 2 | Iframe dash; zaps and marks every enemy passed through. The distance builds most of the Static back |
| **1304** | **Thunderclap** | Thunderclap (tier 2) | 2 Static | 1 | Ring burst: 6 damage, or 10 to an enemy it spends 1 Conductive from; each stack spent gives 1 Static back. Knockback 1, Bright X (1 / 2 / 3 at 0-1 / 2-3 / 4+ stacks spent) |
| — | **Forked Lightning** | tier 3, after the core | — | — | Chain Lightning reaches 2 more enemies (`hasResearchNode`, like Blood Splinters) |

## Mechanics

### Static (`resources/Static.ts`, id `static`)

- 0 to 6 pips (`barStyle: 'pips'`), electric cyan with a yellow crackle on filled orbs (`pipCrackleColor`, drawn by `PipResourceBar`), `CloudLightning` icon. Mission start: 2 (Storm Core node).
- **Gain by travel**: each tick, the distance the unit moved is added to `progressPx`; every 120 px is one Static. Any motion counts: walking, dashes, being knocked back, haste (Ease Burdens doubles the rate for free). A tick that moves further than `STATIC_MAX_STEP_PX` is a teleport and builds nothing.
- **Grounding**: 2.5 s standing still loses one Static (and resets progress), repeating while still.
- **Passive recovery**: +1 Static every half round (`STATIC_RECOVERY_SECONDS`, 5 s), moving or not; shown as the +N/s tooltip (`perSecondGain`).
- **Refund**: Thunderclap returns 1 Static per Conductive stack it spends.
- **World modifiers**: `WorldModifierDef.resourceGainMultipliers` scales the gain (Rainy Storm doubles Static). Read through `WorldModifierManager.getResourceGainMultiplier`.
- `progressPx`, `stillSeconds` and the last position are serialized with the resource.

### Conductive (mark)

A mark (`buffs/MarkBuff.ts`, def in `buffs/marks/conductiveMark.ts`): stacking to 3, 8 s from the last refresh.

- Applied by Static Step (`applyMarkToPrimaryTarget`) and by Arc Bolt to the last enemy it reaches (`resolveMarkBounce`).
- Read as ladder rungs by Arc Bolt (not spent), spent one stack per enemy by Thunderclap (`spendMarkStacks`), and all at once by Chain Lightning (`consumeMark`, which also reads `getMarkStacks` to steer).
- Visual: **one arc crawling over the body per stack**, each in its own slice of the edge, so the number of arcs alive at once is the stack count. Conductive sets no `pipColor`, so `buffVisuals` draws no pips.

### Mark ladder (`abilities/markBounce.ts`)

`resolveMarkBounce` is the engine rule behind Arc Bolt. Stack counts are rungs: from an enemy with N stacks the hit may leap to an unvisited enemy in reach with exactly N - 1 (nearest first), so Conductive 2 leaps to a Conductive 1, then to an unmarked enemy, and Conductive 1 leaps once. Nothing is spent. The last enemy reached gains the mark, so a finished ladder grows a rung at its foot. The content deals each leap (`onBounce`) with `tryDamageOrBlock(..., { fireAbilityEvents: false })` so the ON_ATTACK_HIT handler that started the chain does not re-enter.

### Conductors

Deployables tagged `conductor` (all dropped weapons and placed deployables, i.e. Armory swords, maces, shields and turrets) are relays for `abilities/chainHops.ts`. When no enemy is in leap range, the bolt may pass through an own-team conductor that has an enemy beyond it. A relay is a free hop (up to 3 per cast) and the conductor is not consumed.

## Interplay with other systems

- **Armory**: dropped weapon tokens and turrets carry Chain Lightning across gaps.
- **Gravity**: Gravity Locus and Collapse pile enemies together, which is exactly what Arc Bolt bounces, Chain Lightning and Thunderclap want.
- **Light / darkness**: Thunderclap leaves a Bright light, brighter the more charge it drew out.
- **Time**: haste increases distance per second, so it increases Static per second, with no special code.
- **World**: Rainy Storm doubles Static gain.
- **Crowd control**: Chain Lightning's payoff is a Stagger (`tryApplyStagger`), so bosses' CC armour applies as usual.

## Visual language (secondary `#a5f3fc`, primary `#3b5bdb`)

Every Storm visual is a **jagged bolt with a white-hot core and a cyan glow** (`LightningBolt` effect, `drawLightningPath`) and every hit is a **spark burst** (`StormSpark`). Area mass (rings, telegraphs) is storm blue. Bolts re-fork a few times a second from a hash, never from engine RNG. Static's yellow crackle is the one exception: it marks the resource, not an attack.

| Ability | Projectile / trail | Hit |
|---------|--------------------|-----|
| Arc Bolt | `arc_bolt`: glowing head dragging a crackling two-strand tail (no BulletTrail) | `StormSpark`; each leap is a bolt between the two enemies plus a spark |
| Static Step | afterimages + a bolt pinned at the start whose far end rides the caster | spark at start and arrival |
| Chain Lightning | contracting gather ring, then hop-by-hop bolts (`Effect.delay`) | spark per target, bigger per stack spent; conductors flare |
| Thunderclap | contracting ring windup; storm-blue shock ring + 8 radial bolts; a bolt from each enemy it drew charge from back to the caster | Bright light |

## Where Storm diverges from common patterns

- **A resource that is earned by moving.** It is computed from position deltas inside `Static.onTick`, not from events.
- **`{Bright X}`.** Thunderclap's Bright magnitude is decided at cast time, so its tooltip shows the `Bright X` glossary term ("Creates a light on the ground. Dims over time.") instead of listing each Bright N.
- **Copy**: player voice ("You learn to..."), talk about charge, hum, air before a storm, the sky. Keep it low tech: no "electricity", "voltage" or "ions".
