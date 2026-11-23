# CLAUDE.md — Pongui

Context guide for working in this repo. Read all of it before touching code.

## What it is

A bouncing-ball puzzle game that runs in the browser on desktop, tablet and phone, and installs
as a PWA (no app stores). The site root is a landing page that presents it; the game is at
`/play/`, which is also the installed app's start URL. The ball bounces on its own; the player steers it in the air, holds
jump for high bounces, collects every gem to open the exit and avoids hazards. It is an original
game in the genre of the late-80s bouncing-ball puzzlers: its own name, character, art, sounds
and levels. Never copy names, art, music or level layouts from an existing game.

It also ships as native iOS and Android apps through Capacitor (see Native apps).

The repository is public but **not open source**: all rights reserved (`LICENSE`), and
contributions are accepted under the terms in `CONTRIBUTING.md`. Never add code, art or text
under a license that would force the project to be open. The site is published on Cloudflare
Pages (`.github/workflows/deploy.yml`, after CI passes on `main`; idle until the repository
variable `CLOUDFLARE_PAGES_PROJECT` is set). The CodeQL and Dependency Review workflows skip
themselves on a private repository.

## Stack

| Area | Choice | Notes |
|---|---|---|
| Runtime | Node LTS (24) | `.nvmrc` at the root |
| Packages | pnpm | Never use npm or yarn. Commit `pnpm-lock.yaml` |
| Build | Vite + vite-plugin-pwa (Workbox `generateSW`) | `base: './'`: the build works from any folder |
| Engine | Phaser 3, **Canvas renderer** | WebGL shader compilation blocked start-up for over a second (see Performance) |
| Language | Strict TypeScript | |
| Physics | Custom, grid based (`src/game/physics.ts`) | Pure TS, no Phaser: deterministic and unit tested |
| Graphics | Vector textures generated at start-up | No image assets besides the app icons |
| Audio | Web Audio synthesis (`src/audio/sfx.ts`) | No audio files |
| i18n | Custom typed dictionaries in `src/i18n` | en (default), es, pt-BR; no dependencies |
| QR codes | qrcode-generator | Only in the share dialog's lazy chunk |
| Tests | Vitest (unit), Playwright + `@axe-core/playwright` (browser), Lighthouse CI | |
| Lint / format | ESLint (typescript-eslint, type-aware) + Prettier | `@typescript-eslint/no-deprecated` is an error |
| Git hooks | husky + commitlint (`@commitlint/config-conventional`) | `pre-push` runs `pnpm lint` and `pnpm test:run` |
| CI | GitHub Actions | lint, typecheck, level validation, unit tests, build + bundle budget, `pnpm audit`, Playwright + axe, Lighthouse; CodeQL and dependency review once public |

## Commands

```bash
pnpm install
pnpm dev                # development server: landing at /, game at /play/ (?level=N opens a level,
                        # ?c=CODE a shared level, ?editor=1 forces the editor on)
pnpm build              # typecheck + production build with the service worker
pnpm preview            # serve the build
pnpm test               # Vitest in watch mode
pnpm test:run           # Vitest once (CI)
pnpm lint
pnpm typecheck          # tsc --noEmit
pnpm validate:levels    # parse every level, check its texts, prove it is solvable
pnpm check:fairness     # find spots people cannot do reliably (see Levels)
pnpm check:bundle       # gzip budget per chunk (after pnpm build)
pnpm test:e2e           # Playwright + axe on desktop and phone (after pnpm build)
pnpm lhci               # Lighthouse CI on the built game
pnpm media              # README media, landing videos/screenshots and og-image (needs ffmpeg)
pnpm media:social       # vertical videos with the game's sound for social networks, in
                        # docs/social/ (not committed)
pnpm icons              # regenerate public/icons and the native sources in assets/
pnpm build:native       # game-only build in dist-native/ + `cap sync` into ios/ and android/
pnpm build:itch         # game-only build in dist-itch/ and pongui-itch.zip, to upload to itch.io
pnpm native:assets      # every iOS/Android icon and splash size from assets/
pnpm ios / pnpm android # open the native project in Xcode / Android Studio
```

## Structure

