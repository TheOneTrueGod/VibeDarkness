# Abilities writing — style template

Use **`[Canon]` / `[Draft]` / `[Open]`** on section headings per `narrative-hub`.

## Names [Draft]

- **Pattern:** length, metaphor density, when to use proper nouns vs generic verbs.
- **Consistency:** how names relate to upgrade lines or element themes.

## Descriptions (cards / tooltips) [Draft]

- **Audience:** new player vs expert shorthand allowed or not.
- **Mechanics language:** how explicit numbers, durations, and conditions should read.

### Keyword lines [Canon]

Mechanical keywords in `getTooltipText()` use a **standalone-line** format — separate from descriptive prose lines.

**Rules:**

- One keyword per array entry in `getTooltipText()`.
- The entire line is `{KeywordName value}` only — e.g. `{Bright 3}`, `{knockback 1}`.
- No trailing periods, no conditional prefixes (`On Block:`, `On hit:`), no explanatory prose on the same line.
- Do not embed keywords inside descriptive sentences (`Leaves a {Bright 3} at the target point` is wrong).
- Put descriptive mechanics on separate lines above or below keyword lines.

**Two line types:**

| Line type | Format | Example |
|-----------|--------|---------|
| Description line | Prose + inline `{dynamic stats}` | `` `Deal {${DAMAGE}} damage` `` |
| Keyword line | Entire line is `{Keyword value}` only | `'{Bright 3}'`, `'{knockback 1}'` |

**Reference implementations:** see `getTooltipText` in `card_defs/08_light_core/0801_LightBlast/`, `card_defs/utility/0601_ThrowTorch/`, `card_defs/0108_ThrowChargedRock/`, and `card_defs/0110_ShiningBlock/`. For keyword mechanics, see `abilities/brightKeyword.ts` and `crowdControl/knockbackKeywords.ts` — do not paste tier enums here.

## Icons and VFX briefs [Open]

- If you brief art or VFX here: palette motifs, silhouette rules, forbidden clichés—**themes**, not a gallery of every icon.

## In-battle feedback (log, popups, hints) [Draft]

- **Tone:** terse vs flavorful; whether to personify the card or stay systemic.
- **Length:** hard caps if any.

## Reference implementations [Draft]

Point agents to representative folders under `app/js/games/minion_battles/card_defs/` (or similar) instead of pasting full strings.
