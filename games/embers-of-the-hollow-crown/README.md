# Embers of the Hollow Crown

A 2D side-scrolling action-adventure for the browser. You play Kael Ashborne, a disgraced ember-knight accused of killing the king, escaping a kingdom of floating islands that is sinking into a sea of black fog.

It is written in vanilla JavaScript (ES modules) on HTML5 Canvas, with no build step and no external assets. Every sprite, portrait, background and tile is drawn by code at runtime. Every sound effect and note of music is synthesised with the Web Audio API.

> **Status: Chapter I vertical slice.** This build contains the complete first chapter, *The Ashen Docks*: the opening, three memory shards, four lore tablets, Lyra and Brother Oskar, the Warden Grull boss fight, the chapter ending, the first Nyx-Aurel dream and an end card. Chapters II–V are planned but not built yet. See the [roadmap](#roadmap).

## Running the game

Browsers will not load ES modules from `file://`, so serve the folder over HTTP:

```bash
cd games/embers-of-the-hollow-crown
npx serve            # or: python3 -m http.server 8000
```

Then open the address it prints, for example `http://localhost:3000` or `http://localhost:8000`. Press any key on the title screen to start (this also unlocks audio).

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | `A` / `D` or `←` / `→` | D-pad / left stick |
| Jump (hold for height) | `Space` | A |
| Attack (tap again for a 3-hit combo) | `J` | X |
| Up-strike / down-strike (pogo) | `W` + `J` / `S` + `J` in the air | ↑ / ↓ + X |
| Dash (invulnerable; jump mid-dash to leap far) | `K` | B |
| Parry | `I` | RB |
| Ember Burst (costs 50 Ember) | `L` | LB / RT |
| Interact / talk / read | `E` | Y |
| Pause | `Esc` | Start |
| Fast-forward dialogue | hold `Tab` | Back / Select |

Gameplay keys can be remapped under **Settings → Controls**. The arrow keys always work for movement and menus.

### Combat notes

- **Telegraphs.** Every enemy attack has a wind-up: the enemy flashes red and glows, and you hear a rising cue. Archers draw a red aim line.
- **Parry.** Press it just as a blow lands. Time slows, you gain Ember, and your next strike within 0.7 s is a counter worth 2.5× damage. Parried arrows and lantern bolts fly back at whoever fired them.
- **Shieldbearers** block attacks from the front. Parry their spear thrust to break their guard, or get behind them.
- **Pogo.** A down-strike in mid-air bounces you off enemies, projectiles and spikes, and refreshes your dash.
- **Style rank.** Consecutive hits raise your rank from C to B, A and S, which multiplies the Ember you gain (up to ×2). Taking damage resets it.
- **Hazards.** Spikes and the Hollow fog cost one health pip and return you to the last safe ground.

## Features in this build

- **Feel.** Hit-stop on every impact, trauma-based screen shake, knockback, white hit-flashes, spark and blood-mist particles, slow motion on parries, and dash afterimages.
- **Movement.** Coyote time, jump buffering, variable jump height, a softer apex while jump is held, dash-jump momentum, and an attack buffer.
- **Enemies.** Hollow Husk, Fog Wisp, Shieldbearer and Archer, plus breakable crates.
- **Warden Grull** (two phases):
  - **Phase 1.** He has four telegraphed attacks: a parryable chain sweep, a leaping slam with a landing marker, a lantern flare with reflectable bolts, and a shoulder charge that stuns him when he hits a wall.
  - **Phase 2.** A cutscene transformation; then faster attacks, shockwaves from his slams, falling rocks, summoned wisps and sweep-into-slam combos.
  - **Presentation.** A health bar with a phase marker, mid-fight dialogue barks, and a defeat cutscene.
- **Story delivery:**
  - Portrait dialogue with a typewriter effect, voice blips per speaker, skip and fast-forward.
  - Branching choices that set flags.
  - In-engine cutscenes with camera pans and scripted movement.
  - Sepia memory flashbacks, lore tablets, and a dream sequence.
- **Progression.** Ember Shards drop from enemies and are spent at Brother Oskar's shop on health, damage and Ember capacity. Checkpoint shrines save progress to `localStorage`.
- **Abilities.** Double jump, wall slide and wall jump, air dash and a charged heavy strike are all implemented. They are locked in Chapter I, as in the design; use the debug `U` key to try them.
- **Presentation:**
  - A 480×270 internal resolution scaled to fit with crisp pixels.
  - Procedural 3-layer parallax with drifting ash, and darkness-based lighting with coloured light sources.
  - Generative ambient music per mode (title, chapter, boss, dream, credits).
  - Pause menu with volume, screen-shake and key-remap settings.
  - Animated title screen and credits.

## Debug mode

Press `` ` `` (backtick) to toggle debug mode. On the title screen it opens the **chapter select**, where you can jump to the docks, the Grull fight, the dream, the end card or the credits. In game, debug mode shows FPS and state, and enables these keys:

| Key | Effect |
| --- | --- |
| `H` | Show hitboxes (hurtboxes, attack boxes, projectiles, triggers, safe-ground point) |
| `G` | God mode |
| `U` | Unlock all abilities (double jump, wall jump, air dash, heavy strike) |
| `M` | +100 Ember Shards |
| `F` | Fill the Ember meter |
| `X` | Kill all non-boss enemies |
| `N` | Teleport to the next room |
| `B` | Restart at the Warden Grull fight |
| `C` | Chapter select |
| `1`–`5` | Chapter shortcuts (only Chapter I is built) |

Debug jumps start from a fresh, in-memory save. Resting at a shrine will write it to storage.

## Story

<details>
<summary>Spoilers: the full story outline</summary>

**Setting.** Veyra is a kingdom of floating islands sinking into the Hollow, a sea of black fog. Three hundred years ago the Hollow Crown was shattered to seal away an ancient being, Nyx-Aurel. That seal is now breaking.

**The mystery.** Kael was condemned for killing King Aldric and has no memory of that night. Memory shards reveal the truth piece by piece. Kael did strike the blow, but the king had already been possessed by Nyx-Aurel, and he begged Kael to do it. Kael's memories were sealed to protect the last fragment of the crown, which is hidden inside Kael's own soul.

**Chapter I — The Ashen Docks** (this build):

1. Nyx-Aurel wakes Kael in a prison cell. The Ember Blade, confiscated by the Regent, re-forms from Kael's own fire.
2. Kael meets Brother Oskar, a gentle shrine-keeper with faded Hollow sigils on his wrists.
3. Kael meets Lyra Venn, a sky-pirate who "owes the Regent more than most".
4. Kael defeats Warden Grull, who has been rotted by the Hollow. His dying words: *"She's reforging it… the crown… and you carry the last…"*
5. In the first dream, Nyx-Aurel reveals what it is and calls Kael to Gloamwood.

**Planned chapters:**

- **II — Gloamwood.** Kael's first full flashback. Boss: the Thorn Matron.
- **III — Skyreach Spire.** Lyra betrays Kael, then returns. Boss: Captain Redd Halloway (spare him or kill him).
- **IV — The Drowned Cathedral.** Oskar's past and the full truth about the king come out. Boss: Seraphine, phase 1 (forgive or expose Oskar).
- **V — The Hollow Throne.** Boss: Seraphine merged with Nyx-Aurel, a 3-phase fight (trust or doubt Lyra).
- **Endings:**
  - *The Ember King.* Kael takes the crown and seals Nyx-Aurel.
  - *The Shattered Dawn.* Kael destroys the crown; Veyra falls, but its people are free.
  - *The Hollow Accord.* The secret ending: all memory shards plus the right choices. Kael and Seraphine share the burden.

</details>

## Architecture

```
index.html                 two stacked canvases: pixel world (480x270) + full-resolution UI
src/
  main.js                  App: scaling, fixed 60 Hz loop with interpolated rendering, scene/overlay stack
  config.js                resolution, palette, physics and combat tuning, style ranks
  util.js                  math helpers, seeded RNG, canvas helpers
  systems/
    input.js               keyboard + Gamepad API, press latching, remapping
    audio.js               Web Audio SFX recipes and generative music modes
    physics.js             AABB vs tilemap movement (solids, one-way platforms)
    level.js               ASCII room builder, hazards, procedural tile art pre-render
    camera.js              look-ahead, vertical dead zone, room bounds, arena lock, shake
    lighting.js            darkness overlay with light cut-outs + additive colour
    particles.js           pooled particle system
    dialogue.js            data-driven branching dialogue (flags, conditions, choices, events)
    cutscene.js            generator-based cutscene runner and task helpers
    save.js                localStorage progress and settings
  entities/
    player.js              Kael's state machine, movement tech and combat moves
    enemies.js             Husk, Wisp, Shieldbearer, Archer, Crate
    grull.js               Warden Grull boss AI (two phases)
    projectiles.js         pooled arrows, bolts, shockwaves, rocks; parry reflection
    pickups.js             Ember Shards and health motes
    props.js               shrines, NPCs, tablets, memory shards, signs, doors, gates, torches
  gfx/
    sprites.js             procedural pixel sprites for every actor
    portraits.js           32x32 procedural dialogue portraits
    background.js          procedural parallax layers and ambient weather
  scenes/                  title, game, dream, chapterEnd, credits
  ui/                      text helpers, HUD, menu component, overlays (pause, settings, remap, shop, chapter select)
  data/
    levels/ch1.js          Chapter I map (8 rooms) and its signs, lore, memories and shrines
    dialogue_ch1.js        all Chapter I dialogue
    cutscenes_ch1.js       all Chapter I cutscenes
    speakers.js            names, colours, voice pitches, box styles
    enemies.js             enemy stats
    chapters.js            chapter list for the select screen and roadmap
```

### Key patterns

- **Fixed timestep.** The game updates at exactly 60 Hz. Rendering interpolates between the previous and current positions. Hit-stop freezes the world while camera shake keeps animating, and button presses made during hit-stop are replayed afterwards. Slow motion scales the world's `dt`.
- **Levels** are ASCII rooms placed side by side (see the legend at the top of `data/levels/ch1.js`). Each room declares its camera bounds, its darkness and whether it is an interior. Letters are entity markers.
- **Dialogue scripts** are plain arrays of steps:

  ```js
  { who: 'lyra', text: '...', when: 'memories>=1' }
  { choice: [{ text: 'I work alone.', set: { lyra_cold: true }, then: [/* steps */] }] }
  { if: 'boss_grull', then: [...], else: [...] }
  { event: 'shop' }
  ```

- **Cutscenes** are generator functions that yield tasks:

  ```js
  *grullIntro(g) {
    yield camTo(g, b.x, b.y - 60, 1);
    yield say(g, 'grull_intro');
    yield call(() => g.startBoss(b));
  }
  ```

### Adding a chapter

1. Create `data/levels/chN.js`, `data/dialogue_chN.js` and `data/cutscenes_chN.js`, following the Chapter I files.
2. Add any new enemy types to `entities/enemies.js` and `data/enemies.js`. Crawler, Caster, Duelist and Hollow Knight are the planned ones.
3. Mark the chapter `built: true` in `data/chapters.js`, and make `GameScene` choose its level, dialogue and cutscene tables from the save's chapter.

## Roadmap

These parts of the design are not in this build yet:

- Chapters II–V, their bosses, and the remaining four enemy types (Thorn Crawler, Cultist Caster, Sky-Pirate Duelist, Hollow Knight).
- The three main story choices and the three endings. The dialogue system already supports the flags and conditions they need.
- Ability pickups in the world, and the ember projectile. Double jump, wall jump, air dash and the heavy strike are already implemented and can be unlocked with debug `U`.
- A per-chapter atmosphere set: falling leaves, wind streaks, underwater light rays and void particles.
