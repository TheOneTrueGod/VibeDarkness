# Storm Core (Ability group **13**)

All Storm cards use 4-digit ids starting with `13` (`AbilityGroupId.Storm`). Shared tuning lives in `stormConstants.ts`; shared visuals in `stormVfx.ts`. The research tree is `app/js/researchTrees/trees/storm.ts`; the core item is `character_defs/items/core/024_core_storm.ts`.

## Player profile

Storm is the **skirmisher** core: it rewards never standing still. Its resource is built by distance travelled and bleeds away when you plant your feet, so the kit plays as a loop of *move, tag, cash in*: dart around the fight tagging enemies Conductive, then spend the Static you built on a chain or a burst that pays off every tag at once. It is ranged-ish damage and setup, not control (that is Gravity) and not sustain (Light / Blood Mage).

## Ability spine

| Card | Ability | Research | Static | Role |
|------|---------|----------|--------|------|
| **1301** | **Arc Bolt** | Storm Core | free, 2 uses | Fast poke projectile (`arc_bolt`); applies Conductive 1 |
| **1302** | **Static Step** | Storm Core | 1 Movement Point, 2 uses | Iframe dash; zaps and marks every enemy passed through. The distance itself builds Static |
| **1303** | **Chain Lightning** | Chain Lightning (tier 2) | 2 | Unit-target bolt that leaps to 3 more enemies (Forked Lightning: +2), Conductive first; spends Conductive for +4 damage per stack and a Stagger; relays through conductors |
| **1304** | **Thunderclap** | Thunderclap (tier 2) | min 2, spends **all** | Ring burst around the caster: 4 + 3 per Static spent, knockback 1, Conductive 1, Bright 1 (Bright 2 at 5+ Static) |
| — | **Forked Lightning** | tier 3, after Chain Lightning | — | Chain Lightning reaches 2 more enemies (`hasResearchNode`, like Blood Splinters) |

## Mechanics

### Static (`resources/Static.ts`, id `static`)

- 0 to 6 pips (`barStyle: 'pips'`), electric cyan, `CloudLightning` icon. Mission start: 2 (Storm Core node).
- **Gain by travel**: each tick, the distance the unit moved is added to `progressPx`; every 120 px is one Static. Any motion counts: walking, dashes, being knocked back, haste (Ease Burdens doubles the rate for free). A tick that moves further than `STATIC_MAX_STEP_PX` is a teleport and builds nothing.
- **Grounding**: 2.5 s standing still loses one Static (and resets progress), repeating while still.
- **World modifiers**: `WorldModifierDef.resourceGainMultipliers` scales the gain (Rainy Storm doubles Static). Read through `WorldModifierManager.getResourceGainMultiplier`.
- `progressPx`, `stillSeconds` and the last position are serialized with the resource.

### Conductive (mark)

A mark (`buffs/MarkBuff.ts`, def in `buffs/marks/conductiveMark.ts`): stacking to 3, 8 s from the last refresh. Applied with the `applyMarkToPrimaryTarget` ability-event effect (Arc Bolt, Static Step) or `applyMark` (Thunderclap). Chain Lightning reads `getMarkStacks` to steer the bolt and `consumeMark` for the payoff. Visual: cyan diamond pips above the unit (`buffVisuals`) and tiny arcs crawling over the body (`renderEmit`).

### Conductors

Deployables tagged `conductor` (all dropped weapons and placed deployables, i.e. Armory swords, maces, shields and turrets) are relays for `abilities/chainHops.ts`. When no enemy is in leap range, the bolt may pass through an own-team conductor that has an enemy beyond it. A relay is a free hop (up to 3 per cast) and the conductor is not consumed.

## Interplay with other systems

- **Armory**: dropped weapon tokens and turrets carry Chain Lightning across gaps.
- **Gravity**: Gravity Locus and Collapse pile enemies together, which is exactly what Chain Lightning and Thunderclap want.
- **Light / darkness**: Thunderclap leaves a Bright light, so a big discharge also lights the way.
- **Time**: haste increases distance per second, so it increases Static per second, with no special code.
- **World**: Rainy Storm doubles Static gain.
- **Crowd control**: Chain Lightning's payoff is a Stagger (`tryApplyStagger`), so bosses' CC armour applies as usual.

## Visual language (secondary `#a5f3fc`, primary `#3b5bdb`)

Every Storm visual is a **jagged bolt with a white-hot core and a cyan glow** (`LightningBolt` effect, `drawLightningPath`) and every hit is a **spark burst** (`StormSpark`). Area mass (rings, telegraphs) is storm blue. Bolts re-fork a few times a second from a hash, never from engine RNG.

| Ability | Projectile / trail | Hit |
|---------|--------------------|-----|
| Arc Bolt | `arc_bolt`: glowing head dragging a crackling two-strand tail (no BulletTrail) | `StormSpark` |
| Static Step | afterimages + a bolt pinned at the start whose far end rides the caster | spark at start and arrival |
| Chain Lightning | contracting gather ring, then hop-by-hop bolts (`Effect.delay`) | spark per target, bigger per stack spent; conductors flare |
| Thunderclap | contracting ring windup; storm-blue shock ring + 8 radial bolts | Bright light |

## Where Storm diverges from common patterns

- **A resource that is earned by moving.** It is computed from position deltas inside `Static.onTick`, not from events.
- **Spend-all cost.** Thunderclap's `resourceCost` is the minimum; its active behaviour drains the rest and scales on the total.
- **Copy**: player voice ("You learn to..."), talk about charge, hum, air before a storm, the sky. Keep it low tech: no "electricity", "voltage" or "ions".