```
index.html             # landing page (English texts inline, see Landing page)
capacitor.config.ts    # native app id, name, start page and plugin settings
ios/  android/         # native projects (Capacitor); generated web files are git-ignored
assets/                # sources for native icons and splash screens
play/index.html        # the game page
privacy/index.html     # privacy page (static, three languages)
public/landing/        # landing videos and screenshots, recorded by `pnpm media`
src/
  main.ts              # Phaser config, scenes, font loading, resize observer
  landing/             # landing page script, styles and messages/{en,es,pt-BR}.ts
  dev.ts               # dev-only console helpers: replay(i), demo(i), tick(n)
  native.ts            # Capacitor integration (storage, haptics, splash, status bar)
  game/                # pure game logic, no Phaser
    constants.ts       # grid, physics constants
    tiles.ts           # tile codes and map characters
    level.ts           # level JSON → ParsedLevel
    physics.ts         # World: step(dt, input) → events
    solver.ts          # best-first search between bounces (level validation, demos)
    custom.ts          # player levels: draft checks, auto par, link codes (encode/decode)
  custom/              # player levels in the browser: store.ts (`pongui:custom`), bot.ts +
                       # bot.worker.ts (solver in a Web Worker), dialogs.ts (HTML dialogs), run.ts
  scenes/              # Boot, Menu, LevelSelect, Skins, MyLevels, Game, Overlay (pause / complete /
                       # game over), Editor (lazy chunk)
  gfx/                 # textures.ts (vector textures, baked layers), themes.ts (world colors), ui.ts
  input/controls.ts    # keyboard + touch (HTML buttons) + gamepad, one API
  audio/sfx.ts         # synthesized sound effects
  i18n/                # t(), localized(), locale detection, messages/{en,es,pt-BR}.ts
  levels/              # w<world>-<nn>.json (numeric order), index.ts (LEVELS, WORLDS), worlds.ts
  save.ts              # progress in localStorage (`pongui:save`)
  skins.ts             # balls to choose from, opened with stars (look only)
  daily.ts             # level of the day (picked by the date) and the streak of days
  pwa.ts               # install prompt, iOS detection, fullscreen
  analytics.ts         # anonymous usage statistics (Umami), off without VITE_UMAMI_ID
tests/                 # Vitest: physics, levels, i18n
e2e/                   # Playwright: smoke, PWA/offline, axe
scripts/               # validate-levels, check-bundle, capture-media, make-icons
```

## Physics

- Fixed step of 1/120 s. The world is 20×12 tiles of 32 px; the ball is a 20 px box.
- The ball always bounces. A normal bounce climbs 1 tile, a high bounce (jump held at landing,
  buffered 0.12 s before or "upgraded" up to 0.07 s after) climbs 3, a spring climbs 6.
- Air control only: acceleration 2400 px/s², top speed 160 px/s.
- When landing or bumping a ceiling, hazards count only for the tile under the ball's center (or
  when they are all the ball touches). Side contacts always count.
- Ramps catch the ball on any contact (even over a hazard), snap it to the ramp's center and
  launch it with a fixed high arc (about 5 tiles). They must never be skippable by accident.
- A water drop puts out every fire tile of one contact (fire becomes solid ash). A hammer breaks
  the whole connected brick wall and the ball keeps going.
