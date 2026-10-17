# Death sequences

Cinematic unit deaths (usually bosses): gameplay pauses (story pause), the animation plays, then gameplay resumes and victory/defeat checks run again.

- **Where it lives:** `UnitDefEntry.deathSequence` on the character's unit def. Only units of that character trigger it, so it never leaks into missions without that unit. It replaces `onDeathVisualEffects` for that unit; `onDeathBehaviors` still run.
- **Entry point:** the engine's `unit_died` listener (`GameEngine.registerCoreEventListeners`) calls `applyDeathSequence`.
- **Building blocks** (`deathSequenceDef.ts`):
  - `pauseSeconds` / `pauseReason` → `engine.startStoryPause`. Make `pauseSeconds` cover the whole animation.
  - `remnant` → a `DeathRemnant` effect (dying sprite that shakes and dissolves: `dissolve: 'wipe' | 'fade'`, shake amplitude can ramp).
  - `emitters` → `DeathSequenceEmitterDef` union (`alphaWolfStory`, `spriteFountain`). Add a new variant + case in `createEmitter` for new emitter types.
  - `visualEffects` → any `VisualEffectDef`s.
- **Presets:** `deathSequencePresets.ts` (`ALPHA_WOLF_DEATH_SEQUENCE`, `DISPLACER_SPIRIT_DEATH_SEQUENCE`).

Do not put per-character death behaviour in `worldModifiers/builtins` — built-ins run in every mission.
