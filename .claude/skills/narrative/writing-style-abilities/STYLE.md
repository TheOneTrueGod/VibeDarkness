# Abilities writing — style template

Use **`[Canon]` / `[Draft]` / `[Open]`** on section headings per `narrative-hub`.

## Names [Draft]

- **Pattern:** length, metaphor density, when to use proper nouns vs generic verbs.
- **Consistency:** how names relate to upgrade lines or element themes.

## Descriptions (cards / tooltips) [Canon]

Card text is **card-game text**, as in Slay the Spire or Hearthstone: rules printed on a card, not prose that explains them. Write the fewest words that let someone play the card. A pill, a number or a keyword alone is a complete description.

- **Length:** one line, about 8 words or fewer (pills and keywords do not count). Longer than that, something belongs on a reminder card or in flavour text.
- Lead with the verb and the numbers: what it deals, to how many, how often.
- Numbers are `{dynamic stat}` tokens; stats and resources are pills (`statPillToken`, resource pills), never spelled out beside the pill.
- No feelings, imagery or lore. That belongs in flavour text (below).

Good:

- `Deal {2} damage to {4} Enemies`
- `Create a turret that shoots {4} times dealing {3} damage`
- `{attack +2}` (Mighty: the whole description)

Avoid: `Hurl the conjured sword. It spins into the first enemy along its path...` (imagery, and longer than the mechanic needs).

### Keep it positive [Canon]

Keep a positive gaming experience. Focus on the good first, and frame things in terms of positives and bonuses. This applies to tutorials, tooltips and any text that teaches a mechanic.

- Lead with what the player gains or can do, then give the limit.
- Say what a mechanic rewards ("land 3 strong effects to expose it, taking double damage"), not only what it blocks.
- Frame a threat as a window of opportunity where it is true ("it is nearly beaten and has gone into a frenzy").

| Before | After |
|--------|-------|
| `This boss is resistant to stuns and knockbacks. It shrugs off the first 2 strong effects.` | `Stuns and knockbacks can crack this boss open. Land 3 strong ones and it takes double damage.` |

### Cut list [Canon]

Delete these on sight:

- **"per level" / "per rank"**: the level counter (`0/5`) already says it.
- **"Each X adds Y", "which means", "so that"**: that explains a rule, so it belongs on a reminder card (next section).
- **Restating a pill in words**: "+20 Max Health" next to a heart pill.
- **Saying what is already true**: "this ability", "when you use it", "during battle", "you gain the ability to".
- **Connective filler and full stops on a single clause.**

### Reminder card or card text? [Canon]

A **reminder card** is the small card beside a tooltip that explains a mechanic, like a keyword card beside an ability tooltip or the Attack card beside a research tooltip. Explain a rule on a reminder card when **any** of these is true:

- It appears, or could appear, on more than one card or node.
- It is a rule about how a stat, status or resource works, not about what this one card does.
- Explaining it would more than double the card's text.

Keep it on the card only when it is specific to this card and fits in a few words. When unsure, use a reminder card: turning a repeated sentence into a reminder later means editing every card that has it. A sentence that appears on two cards is a missing keyword; flag it.

**Build the engine, not the sentence.** Before writing an explaining sentence, check for a keyword, stat or resource whose reminder already covers it. If none does, create one rather than writing the sentence:

- Keywords and glossary terms: `abilities/keywords/keywordRegistry.ts` (reminders show beside ability tooltips).
- Character stats: `reminder` on the entry in `app/js/characterStats.ts` (shown beside research tooltips whenever the stat's pill is in the text).

### Before / after [Canon]

Real trims. Add a pair here whenever a description gets cut down in review.

| Before | After |
|--------|-------|
| `{attack +2} per level. Each Attack adds {10%} damage.` | `{attack +2}`, with the Attack reminder card `{attack +1} = {+10%} damage` |
| `Command the nearest pet to slam a bramble patch, dealing damage and leaving lanternite-style thorns that slow movement and damage shadow creatures.` | `Your spirit deals {7} damage and leaves {Brambles}`, with the Brambles reminder card |

### Card flavour text [Canon]

Every card should also have flavour text. That is where the feel of using the card goes: what it is like to swing it, cast it, or watch it work. Keep it to one short line, and never put mechanics in it.

Set it as `flavorText` on the ability (`AbilityStatic.flavorText`; the `define*` archetypes pass it through). The hover tooltip shows it in italics under the card text. Research nodes use the same field name. Reference: the Armory cards in `card_defs/10_armory_core/`.

### Card / research `description` fields [Canon]

When a mechanic has a named keyword, prefer the keyword form (with keyword styling) over a prose paraphrase of the same rule.

- Prefer: grants `{Entombed}` / deals damage and `{Knockback 2}`.
- Avoid: long explanations of “throws still work while in walls” or “pushes units away” when the keyword already names that rule.

Tooltip arrays still follow **Keyword lines** below for standalone mechanical lines.

### Size-system words (`DescriptiveValue`) [Canon]

`{${DescriptiveValue.Huge}}` and friends render as an adjective-like label (`<Huge>`), not a noun, so comparatives read badly when the label sits directly in front of them ("reaches <Huge> farther", "<Small> more damage").

- Write **"a {size} amount"** before the comparative: "reaches a `{Huge}` amount farther", "deal a `{Small}` amount more damage", "lasts a `{Huge}` amount less time".
- Applies to any size label used with `farther`, `more`, `less`, `larger`, `longer`, etc. Labels that already modify a noun ("a `{Large}` radius") need no change.

### Keyword lines [Canon]

Mechanical keywords in `getTooltipText()` use a **standalone-line** format — separate from descriptive prose lines.

**Rules:**

- One keyword per array entry in `getTooltipText()`.
- The entire line is `{KeywordName value}` only — e.g. `{Bright 3}`, `{Knockback 1}`.
- **Exception — keywords that carry an effect:** `{KeywordName value}: short effect clause` (e.g. `{Devour Light 1}: gain {1} additional light`). Still one keyword per line; no `On hit:`-style prefixes.
- No trailing periods, no conditional prefixes (`On Block:`, `On hit:`), no explanatory prose on the same line.
- Do not embed keywords inside descriptive sentences (`Leaves a {Bright 3} at the target point` is wrong).
- Put descriptive mechanics on separate lines above or below keyword lines.

**Two line types:**

| Line type | Format | Example |
|-----------|--------|---------|
| Description line | Prose + inline `{dynamic stats}` | `` `Deal {${DAMAGE}} damage` `` |
| Keyword line | Entire line is `{Keyword value}` only | `'{Bright 3}'`, `'{Knockback 1}'` |
| Keyword-with-effect line | `{Keyword value}: effect` | `` `{Devour Light 1}: gain {1} additional light` `` |

**Reference implementations:** see `getTooltipText` in `card_defs/08_light_core/0801_LightBlast/`, `card_defs/utility/0601_ThrowTorch/`, `card_defs/0108_ThrowChargedRock/`, and `card_defs/0110_ShiningBlock/`. For keyword mechanics, see `abilities/brightKeyword.ts` and `crowdControl/knockbackKeywords.ts` — do not paste tier enums here.

## Research nodes [Canon]

`description` follows the same card-game rules as card text (above): pills, keywords and numbers, one short line, the cut list applies. The tree's voice goes only in `flavorText`.

- A node that adds or changes a card names the card; the card's own tooltip on the node's hover gives the details, so do not repeat them.
- A node that changes a stat or resource is just the pill: `{health +20}`, `{attack +2}`.

`flavorText` leans into what the research tree is doing: the fantasy of that tree, told through this node.

Each tree's fantasy is written in its content folder's `AGENTS.md` (for example, `card_defs/10_armory_core/AGENTS.md`). Read it before writing a node's flavour, and keep every node in the tree telling the same story.

## Icons and VFX briefs [Open]

- If you brief art or VFX here: palette motifs, silhouette rules, forbidden clichés—**themes**, not a gallery of every icon.

## In-battle feedback (log, popups, hints) [Draft]

- **Tone:** terse vs flavorful; whether to personify the card or stay systemic.
- **Length:** hard caps if any.

## Reference implementations [Draft]

Point agents to representative folders under `app/js/games/minion_battles/card_defs/` (or similar) instead of pasting full strings.