- Switches flip every A/B block when bounced on or bonked from below (the tile under or over
  the ball's center counts, like hazards). A toggle block that turns solid around the ball stays
  open until the ball leaves it (its `hits` is 1 meanwhile), so the ball is never trapped.
- Pushers catch the ball like ramps (any contact, snapped to the pusher's center) but give a
  low bounce at a fixed 280 px/s sideways: about 4 tiles on flat ground, under a 3-row ceiling.
- Portals `1` `2` `3` come in pairs (`parseLevel` checks it). When the ball's center enters one,
  it moves to the other's center with the same velocity (ramp and pusher locks included); the
  exit portal stays inactive until the ball's center leaves it.
- Water and low-gravity zones are a layer (`ParsedLevel.field`), not tiles: `~` and `z` cells,
  plus anything placed inside one (a gem, the start, a portal, spikes) whose cell above or side
  neighbor is in it. In water gravity is halved and the fall speed is capped at 240 px/s, so
  bounces climb about twice as high; in a zone gravity is 45%, so they climb about 2.2 times.
  Plan steps also end at portals and at the edge of water or a zone (`endsStep`).
- Bumpers `b`: a side hit throws the ball back the way it came at a fixed 260 px/s (locked until
  the next bounce) with a small hop (at least 380 px/s up); from above or below they are plain
  blocks. Two bumper walls two tiles apart make a "chimney" the ball ricochets up by itself.
- Ice `i`: a bounce on it keeps the ball's horizontal speed (`lockVx`) and steering waits for
  the next bounce, so the ball slides until a wall stops it (a ball that lands still can steer).
  Thin ice `j` holds low bounces; a high bounce (jump held or buffered on landing) breaks every
  thin-ice tile it lands on and the ball falls through unless something else holds it. Plan
  steps end on that break so the plan can let go of jump before the next landing.
- Crumbling blocks `c` start a 0.6 s countdown on any touch (landing, bonk or side) and then
  vanish for good. Vents `!` follow the world's clock (`ticks`): 1.5 s off and solid, then
  1.5 s lit and deadly (a hazard by the same center rule), starting off; a small flame flickers
  in the last 0.4 s before they light. The solver keeps the vents' phase in its key (in 0.25 s
  buckets) and, on levels with timed tiles, takes turns between the states nearest to a target
  and plain breadth-first order: the phase multiplies the states, so keep those levels compact
  (fill unused space with rock).
- Phase blocks `%` and `&` take turns every 1.2 s on the world clock (`%` solid first); one
  that turns solid around the ball is held open until the ball leaves it (like A/B blocks),
  and they flicker in the last 0.3 s before swapping. Plan steps end on every swap. Dark levels
  (`"dark": true`) only change the look: a veil with a soft hole of light around the ball,
  with items and the exit drawn over it.
- Rainbow bridges `=` are toggle blocks that turn solid when the last gem is taken (like A/B
  blocks, one that appears around the ball waits until the ball leaves it).
- `World.step` returns events (`bounce`, `break`, `collect`, `die`, `win`…); scenes only render
  them. Never put gameplay rules in scenes.

## Levels

- The game has worlds of **exactly 10 levels**, with ids `w<world>-<nn>` (numeric order: `w2` before
  `w10`). Each world has a name (`world.N` in i18n), colors (`gfx/themes.ts`) and two new
  mechanics introduced in its first levels. The plan is 10 worlds (100 levels); `WORLD_COUNT` in
  `src/levels/worlds.ts` says how many exist (the landing page reads it without the maps) and
  `PLANNED_WORLDS` how many are planned (once both match, the landing stops promising more).
- First visit: with no saved game (`isFirstVisit()` in `save.ts`), `/play/` starts on level 1-1
  instead of the menu (pause → "Choose level" → "Menu" leads back). Browser tests that need the
  menu call `asReturningPlayer(page)` first.
- Watch the bot: out of lives, the panel offers to see the level solved. `Game` started with
  `bot: true` asks the solver for its plan in a worker (`planFor` in `custom/bot.ts`) and plays
  it with `PlanPlayer` (`game/replay.ts`), one input per physics step, like the solver did.
  Nothing is recorded: no win, no stars, no level events. `tests/replay.test.ts` replays every
  world's finale.
- Balls: `skins.ts` lists the balls a player can choose, each opened by a number of stars (the
  last one needs all of them; a test checks it). They change the look only: `ballTexture` draws
  each one on demand, and the trail and bursts take its color. Never tie a gameplay effect to a
  ball. The choice lives in the save (`skin`) and falls back to the default when not open.
- Level of the day (`daily.ts`): the player's calendar date picks one of the game's levels
  (never the first two), shuffled so none repeats within a cycle; no server. It is played with
  `daily: true`: a win counts for the streak (`daily` in the save) but only records the level,
  and so opens the next one, if the player had already reached it. The menu is a two-column
  button grid with Play and the level of the day on the first row.
- Progress: a level is open when the previous one has a record, so a new world opens for players
  who already finished the last one. The level select shows one world per page (◀ ▶, or
  left/right at the edge of a row) and `?level=` accepts `12` or `2-3`.
- Level maps load in their own `levels.js` chunk (play.js is mostly Phaser and near its budget).
- JSON in `src/levels/`: `id`, `name` and `hint` as `{ en, es, pt-BR }`, `par` (seconds for the
  time star) and `map` (12 strings of 20 characters). The legend is in `CONTRIBUTING.md`.
- Every level teaches or tests one idea, introduced in its hint the first time it appears.
- Row 0 must be plain walls (`#`): the HUD is drawn over it and `parseLevel` rejects anything
  else. The floor row (11) is free and may hold hazards.
- `pnpm validate:levels` (one level per CPU core) must pass: the map parses, every text exists in all languages, the solver
  beats it and the par time is above the solver's time (rule of thumb: 2.5× + 5 s).
- Fairness rules learnt the hard way: ramps at least 2 tiles wide with a low ceiling before them,
  gems over pits placed on the ramp's launch path, no soft locks (a restart always works).
- Play every new level by hand, and simulate naive play when in doubt (hold right, hold jump,
  different start timings): the solver only proves a level is possible, not that it is fair.
  `solve(level, maxNodes, state)` searches from any state: perturb each step of the bot's plan
  and check the level is still winnable from where the ball ends up (mistakes must be
  recoverable or kill you, rarely leave you stuck). Also try each key jump from rest, holding
  the direction with a 0.1–0.2 s reaction delay: the bot carries momentum from earlier bounces
  and can make jumps a person cannot (a gap of 3 tiles up 2 rows is out of reach from rest).
- Updrafts: the ball hovers about half a tile above a column's top and drifts only ~1 tile
  sideways before falling, so platforms reached from a column must touch it and sit at least a
  tile below its top. Plan steps also end when the ball enters or leaves an updraft
  (`endsStep` in `solver.ts`), so replays must split steps the same way.
- A gem on a falling path must sit on the line people actually take: sweep simple inputs (hold
  the direction from different moments, for different times) and count how often they get the
  gem *and* survive. The bot finds odd lines (3-7 first had a pit gem no sweep could combine
  with reaching the updraft).
- Pushers are one-way trips: make them at least 2 tiles wide (like ramps), remember that the
  landing spot depends on which pusher caught the ball (one tile apart), and put any item before
  a pusher on its arc or after it (4-10 first had a start gem a quick tap could carry you past
  with no way back). A single floor tile between pushers is a trap: a bounce off it flies over
  the next pushers.
- Portals: an exit portal must never sit where the ball bounces back into it (right above a floor
  or a ledge): bouncing in place sends it back and forth forever. Put entrances at the end of
  1-tall tunnels or in 1-tall doors (the ball's center cannot miss them, and bouncing in place
  under the ceiling stays inside the cell) and exits in mid-air or in doors. A spring or a fall
  that leads back into an exit makes a "geyser" loop: fine only if people can steer out of it.
- Pools: a pool's edge is hard to climb out of. From the pool floor a high bounce clears the
  surface by less than half a tile, so give people an underwater ledge to jump from.
- Items for low bounces go 2 rows above the floor they are reached from (1 row above is only
  touched near the bottom of each bounce: about a quarter of the passes); 3–4 rows above need a
  high bounce.
- Ice: people stop by sliding into a wall, so put a wall (or a step) wherever they must stop to
  aim. Thin ice cannot be climbed back with a high bounce, so route people past everything
  above it before they break through, or give them a spring back up.
- Crumbling blocks never come back: a path that needs one twice soft-locks, so a fall from a
  crumbling step should kill (spikes below) or lead somewhere that does not need it again.
- Vents: check every crossing over the whole cycle (start the input at each moment of the 3 s
  cycle and see who survives; a person starts right as the vents go dark). Keep strips 3 tiles
  wide or less, give a solid resting spot before each strip, and never make people commit
  (slide on ice, jump over a wall) while the vents are still lit.
- Low gravity stretches every flight (a low bounce lasts about a second), so a timed landing
  after a jump in a zone leaves a much smaller window: jump from a solid spot at a vent, never
  vent to vent. Bumper chimneys need a low entrance (a 1-tall tunnel) or the ball bumps the
  wall's side on the way in and is thrown back; make one wall taller so the exit side is
  fixed.
- Phase blocks inside an updraft column cut the lift (the ball's center leaves the wind), so
  put them beside the column, not in it. Dark levels: never ask for a jump into something
  the light does not show yet; gems glow, so put them on the safe line. Spikes and pits must
  be in the floor row, not standing on it: a 1-tall obstacle on a floor cannot be bounced over
  under a low ceiling.
- Switches flip on every bounce: a switch you must cross mid-route should sit between solid
  tiles so people can stop on them, and the lamp shows which color is solid.

## Player levels (editor and sharing)

- **Editor** (`scenes/Editor.ts`): computers only (`canCreate()`: fine pointer, 900 px wide, not
  native; `?editor=1` forces it). It is a lazy chunk added to Phaser on first use (`openEditor`),
  so phones never load it. Every tile of the ten worlds is in `PALETTE`; row 0 stays walls and
  `paint()` keeps one start and one exit. Changes save at once (`pongui:custom`, mirrored to
  native storage) with undo/redo.
- **Verified** = the bot (the solver in a Web Worker, rerun 0.45 s after each change; a new run
  replaces the old worker) beat this exact map *and* its creator beat it with "Test". Both are
  keyed by `mapHash` (map + dark), so any edit clears them. The par comes from the bot
  (`autoPar`, the official rule). Only verified levels can be shared by their creator.
- **Sharing needs no server**: `encodeLevel` packs a level (version byte, theme, dark, par, name,
  run-length map of rows 1–11, checksum) into base64url, ~100–300 characters. Links are
  `play/?c=CODE` (the public `VITE_SITE_URL` in the native apps); the share dialog offers copy,
  WhatsApp (`wa.me`), the system share sheet, and a QR code (also downloadable). `SYMBOLS` fixes
  each map character's code: only append to it.
- **Opening a link**: Boot decodes `?c=` (anything invalid is rejected: links come from anyone),
  removes it from the address, keeps the level as "received" (deduplicated) and opens it in
  "My levels", where the bot checks it again on that device. "Open a link" pastes a link or code
  (the native apps cannot receive links yet: that needs universal / app links).
- Text typed in dialogs never reaches the game: `controls` ignores keys from inputs and dialogs.
  Phaser ignores key events whose default was prevented, so the editor listens on `window`.
- Next step (not built): publishing to a shared catalog needs accounts, a database and moderation
  (store rules for user content: report, block, filter).

## Landing page

- Plain HTML + CSS + one small module (`src/landing/main.ts`): no framework and no Phaser, about
  15 KB gzip on first load (`main.js` has its own budget).
- Texts: `index.html` holds the English text of every `data-i18n` element (crawlers and no-JS
  visitors read real content) and `data-i18n-attr="attr:key"` for attributes. `tests/landing.test.ts`
  fails if the HTML and `src/landing/messages/en.ts` drift apart. The language is shared with the
  game (`pongui:locale`).
- Videos use `data-src` and load only when they scroll into view; they play only while visible,
  never autoplay with `prefers-reduced-motion`, and every clip has a pause button (WCAG 2.2.2).
  `data-src` paths are resolved relative to the page so the site works under any base folder.
- Media is recorded, never drawn by hand: `pnpm media` plays each world's last level with the
  solver (`demo(i, { banner: false })`), drives the editor with the keyboard for the "create"
  clip, and encodes small MP4 clips with JPEG posters (`pnpm media editor` records only that one).
- World cards are static HTML (`data-world="N"`); their names come from the game's dictionary
  (`world.N`) and `tests/landing.test.ts` checks there is one card per world.
- `VITE_SITE_URL` in `.env` feeds the canonical link, Open Graph tags, the `VideoGame` JSON-LD
  and the generated `robots.txt` and `sitemap.xml` (`siteFiles` in `vite.config.ts`).
- The service worker is registered from `src/pwa.ts` with a URL resolved from the bundle, so both
  pages register `/sw.js` with the root scope. Landing media is excluded from the precache.
- Updates wait: a new worker takes over the next time the game is opened (no `skipWaiting`, so a
  running game never loses its lazy chunks). Cloudflare takes some seconds to serve every file
  of a release, and a worker installed in that window can precache the previous HTML under the
  new revision: `healStalePrecache` (`src/pwa.ts`) compares the served page with the network a
  few seconds after loading and, if they differ with no update pending, drops the precache and
  reloads once.

## Analytics and privacy

- `src/analytics.ts` is the only file that knows the provider (Umami Cloud: no cookies, so no
  consent banner). It is off in development, in tests, in the native apps, when `VITE_UMAMI_ID`
  is empty and for browsers that send Do Not Track; the script is only counted on the
  `VITE_SITE_URL` host. With no id the build contains no tracker code.
- Events are a closed list (`AnalyticsEvent`): `play_click`, `level_start` (once per level per
  visit), `level_complete`, `install`, `editor_open`, `level_shared`, `result_shared`,
  `bot_watched`, `shared_level_opened`.
  Scenes and the landing call `track()`; never `src/game`. Every event counts against the plan's
  quota, so do not report things that happen many times per level.
- Whatever is measured must be listed in `privacy/index.html` (static, three languages) and in
  the landing FAQ.

## Games portals (itch.io)

- `vite build --mode portal` (`pnpm build:itch`) builds only the game into `dist-itch/`, with a
  root `index.html` that redirects to `play/index.html` with a relative path (portals serve the
  zip from a folder of their own), and zips it as `pongui-itch.zip`.
- `src/build.ts` has `IS_PORTAL` and `OFF_SITE` (native app or portal). Off the site there is no
  service worker, no analytics, no install or fullscreen button, and shared links (levels and
  results) point to `VITE_SITE_URL` instead of the page's own address.
- Preview the package with the `itch` configuration of `.claude/launch.json`.

## Native apps

- Capacitor 8 wraps the game for iOS (Swift Package Manager, no CocoaPods) and Android. App id
  `io.github.mtorre4580.pongui` (cannot change after the first store upload).
- `vite build --mode native` builds only the game into `dist-native/` (no PWA plugin, no public/
  folder) plus a root `index.html` fallback that Capacitor requires. The app starts at
  `play/index.html` (`server.appStartPath`): a bare `play/` gets the root page and loops.
- `src/native.ts` is the only place that touches Capacitor. `IS_NATIVE` is a build-time constant,
  so the web build contains no Capacitor code (check: `grep -l Capacitor dist/assets/*.js`).
  Plugins are imported dynamically inside `IS_NATIVE` branches.
- Saves and the locale are mirrored to `@capacitor/preferences` (iOS can purge a web view's
  localStorage) and restored before the game starts. Haptics: high bounce, springs, ramps,
  walls, death and win. The splash hides once the first scene draws.
- Native config: landscape only, status bar hidden, `UIRequiresFullScreen` on iPad,
  `ITSAppUsesNonExemptEncryption = false`; Android `sensorLandscape` and immersive mode in
  `MainActivity`.
- Inside the app there is no service worker, install button, fullscreen button or iOS install
  hint (`isStandalone()` is true).
- Test in the simulator: `pnpm build:native`, then build the `App` scheme in Xcode (or
  `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator`). JavaScript
  console output shows up as `⚡️ [log]` lines in the app's stdout.

## Design

- Modern flat vector look: navy gradient background with soft bubbles, teal solid blocks, a coral
  ball with eyes, bright tiles that read at a glance (yellow fragile, orange strong fragile, fire,
  purple spring, blue ramp, brick wall, steel spikes). Font: Fredoka (Latin subset, bundled).
- Full bleed: the canvas always covers the whole screen (`Phaser.Scale.EXPAND`, 1280×832
  minimum game area). `gfx/layout.ts` zooms the 640×416 world (about 2×) and centers it in the
  free area: the screen minus the safe areas (notch, Dynamic Island), read from the invisible
  `#layout-probe` element whose padding CSS sets (no bottom inset: the floor may run under the
  home indicator). Each scene says which world rectangle must stay visible and centers it; the
  game fits the whole 20×12 level. The HUD has no band of its own: it is a
  translucent bar over the level's top wall row. Backgrounds, the HUD
  bar and overlay dimming extend far past the world so the screen never shows empty bars.
  Textures are drawn at 2× and shown at 0.5.
- **Canvas renderer rules**: no `tint` (use `sparkTexture(color)`), no `fillGradientStyle` (bake
  gradients with a 2D canvas), and bake static layers (background, solid blocks) into textures
  instead of redrawing Graphics every frame.
- Touch play has no on-screen buttons: gestures over the whole screen (`input/gestures.ts`, pure
  and unit tested; wired in `input/controls.ts`). The first finger is an invisible joystick
  anchored where it lands (14px dead zone; the anchor trails the finger by at most 56px so
  reversing is instant); a second finger held down is the jump button; a double tap queues one
  high bounce for the next landing (`controls.disarmJump()` on bounce). `#stick` draws a faint
  ring and knob under the steering finger. Gestures are only on while a level is played
  (`controls.enableGestures`); menus use normal taps. Levels can carry a `hintTouch` that
  replaces the hint when playing by touch (levels 1 and 2 explain the gestures).
- Portrait on touch screens shows a "rotate your device" notice.

## Performance

- Lighthouse (desktop) must stay at 100/100/100/100 on both pages (`/` and `/play/`). Main-thread
  blocking was 1.3 s with WebGL and is ~10 ms with Canvas.
- Bundle budget in `bundle-budget.json` (Phaser is ~340 KB gzip of the 370 KB `index.js` limit).

## Accessibility (mandatory)

- Playable with keyboard, touch gestures and gamepad; menus navigate with arrows/D-pad and confirm with
  Enter/Space/A. Escape pauses and goes back.
- The HTML shell passes axe (WCAG 2.2 AA) on desktop and phone: `lang` follows the locale, the
  canvas container has an accessible name, and zoom is not disabled in the viewport meta.
- The visible scene is exposed as `body[data-scene]` for tests.

## Conventions

- **Every code comment is written in English**, no exceptions (team standard).
- **i18n**: English by default; the browser language picks Spanish or Portuguese; the choice is
  stored in `pongui:locale`. No visible text is hardcoded: use `t('key')` for UI and
  `localized(value)` for level texts. Keys live in `src/i18n/messages/en.ts` (source of truth);
  `es.ts` and `pt-BR.ts` have exactly the same keys and placeholders (enforced by type and tests).
- Tone: plain English; neutral Rioplatense Spanish (“juntá”, “probá”); Brazilian Portuguese.
- Gameplay logic stays in `src/game` (pure, deterministic, tested); scenes render and route input.
- Do not add dependencies without explaining in the PR why the existing ones are not enough.
- **No deprecated APIs** in new or changed code. `@typescript-eslint/no-deprecated` enforces it for
  typed code; before committing or opening a PR, run the `check-deprecations` skill
  (`.claude/skills/`) to cover what the linter cannot see.

## Testing

- Pure logic (physics, level parsing, i18n dictionaries, bundle budget): Vitest unit tests.
- Levels: `pnpm validate:levels` (also in CI) runs the solver on every level.
- Browser: Playwright against the production build, on desktop Chrome and a landscape phone:
  boot without errors, keyboard flow menu → level → pause, `?level=N`, touch gestures (no
  buttons, steering indicator), full-screen canvas, locale, installable manifest, offline
  reload, axe.
- A PR is not merged with failing checks.

## How to add…

**A level**: create `src/levels/w<world>-<nn>.json` (see Levels), run `pnpm validate:levels`,
play it, and update the README level count if it changes.

**A world** (follow the World plan below; one branch and one PR per world, `feat/world-N`):

1. Mechanics first, as pure logic: tile codes and map characters in `tiles.ts` (items in
   `level.ts`), behavior in `physics.ts`, unit tests in `tests/physics.test.ts`. Any new state
   that changes what can happen next goes into the solver's `key()` in `solver.ts`; time-based
   mechanics must include their phase in it. If a mechanic needs a decision mid-air, emit an
   event and add it to `endsStep`.
2. Look: textures in `gfx/textures.ts` (Canvas rules in Design), rendering and events in
   `scenes/Game.ts`, a sound in `audio/sfx.ts`, the world's colors in `gfx/themes.ts`. Special
   tiles keep fixed colors; only background and solid blocks change per world.
3. Ten levels `w<N>-01…10` in en/es/pt-BR (Rioplatense Spanish, Brazilian Portuguese), `world.N`
   in the three message files, `WORLD_COUNT` in `src/levels/worlds.ts`. Levels 1–2 introduce
   one mechanic each in their hint; 3–9 combine them with earlier ones; 10 is the world's finale.
   Keep names short (the HUD shows "N-10 · Name").
4. `pnpm validate:levels`, then set each par to round(2.5 × bot time + 5).
5. Fairness: `pnpm check:fairness tolerance wN` must show no `FIX`; then check every key jump
   with `jump`, every updraft exit with `hover`, and every item on a falling path with `sweep`
   (or a small custom simulation). Redesign until a person can do each step reliably.
6. `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`, `pnpm check:bundle`, and when
   the environment has browsers `pnpm test:e2e` and `pnpm lhci` (CI runs them on every PR).
7. Docs: map legend in `CONTRIBUTING.md`, README level count, Status here, and any new design
   lesson in Levels. Run the `check-deprecations` skill. Commit in logical steps (mechanics,
   solver, look, levels, docs) and open the PR with the template.

**A tile or item**: add its code in `tiles.ts` (and map character), its behavior in
`physics.ts` with unit tests, its texture in `gfx/textures.ts`, its rendering in `scenes/Game.ts`,
its legend entry in `CONTRIBUTING.md`, and a level that introduces it. For the editor: append its
character to `SYMBOLS` (`game/custom.ts`), add it to `PALETTE` (`scenes/Editor.ts`) with a
`tile.*` name in the three languages, and give it a color in `gfx/thumbnail.ts`.

**A text**: add the key to `en.ts`, `es.ts` and `pt-BR.ts`, then use `t('key')`.

## World plan

Ten worlds of ten levels (100 levels). Each brings its own colors and two mechanics; map
characters must stay unique across the game.

| # | World | Mechanics |
|---|---|---|
| 1 | Bouncy Valley | fragile, ramps, springs, fire and drop, wall and hammer, spikes |
| 2 | Crystal Caves | key `k` + lock blocks `L`, moss `m` (always a low bounce) |
| 3 | Cloud Peaks | one-way clouds `-`, updrafts `\|` |
| 4 | Gear Works (bronze factory) | switch `o` flips blocks `A` (solid while on) and `B` (solid while off) when bounced on or bonked; a block turning solid over the ball waits until the ball leaves. Pushers `(` `)`: a low bounce that launches sideways at a fixed speed |
| 5 | Coral Lagoon (underwater) | portals `1` `2` `3`: each digit appears twice, entering one exits the other keeping the velocity (with a cooldown until the ball leaves it). Water `~`: lower gravity and a slower fall inside |
| 6 | Frost Peaks (ice) | ice `i`: the bounce keeps the horizontal speed and you cannot steer until the next bounce. Thin ice `j`: breaks under a high bounce, holds low ones |
| 7 | Ember Core (volcano) | crumbling block `c`: starts crumbling on first touch, gone 0.6 s later. Vent `!`: 1.5 s lit (deadly) / 1.5 s off (solid) on a fixed, visible rhythm |
| 8 | Star Station (space) | low gravity zone `z` (45% gravity). Bumper `b`: a side hit throws the ball away at a fixed speed; from above it is a normal bounce |
| 9 | Shadow Keep (dark castle) | dark levels (`"dark": true`): only a circle of light around the ball, gems always glow. Phase blocks `%` / `&`: solid and ghost by turns every 1.2 s, always opposite |
| 10 | Rainbow Summit (finale) | rainbow bridge `=`: off until every gem is taken, then solid. The rest remixes every mechanic at the highest difficulty |

## Git

- Main branch `main`. Branches `feat/…`, `fix/…`, `level/…`, `docs/…`, `chore/…`.
- Conventional commits: `feat:`, `fix:`, `level:`, `test:`, `chore:`, `docs:` (also `refactor`,
  `perf`, `style`, `ci`, `build`, `revert`). Enforced by the `commit-msg` hook.
- Commit messages: `type: subject`, imperative mood, lowercase, no trailing period, header ≤ 72
  chars. One logical change per commit; add a body only when the *why* is not obvious.
- Hooks are installed by `pnpm install` (`prepare: husky`). Do not skip them with `--no-verify`.
- Claude Code hooks live in `.claude/settings.json`: after every `Edit`/`Write`, a `PostToolUse`
  hook formats that file with Prettier. Run `pnpm format` after editing files through Bash.
- Every PR fills in `.github/pull_request_template.md`; write “N/A” for sections that do not apply.

## Status

- [x] World 1 — 10 levels, desktop/touch/gamepad controls, PWA, three languages
- [x] Project setup — CI, hooks, browser tests, Lighthouse, docs
- [x] Landing page
- [x] World 2 — Crystal Caves: keys and lock blocks, moss
- [x] World 3 — Cloud Peaks: one-way clouds, updrafts
- [x] World 4 — Gear Works: switches with A/B blocks, pushers
- [x] World 5 — Coral Lagoon: portals, water
- [x] World 6 — Frost Peaks: ice, thin ice
- [x] World 7 — Ember Core: crumbling blocks, vents
- [x] World 8 — Star Station: low-gravity zones, bumpers
- [x] World 9 — Shadow Keep: dark levels, phase blocks
- [x] World 10 — Rainbow Summit: rainbow bridges and a remix of every mechanic
- [x] Native apps — Capacitor iOS and Android projects (iOS verified in the simulator)
- [x] Level editor (computers) and sharing by link, WhatsApp and QR code, with "My levels"
- [ ] Publishing player levels to a shared catalog (accounts, database, moderation)
- [ ] Store release (developer accounts, signing, store listings, privacy policy)
- [x] Public launch — pongui.com on Cloudflare Pages, Search Console, Instagram, YouTube, itch.io
