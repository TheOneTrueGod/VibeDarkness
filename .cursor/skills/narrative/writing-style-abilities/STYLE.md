# Abilities writing — style template

Use **`[Canon]` / `[Draft]` / `[Open]`** on section headings per `narrative-hub`.

## Names [Draft]

- **Pattern:** length, metaphor density, when to use proper nouns vs generic verbs.
- **Consistency:** how names relate to upgrade lines or element themes.

## Descriptions (cards / tooltips) [Canon]

Card text says what the card does, mechanically. It is short, to the point, and has no flavour.

- Lead with the verb and the numbers: what it deals, to how many, how often. Cut anything a player does not need to play the card.
- Numbers are `{dynamic stat}` tokens.
- Use a keyword whenever one names the mechanic, and make sure it is registered so its explanation shows on the card's hover. Explain a rule in prose only when no keyword exists for it, and consider whether it should become one.
- No feelings, imagery or lore. That belongs in flavour text (below).

Good:

- `Deal {2} damage to {4} Enemies`
- `Create a turret that shoots {4} times dealing {3} damage`

Avoid: `Hurl the conjured sword. It spins into the first enemy along its path...` (imagery, and longer than the mechanic needs).

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

`description` roughly says what the player learns to do, in the tree's voice, without numbers or card-by-card detail: "You learn to use energy to shape weapons out of the ground." The cards' own tooltips, shown on the node's hover, give the details. Keep a number only for an effect no tooltip shows (for example, starting Charge).

`flavorText` leans into what the research tree is doing: the fantasy of that tree, told through this node.

Each tree's fantasy is written in its content folder's `AGENTS.md` (for example, `card_defs/10_armory_core/AGENTS.md`). Read it before writing a node's flavour, and keep every node in the tree telling the same story.

## Icons and VFX briefs [Open]

- If you brief art or VFX here: palette motifs, silhouette rules, forbidden clichés—**themes**, not a gallery of every icon.

## In-battle feedback (log, popups, hints) [Draft]

- **Tone:** terse vs flavorful; whether to personify the card or stay systemic.
- **Length:** hard caps if any.

## Reference implementations [Draft]

Point agents to representative folders under `app/js/games/minion_battles/card_defs/` (or similar) instead of pasting full strings.
